# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy root workspace files
COPY package*.json ./
# Copy web app
COPY apps/web apps/web

# Install dependencies
RUN npm ci --workspace=@liquidide/web

# Build the app
RUN npm run build -w @liquidide/web

# Production stage
FROM nginx:alpine AS runner

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
