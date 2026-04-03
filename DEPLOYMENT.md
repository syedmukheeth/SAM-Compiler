# SAM Compiler Deployment Guide: Cloud-Native Execution 🚀

To achieve a professional, cloud-only experience where you don't need to run a local worker for C++, Java, or C, you must deploy the API as a **Docker Container**.

## Why Docker?
Vercel Serverless is great for JS/Node, but it **does not contain compilers** (g++, gcc, javac). Our Dockerfile is pre-configured with all these tools, allowing the SAM API to execute code directly in the cloud.

---

## Option 1: Render (Recommended)
Render is the easiest way to deploy a Dockerized monorepo.

1.  **Create a New Web Service** on Render.
2.  **Connect your GitHub Repository**.
3.  **Root Directory**: Leave as root or set to `apps/api`.
4.  **Language**: Select **Docker**.
5.  **Docker Command**: Render will automatically find the `Dockerfile` in `apps/api`.
6.  **Environment Variables**:
    *   `PORT`: 8080
    *   `MONGO_URI`: Your MongoDB Connection String (e.g., MongoDB Atlas)
    *   `REDIS_URL`: Your Redis Connection String (Upstash/Aiven)
    *   `NODE_ENV`: production

---

## Option 2: Railway
Railway is also excellent for monorepos.

1.  **New Project** -> **Deploy from GitHub**.
2.  Railway will detect the `Dockerfile`.
3.  In **Settings**, ensure the **Root Directory** is set to `apps/api`.
4.  Add your Environment Variables.

---

## Option 3: Local "Hybrid" Mode (Dev/Testing)
If you prefer to stay on Vercel for the frontend, you **must** run the worker on your local machine to handle compiled languages (C++, Java, C):

```bash
cd apps/worker
npm start
```

Ensure your `REDIS_URL` is the same for both the cloud API and your local worker.

---

## Verifying Cloud Execution
Once deployed on a container platform (Render/Railway), try running this C++ code:
```cpp
#include <iostream>
int main() {
    std::cout << "Hello from the SAM Cloud!" << std::endl;
    return 0;
}
```
---

## 🔐 Authentication & Environment Variables

For social logins and full functionality, ensure the following environment variables are set in your production environment.

### Social Auth Setup (GitHub & Google)
1. **GitHub**: Create an OAuth App in [GitHub Developer Settings](https://github.com/settings/developers).
2. **Google**: Create OAuth Credentials in [Google Cloud Console](https://console.cloud.google.com).
3. Set the redirect URIs to `https://<YOUR_API_DOMAIN>/auth/github/callback` (and Google).

### Required Environment Variables
```env
# Core
NODE_ENV=production
PORT=8080
MONGO_URI=mongodb+srv://...
WEB_ORIGIN=https://<YOUR_FRONTEND_DOMAIN>
JWT_SECRET=your_super_secret_jwt_key

# Execution (Redis for Workers)
REDIS_URL=rediss://...

# Social Auth
CALLBACK_URL_BASE=https://<YOUR_API_DOMAIN>/auth
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

---

<div align="center">
  <b>SAM Compiler Deployment Guide</b><br>
  <i>Ensuring a seamless, professional cloud-hosting experience.</i>
</div>
