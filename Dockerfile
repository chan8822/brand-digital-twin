# Use the same Node version you are using on Replit
FROM node:24-slim

# Enable pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Set the working directory
WORKDIR /app

# Copy all your workspace files into the container
COPY . .

# TRICK THE BOUNCER: Force the environment variable so the preinstall script passes
ENV npm_config_user_agent="pnpm/9.0.0"

# Install dependencies for the whole monorepo
RUN pnpm install

# Build only the API server
RUN pnpm --filter @workspace/api-server run build

# Expose the port Google Cloud expects
EXPOSE 8080

# The command to start the API in production mode
CMD ["pnpm", "--filter", "@workspace/api-server", "run", "start"]