#!/bin/bash
# ============================================
# LEAD RADAR — AWS CloudShell Setup Script
# Paste this into AWS CloudShell and hit enter.
# Builds everything automatically.
# ============================================

set -e  # Stop on any error

REGION="eu-west-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo ""
echo "🚀 LEAD RADAR — AWS Setup"
echo "Account: $ACCOUNT_ID | Region: $REGION"
echo "============================================"

# ── STEP 1: DYNAMODB TABLES ─────────────────────────────────────────
echo ""
echo "📦 Creating DynamoDB tables..."

aws dynamodb create-table \
  --table-name leads \
  --attribute-definitions \
    AttributeName=id,AttributeType=S \
    AttributeName=fetchedAt,AttributeType=S \
  --key-schema \
    AttributeName=id,KeyType=HASH \
    AttributeName=fetchedAt,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region $REGION \
  --output text --query 'TableDescription.TableName' 2>/dev/null \
  && echo "✅ Table 'leads' created" \
  || echo "⚠️  Table 'leads' already exists"

aws dynamodb create-table \
  --table-name seen_posts \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --time-to-live-specification Enabled=true,AttributeName=ttl \
  --region $REGION \
  --output text --query 'TableDescription.TableName' 2>/dev/null \
  && echo "✅ Table 'seen_posts' created" \
  || echo "⚠️  Table 'seen_posts' already exists"

aws dynamodb create-table \
  --table-name approval_queue \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region $REGION \
  --output text --query 'TableDescription.TableName' 2>/dev/null \
  && echo "✅ Table 'approval_queue' created" \
  || echo "⚠️  Table 'approval_queue' already exists"

# ── STEP 2: IAM ROLE FOR LAMBDA ──────────────────────────────────────
echo ""
echo "🔐 Creating IAM role for Lambda..."

aws iam create-role \
  --role-name lead-radar-lambda-role \
  --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{
      "Effect":"Allow",
      "Principal":{"Service":"lambda.amazonaws.com"},
      "Action":"sts:AssumeRole"
    }]
  }' \
  --output text --query 'Role.RoleName' 2>/dev/null \
  && echo "✅ IAM role created" \
  || echo "⚠️  IAM role already exists"

# Attach DynamoDB + Lambda basic execution permissions
aws iam attach-role-policy \
  --role-name lead-radar-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess 2>/dev/null \
  && echo "✅ DynamoDB permissions attached" || true

aws iam attach-role-policy \
  --role-name lead-radar-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole 2>/dev/null \
  && echo "✅ Lambda execution permissions attached" || true

# Wait for role to propagate
echo "⏳ Waiting for IAM role to propagate (15s)..."
sleep 15

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/lead-radar-lambda-role"

# ── STEP 3: CREATE PLACEHOLDER LAMBDA FUNCTIONS ──────────────────────
echo ""
echo "⚡ Creating Lambda functions..."

# Create minimal placeholder zip
mkdir -p /tmp/lambda-placeholder
cat > /tmp/lambda-placeholder/index.js << 'EOF'
exports.handler = async () => ({ statusCode: 200, body: "placeholder - deploy real code next" });
EOF
cd /tmp/lambda-placeholder && zip -q placeholder.zip index.js && cd -

for FNAME in lead-radar-poller lead-radar-scorer lead-radar-drafter lead-radar-api; do
  aws lambda create-function \
    --function-name $FNAME \
    --runtime nodejs20.x \
    --role $ROLE_ARN \
    --handler index.handler \
    --zip-file fileb:///tmp/lambda-placeholder/placeholder.zip \
    --timeout 300 \
    --memory-size 256 \
    --region $REGION \
    --output text --query 'FunctionName' 2>/dev/null \
    && echo "✅ Lambda '$FNAME' created" \
    || echo "⚠️  Lambda '$FNAME' already exists"
done

# ── STEP 4: ENVIRONMENT VARIABLES ────────────────────────────────────
echo ""
echo "🔑 Setting environment variables..."
echo ""
echo "Enter your API keys (paste and hit Enter):"
echo ""

read -p "Gemini API Key: " GEMINI_KEY
read -p "Anthropic API Key: " ANTHROPIC_KEY

