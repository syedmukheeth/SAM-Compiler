# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# API origin is baked into the bundle at build time.
ARG VITE_API_URL=http://localhost:8080
ENV VITE_API_URL=$VITE_API_URL
ENV NODE_ENV=production

# Copy root workspace files
COPY package*.json ./
# Copy web app
COPY apps/web apps/web

# Install dependencies. Not --workspace-scoped: the build needs the root
# devDependencies (eslint plugins, prettier) resolved too.
RUN npm ci

# Build the app
RUN npm run build -w @sam/web

# Production stage
FROM nginx:alpine AS runner

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
