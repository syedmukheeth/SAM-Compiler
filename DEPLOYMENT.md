# LiquidIDE Deployment Guide

LiquidIDE is a monorepo with three services:

| Service | Platform | Description |
|---|---|---|
| `apps/web` | Vercel | React frontend |
| `apps/api` | Vercel | Express REST API |
| `apps/worker` | Render.com | Code execution worker (Docker) |

---

## Architecture

```
Browser → Vercel API → JavaScript: executes inline (fast)
                     → C++/Java/Python: queues to Redis (BullMQ)
Render Worker → pulls from queue → Docker run → saves to MongoDB
Browser polls → Vercel API reads MongoDB → shows result
```

---

## 1. Vercel — Frontend (`apps/web`)

1. Import `syedmukheeth/Liquid-IDE` on Vercel
2. Set **Root Directory**: `apps/web`
3. Set **Framework**: Vite
4. **Build Settings**: Build Command `npm run build`, Output Directory `dist`, Install Command `npm install --prefix=../..`
5. **Environment Variables**:
   - `VITE_API_URL` = `https://liquid-ide-api.vercel.app`

---

## 2. Vercel — API (`apps/api`)

1. Import `syedmukheeth/Liquid-IDE` on Vercel
2. Set **Root Directory**: `apps/api`
3. Set **Framework**: Express
4. **Environment Variables** (required):
   - `MONGO_URI` = your MongoDB Atlas connection string
   - `REDIS_URL` = your Upstash Redis URL
5. **Environment Variables** (optional):
   - `WEB_ORIGIN` = `https://liquid-ide-web.vercel.app`
   - `JWT_SECRET` = a long random secret string

---

## 3. Render.com — Worker (`apps/worker`)

> The Worker runs C++, Python, Java, and C using Docker containers. Requires Docker access.

1. Go to [render.com](https://render.com) → **New** → **Web Service**
2. Connect your GitHub repo `syedmukheeth/Liquid-IDE`
3. **Settings**:
   - **Name**: `liquid-ide-worker`
   - **Environment**: `Docker`
   - **Dockerfile Path**: `./apps/worker/Dockerfile`
   - **Docker Context**: `.` (project root)
4. **Environment Variables** (required):
   - `MONGO_URI` = same MongoDB Atlas connection string as the API
   - `REDIS_URL` = same Upstash Redis URL as the API
5. Click **Create Web Service**

> ⚠️ Render.com's free plan may sleep the worker after inactivity — consider upgrading to Starter ($7/mo) for always-on execution.

---

## Environment Variable Reference

### API (`apps/api`)
| Variable | Required | Default | Description |
|---|---|---|---|
| `MONGO_URI` | ✅ | — | MongoDB Atlas connection URL |
| `REDIS_URL` | ✅ | — | Upstash/Redis connection URL |
| `WEB_ORIGIN` | | `localhost:5173` | Allowed CORS origin |
| `JWT_SECRET` | | `flux_super_secret...` | JWT signing secret |
| `JWT_EXPIRES_IN` | | `7d` | JWT lifetime |

### Worker (`apps/worker`)
| Variable | Required | Default | Description |
|---|---|---|---|
| `MONGO_URI` | ✅ | — | MongoDB Atlas connection URL |
| `REDIS_URL` | ✅ | — | Upstash/Redis connection URL |
| `RUN_TIMEOUT_MS` | | `10000` | Max execution time per job (ms) |
| `RUN_MEMORY` | | `256m` | Docker memory limit per container |
| `RUN_CPUS` | | `0.5` | Docker CPU limit per container |

### Web (`apps/web`)
| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | ✅ | Full URL to the deployed API |
