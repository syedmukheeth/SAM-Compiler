FROM node:20-slim

WORKDIR /app

# Install Docker CLI and runtimes (needed for both sandboxed and fallback execution)
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     docker.io \
     ca-certificates \
     openjdk-17-jdk-headless \
     g++ \
     gcc \
     python3 \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# Copy workspace root files
COPY package*.json ./

# Copy only the packages needed by the worker
COPY apps/worker ./apps/worker
COPY packages/shared ./packages/shared

# Install only worker workspace deps
RUN npm ci --workspace=@sam/worker --ignore-scripts

CMD ["node", "apps/worker/src/worker.js"]