ENV_VARS="Variables={GEMINI_API_KEY=$GEMINI_KEY,ANTHROPIC_API_KEY=$ANTHROPIC_KEY,DYNAMODB_REGION=$REGION,DYNAMODB_TABLE_LEADS=leads,DYNAMODB_TABLE_SEEN=seen_posts,DYNAMODB_TABLE_QUEUE=approval_queue}"

for FNAME in lead-radar-poller lead-radar-scorer lead-radar-drafter lead-radar-api; do
  aws lambda update-function-configuration \
    --function-name $FNAME \
    --environment "$ENV_VARS" \
    --region $REGION \
    --output text --query 'FunctionName' > /dev/null 2>&1 \
    && echo "✅ Env vars set for $FNAME"
done

# ── STEP 5: EVENTBRIDGE CRON TRIGGER ─────────────────────────────────
echo ""
echo "⏰ Setting up cron trigger (every 30 min)..."

aws events put-rule \
  --name lead-radar-cron \
  --schedule-expression "rate(30 minutes)" \
  --state ENABLED \
  --region $REGION \
  --output text --query 'RuleArn' > /dev/null 2>/dev/null \
  && echo "✅ EventBridge rule created" \
  || echo "⚠️  Rule already exists"

POLLER_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:lead-radar-poller"

aws lambda add-permission \
  --function-name lead-radar-poller \
  --statement-id eventbridge-trigger \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --region $REGION \
  --output text --query 'Statement' > /dev/null 2>/dev/null \
  && echo "✅ Lambda permission for EventBridge added" || true

aws events put-targets \
  --rule lead-radar-cron \
  --targets "Id=poller,Arn=$POLLER_ARN" \
  --region $REGION \
  --output text > /dev/null 2>/dev/null \
  && echo "✅ Poller wired to cron" || true

# ── STEP 6: API GATEWAY ───────────────────────────────────────────────
echo ""
echo "🌐 Creating API Gateway..."

API_ID=$(aws apigatewayv2 create-api \
  --name lead-radar-api \
  --protocol-type HTTP \
  --cors-configuration AllowOrigins="*",AllowMethods="GET,POST,OPTIONS",AllowHeaders="Content-Type" \
  --region $REGION \
  --output text --query 'ApiId' 2>/dev/null)

if [ -n "$API_ID" ]; then
  echo "✅ API Gateway created: $API_ID"

  API_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:lead-radar-api"

  # Create integration
  INTEGRATION_ID=$(aws apigatewayv2 create-integration \
    --api-id $API_ID \
    --integration-type AWS_PROXY \
    --integration-uri "arn:aws:apigatewayv2:${REGION}:lambda:path/2015-03-31/functions/${API_ARN}/invocations" \
    --payload-format-version "2.0" \
    --region $REGION \
    --output text --query 'IntegrationId')

  # Add routes
  for ROUTE in "GET /api/leads" "GET /api/queue" "GET /api/stats" "POST /api/approve"; do
    aws apigatewayv2 create-route \
      --api-id $API_ID \
      --route-key "$ROUTE" \
      --target "integrations/$INTEGRATION_ID" \
      --region $REGION \
      --output text --query 'RouteId' > /dev/null
  done

  # Deploy
  aws apigatewayv2 create-stage \
    --api-id $API_ID \
    --stage-name production \
    --auto-deploy \
    --region $REGION \
    --output text --query 'StageName' > /dev/null

  # Allow API Gateway to invoke Lambda
  aws lambda add-permission \
    --function-name lead-radar-api \
    --statement-id api-gateway-invoke \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --region $REGION \
    --output text --query 'Statement' > /dev/null 2>/dev/null || true

  API_URL="https://${API_ID}.execute-api.${REGION}.amazonaws.com/production"
  echo "✅ API live at: $API_URL"
else
  echo "⚠️  API Gateway already exists or failed - check console"
fi

# ── DONE ─────────────────────────────────────────────────────────────
echo ""
echo "============================================"
echo "✅ LEAD RADAR INFRASTRUCTURE READY"
echo "============================================"
echo ""
echo "DynamoDB tables:  leads, seen_posts, approval_queue"
echo "Lambda functions: poller, scorer, drafter, api"
echo "Cron:             every 30 minutes"
if [ -n "$API_URL" ]; then
echo "API URL:          $API_URL"
fi
echo ""
echo "NEXT STEP: Deploy real code"
echo "Run: bash deploy.sh"
echo ""
