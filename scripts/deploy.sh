#!/bin/bash
# ============================================
# LEAD RADAR — Deploy Script
# Run this from CloudShell whenever you update code.
# Usage: bash deploy.sh
# ============================================

REGION="eu-west-1"

echo "🚀 Deploying Lead Radar functions..."

# Deploy each function from its zip
for FNAME in lead-radar-poller lead-radar-scorer lead-radar-drafter lead-radar-api; do
  if [ -f "/tmp/lead-radar/${FNAME}.zip" ]; then
    aws lambda update-function-code \
      --function-name $FNAME \
      --zip-file fileb:///tmp/lead-radar/${FNAME}.zip \
      --region $REGION \
      --output text --query 'FunctionName' > /dev/null \
      && echo "✅ $FNAME deployed" \
      || echo "❌ $FNAME failed"
  else
    echo "⚠️  No zip found for $FNAME — skipping"
  fi
done

echo ""
echo "✅ Deploy complete. Test with:"
echo "aws lambda invoke --function-name lead-radar-poller --region $REGION /tmp/out.json && cat /tmp/out.json"
