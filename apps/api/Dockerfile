# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy root workspace files
COPY package*.json ./
# Copy shared package
COPY packages/shared packages/shared
# Copy api app
COPY apps/api apps/api

# Install dependencies (only what's needed for api)
RUN npm ci --workspace=@liquidide/api --workspace=@liquidide/shared

# Production stage
FROM node:20-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app /app

EXPOSE 8080

CMD ["npm", "start", "-w", "@liquidide/api"]
