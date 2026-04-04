# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy root workspace files
COPY package*.json ./
# Copy shared package
COPY packages/shared packages/shared
# Copy api app and web app
COPY apps/api apps/api
COPY apps/web apps/web

# Install dependencies (workspaces handle root hoisting)
RUN npm ci --ignore-scripts

# Build the frontend
RUN npm run build -w @sam/web

# Production stage
FROM node:20-slim AS runner

# Install native compilers (Programiz level)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    g++ \
    gcc \
    openjdk-17-jdk-headless \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app /app

EXPOSE 8080

CMD ["npm", "start", "-w", "@sam/api"]
