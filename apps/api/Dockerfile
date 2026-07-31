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
RUN npm ci

# Build the frontend
RUN npm run build -w @sam/web

# Production stage
FROM node:20-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# NOTE: the language toolchains (g++, gcc, openjdk, python3) that used to be
# installed here have been removed. This image no longer executes user code - # runs.service delegates to the worker or the cloud fallback - so they were
# unused attack surface and a large amount of image weight.

# Copy only what the API actually needs at runtime, rather than the entire
# builder stage (which carried dev dependencies and the web sources too).
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/api ./apps/api
COPY --from=builder /app/apps/web/dist ./apps/web/dist

# Drop root.
USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:8080/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["npm", "start", "-w", "@sam/api"]
