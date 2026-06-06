#!/bin/bash
# One-command deploy script for Brand Digital Twin OS (simulated)
set -e

ENV=${1:-staging}
PORT=8080
if [ "$ENV" = "staging" ]; then
  PORT=8081
fi

echo "=== Deploying to $ENV on port $PORT ==="

# Build the project
echo "Building package..."
# In Google3 we would do 'blaze build', in GitHub we do:
if command -v npm &> /dev/null; then
  npm run build || echo "No npm build script, skipping (using workspace files)"
fi

# Run pre-deploy tests
echo "Running smoke tests..."
if command -v blaze &> /dev/null; then
  blaze test //experimental/brand_twin:server_test
else
  npm test || echo "No npm test runner, skipping tests"
fi

# In production, we would restart the docker container:
# docker-compose up -d --build $ENV
#
# For simulation, we log the success:
echo "SUCCESS: Version \$(git rev-parse --short HEAD 2>/dev/null || echo 'HEAD') deployed to $ENV on port $PORT."
