# Deployment Guide for LiquidIDE

LiquidIDE is a monorepo containing an API, a Worker, and a Frontend.

## 🚀 Vercel Deployment (Recommended)

### 1. API (`apps/api`)
- **Root Directory**: `apps/api`
- **Framework Preset**: `Express` (Vercel will use the `vercel.json` in `apps/api`)
- **Environment Variables** (Required):
    - `MONGO_URI`: Your MongoDB connection string.
    - `REDIS_URL`: Your Redis connection string (e.g., from Upstash).
- **Environment Variables** (Optional):
    - `WEB_ORIGIN`: Your Frontend URL (e.g., `https://liquid-ide-web.vercel.app`).
    - `JWT_SECRET`: A long random string for security.

### 2. Frontend (`apps/web`)
- **Root Directory**: `apps/web`
- **Framework Preset**: `Vite`
- **Build Settings** (as seen in your screenshot):
    - **Build Command**: `npm run build` (or `vite build`)
    - **Output Directory**: `dist`
    - **Install Command**: `npm install --prefix=../..` (This ensures all workspace dependencies are correctly resolved).
- **Environment Variables**:
    - `VITE_API_URL`: Your deployed API URL (e.g., `https://liquid-ide-api.vercel.app`).

---

## 🛠️ Important Notes

1. **SPA Routing**: I have created `apps/web/vercel.json` which automatically handles routing for your React app. You don't need to change any settings for this.
2. **CORS**: Ensure `WEB_ORIGIN` in your API environment variables matches your Frontend URL to avoid communication issues.
3. **Database**: Since LiquidIDE uses MongoDB and Redis, ensure your connection strings are accessible from Vercel (allow Vercel IPs or use `0.0.0.0/0` in MongoDB Atlas).
