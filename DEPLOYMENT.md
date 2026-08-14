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
| `CALLBACK_URL_BASE` | Optional. Leave unset and it is derived from `RENDER_EXTERNAL_URL`. Only set it when a custom domain fronts the service, and then it **must** be that domain. |
| `GITHUB_CLIENT_ID` | Your ID |
| `GITHUB_CLIENT_SECRET` | Your Secret |
| `GOOGLE_CLIENT_ID` | Your ID |
| `GOOGLE_CLIENT_SECRET` | Your Secret |
| `GEMINI_API_KEY` | Your AI Key |

> **Get the hostname right.** Whatever `CALLBACK_URL_BASE` resolves to is where
> OAuth providers hand users back, so it has to be an origin this service
> answers on. Pointing it at a hostname that does not exist sends everyone who
> signs in to a 404, and it used to break the keep-alive heartbeat too, since
> that was derived from the same value.
>
> Both now prefer Render's own `RENDER_EXTERNAL_URL`, and at boot the API probes
> the callback host and logs `OAuth callback host verified` - or an error naming
> the exact value to fix. Check the deploy logs for that line.

### 3. Cold starts on the free tier

Render stops a free instance after 15 idle minutes; the next visitor waits
~30-60s for it to boot. The editor stays usable during that wait (it falls back
to local editing and says so), but to avoid the wait altogether:

- **Keep it warm for free**: the `.github/workflows/keep-alive.yml` workflow
  pings the service every 10 minutes and needs no setup - it defaults to this
  repository's own deployment and only runs on the upstream repository, so forks
  never ping it. Point it elsewhere by setting the repository variable
  `KEEP_ALIVE_URL` (*Settings -> Secrets and variables -> Actions -> Variables*)
  to `https://<your-service>.onrender.com/api/health`. Note this keeps the
  instance running nearly around the clock, which consumes most of the free 750
  instance-hours a month - fine for one service, not for two.
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
