# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Install docker client (worker needs to call docker)
RUN apt-get update && apt-get install -y docker.io && rm -rf /var/lib/apt/lists/*

# Copy root workspace files
COPY package*.json ./
# Copy worker app
COPY apps/worker apps/worker

# Install dependencies
RUN npm ci --workspace=@liquidide/worker

# Production stage
FROM node:20-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# Install docker client in runner too
RUN apt-get update && apt-get install -y docker.io && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app /app

CMD ["npm", "start", "-w", "@liquidide/worker"]
