#!/bin/bash
# ============================================
# LEAD RADAR — VPS Setup Script
# Run this once on your Hetzner/Vultr VPS
# ============================================

echo "Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "Setting up project..."
cd /root/lead-radar
cp .env.example .env
echo ">> Edit .env with your real keys: nano .env"

echo "Setting up cron jobs..."
# Add to crontab: poll + score + draft every 30 minutes
(crontab -l 2>/dev/null; echo "*/30 * * * * cd /root/lead-radar && node services/poller.js >> /var/log/radar-poll.log 2>&1") | crontab -
(crontab -l 2>/dev/null; echo "*/30 * * * * cd /root/lead-radar && sleep 120 && node services/scorer.js >> /var/log/radar-score.log 2>&1") | crontab -
(crontab -l 2>/dev/null; echo "*/30 * * * * cd /root/lead-radar && sleep 240 && node services/drafter.js >> /var/log/radar-draft.log 2>&1") | crontab -

echo "Starting API server with PM2..."
npm install -g pm2
pm2 start services/api.js --name "lead-radar-api"
pm2 startup
pm2 save

echo ""
echo "✅ Done. Cron runs every 30 min."
echo "✅ API running on port 3001."
echo ""
echo "Test manually:"
echo "  node services/poller.js"
echo "  node services/scorer.js"  
echo "  node services/drafter.js"
