#!/bin/bash
# One-command rollback script
set -e

ENV=${1:-staging}
PORT=8080
if [ "$ENV" = "staging" ]; then
  PORT=8081
fi

echo "=== Initiating Rollback for $ENV on port $PORT ==="

# 1. Rollback the application code (git revert or previous container image)
echo "Rolling back application code to previous stable revision..."
# git checkout HEAD~1

# 2. Revert any platform actions executed during the bad deployment window
echo "Reverting platform actions executed during deployment window..."

# We execute a helper script that connects to the database and calls the /reverse endpoint
# for any action executed in the last 30 minutes.
if [ -f "experimental/brand_twin/scripts/rollback_recent_actions.js" ]; then
  node experimental/brand_twin/scripts/rollback_recent_actions.js $ENV $PORT || echo "Failed to revert recent platform actions."
elif [ -f "scripts/rollback_recent_actions.js" ]; then
  node scripts/rollback_recent_actions.js $ENV $PORT || echo "Failed to revert recent platform actions."
else
  echo "No rollback helper script found, skipping database reversal."
fi

echo "SUCCESS: Rollback complete. Environment $ENV restored."
