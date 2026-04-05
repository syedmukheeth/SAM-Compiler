# SAM Compiler: Cloud-Native Deployment Guide 🚀

The SAM Compiler is architected for secure, high-scale cloud execution. To enable compiled languages (C++, C, Java) without running local workers, follow the **Docker Monolith** deployment strategy.

---

## ☁️ Option 1: Render (Recommended)

Render is the simplest way to host the Dockerized SAM API.

### 1. Create Web Service
1.  **New Web Service** -> **Connect GitHub Repo**.
2.  **Environment**: Select **Docker**.
3.  **Root Directory**: `apps/api` (Important: Dockerfile is here).

### 2. Environment Variables 🔒
| Key | Value |
| :--- | :--- |
| `PORT` | `8080` |
| `NODE_ENV` | `production` |
| `MONGO_URI` | `mongodb+srv://...` |
| `REDIS_URL` | `rediss://...` (Upstash recommended) |
| `WEB_ORIGIN` | `https://sam-compiler-web.vercel.app` |
| `CALLBACK_URL_BASE` | `https://sam-compiler-api.onrender.com/api/auth` |
| `GITHUB_CLIENT_ID` | Your ID |
| `GITHUB_CLIENT_SECRET` | Your Secret |
| `GOOGLE_CLIENT_ID` | Your ID |
| `GOOGLE_CLIENT_SECRET` | Your Secret |
| `GEMINI_API_KEY` | Your AI Key |

---

## 🚂 Option 2: Railway

1.  **New Project** -> **Deploy from GitHub**.
2.  In **Settings**, set **Root Directory** to `apps/api`.
3.  Add all environment variables from the table above.

---

## 🔐 OAuth Redirect Configuration

For authentication to work, you **must** update your developer dashboards with the exact callback URLs that include the `/api` prefix:

### GitHub (Authorization callback URL)
```bash
https://sam-compiler-api.onrender.com/api/auth/github/callback
```

### Google (Authorized redirect URIs)
```bash
https://sam-compiler-api.onrender.com/api/auth/google/callback
```

---

## 🛠️ Local "Hybrid" Mode (Dev)

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
