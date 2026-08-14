# SAM Compiler: Cloud-Native Deployment Guide

The SAM Compiler is architected for secure, high-scale cloud execution. To enable compiled languages (C++, C, Java) without running local workers, follow the **Docker Monolith** deployment strategy.

---

## Option 1: Render (Recommended Native Node Deployment)

Render is the simplest way to host the SAM API and the built React Web App together in a single "Monolith" instance.

### 1. Create Web Service
1.  **New Web Service** -> **Connect GitHub Repo**.
2.  **Environment**: Select **Node**. (Do NOT select Docker for Monolith mode).
3.  **Root Directory**: Leave blank (this ensures the monorepo root is used).
4.  **Build Command**: `npm install --include=dev && npm run build` (This ensures `vite` is installed and the React app is built).
5.  **Start Command**: `npm start` (This will start the Express API which serves the built React app).

### 2. Environment Variables
| Key | Value |
| :--- | :--- |
| `PORT` | `8080` |
| `NODE_ENV` | `production` |
| `MONGO_URI` | `mongodb+srv://...` |
| `REDIS_URL` | `rediss://...` (Must use rediss:// for Upstash TLS) |
| `WEB_ORIGIN` | `https://sam-compiler-web.vercel.app` (Required if hosting frontend on Vercel) |
| `CALLBACK_URL_BASE` | `https://<your-service>.onrender.com/api/auth` - **must be this service's own hostname** |
| `GITHUB_CLIENT_ID` | Your ID |
| `GITHUB_CLIENT_SECRET` | Your Secret |
| `GOOGLE_CLIENT_ID` | Your ID |
| `GOOGLE_CLIENT_SECRET` | Your Secret |
| `GEMINI_API_KEY` | Your AI Key |

> **Get the hostname right.** `CALLBACK_URL_BASE` must be the origin this
> service actually answers on. Pointing it at a hostname that does not exist
> breaks OAuth (providers redirect users to a 404) and used to break the
> keep-alive heartbeat, which was derived from the same value. The heartbeat now
> prefers Render's own `RENDER_EXTERNAL_URL`, and the API logs a warning at boot
> when `CALLBACK_URL_BASE` disagrees with it - check the logs after a deploy.

### 3. Cold starts on the free tier

Render stops a free instance after 15 idle minutes; the next visitor waits
~30-60s for it to boot. The editor stays usable during that wait (it falls back
to local editing and says so), but to avoid the wait altogether:

- **Keep it warm for free**: the `.github/workflows/keep-alive.yml` workflow
  pings the service every 10 minutes. Set the repository variable
  `KEEP_ALIVE_URL` to `https://<your-service>.onrender.com/api/health`
  (*Settings -> Secrets and variables -> Actions -> Variables*). Without that
  variable the workflow no-ops. Note this keeps the instance running nearly
  around the clock, which consumes most of the free 750 instance-hours a month -
  fine for one service, not for two.
- **Or pay for it**: a Starter instance never idles out, which is the only way
  to remove cold starts entirely.

The API's own heartbeat cannot solve this on its own: once the platform has
stopped the process, nothing inside it runs. It only prevents a *running*
instance from going idle.

---

## Option 2: Railway

1.  **New Project** -> **Deploy from GitHub**.
2.  In **Settings**, set **Root Directory** to `apps/api`.
3.  Add all environment variables from the table above.

---

## OAuth Redirect Configuration

For authentication to work, you **must** update your developer dashboards with the exact callback URLs that include the `/api` prefix:

Use the same hostname you set in `CALLBACK_URL_BASE`.

### GitHub (Authorization callback URL)
```bash
https://<your-service>.onrender.com/api/auth/github/callback
```

### Google (Authorized redirect URIs)
```bash
https://<your-service>.onrender.com/api/auth/google/callback
```

---

## Local "Hybrid" Mode (Dev)

If you are hosting the Frontend on Vercel but haven't deployed the API yet, you can run a local worker to handle execution:

```bash
cd apps/worker
npm start
```
*Note: Ensure your `REDIS_URL` is shared between your cloud API and local worker.*

---

<div align="center">
  <b>SAM Compiler Deployment</b><br>
  <sub>v3.0.0-OBSIDIAN | Precision Engineering in the Cloud</sub>
</div>
