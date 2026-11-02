#!/usr/bin/env bash
# Deploy to the server: copy the code, rebuild the containers, restart.
#   ./deploy.sh
# Needs DEPLOY_HOST (user@host) in .deploy.env, or exported. The key defaults to ~/.ssh/oracle_solarkb (DEPLOY_KEY).
# The server's own .env (API keys, DB password, DOMAIN) is never touched: it only lives on the server.
set -euo pipefail
cd "$(dirname "$0")"
[ -f .deploy.env ] && . ./.deploy.env
: "${DEPLOY_HOST:?set DEPLOY_HOST=user@host in .deploy.env}"
KEY="${DEPLOY_KEY:-$HOME/.ssh/oracle_solarkb}"

echo "-> copying code to $DEPLOY_HOST"
rsync -az --delete -e "ssh -i $KEY" \
  --exclude node_modules --exclude dist --exclude .git --exclude '.env*' --exclude .deploy.env \
  --exclude debug --exclude Design --exclude eval-results.json \
  ./ "$DEPLOY_HOST:~/solar-kb/"

echo "-> rebuilding and restarting"
ssh -i "$KEY" "$DEPLOY_HOST" 'cd ~/solar-kb && docker compose -f docker-compose.prod.yml -f docker-compose.edge.yml up -d --build && docker image prune -f >/dev/null && docker compose -f docker-compose.prod.yml -f docker-compose.edge.yml ps --format "{{.Service}}  {{.Status}}"'
echo "done"
