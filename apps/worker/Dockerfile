FROM node:20-slim

WORKDIR /app

# Docker CLI is required to launch the hardened sandbox containers. The language
# toolchains are NOT installed here: user code is compiled and run inside the
# per-run sandbox image, not in the worker itself.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     docker.io \
     ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# Copy workspace root files
COPY package*.json ./

# Copy only the packages needed by the worker
COPY apps/worker ./apps/worker
COPY packages/shared ./packages/shared

# Install only worker workspace deps
RUN npm ci --workspace=@sam/worker --ignore-scripts

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3001/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# NOTE: this service intentionally runs as root — it needs access to the mounted
# docker.sock to create sandbox containers. Keep it isolated from other services.
CMD ["node", "apps/worker/src/worker.js"]
