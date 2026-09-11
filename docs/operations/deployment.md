# Production Deployment Guide (Render + Vercel + MongoDB Atlas)

## Overview

Recon is engineered for zero-cost, high-reliability deployment on modern free-tier cloud infrastructure:
- **Backend API**: [Render](https://render.com) Web Service (`Node.js`, free plan) deployed via [`render.yaml`](file:///d:/Prorgram/Project/taro/render.yaml).
- **Frontend App**: [Vercel](https://vercel.com) Edge/Next.js Platform deployed via [`apps/web/vercel.json`](file:///d:/Prorgram/Project/taro/apps/web/vercel.json).
- **Database**: [MongoDB Atlas](https://www.mongodb.com/atlas) M0 Free Tier cluster (512MB shared storage, automated TLS/SSL).
- **Transactional Email**: [Resend](https://resend.com) API free tier (100 emails/day, 3,000/month).

---

## 1. Database Provisioning: MongoDB Atlas

1. **Create Free M0 Cluster**:
   - Log in to [MongoDB Atlas](https://cloud.mongodb.com/).
   - Click **Create Deployment** → Select **M0 Free** tier.
   - Choose a cloud provider region (e.g. `AWS / us-east-1`).
2. **Network Security & Access**:
   - Navigate to **Security** → **Network Access**.
   - Click **Add IP Address** → Choose **Allow Access from Anywhere** (`0.0.0.0/0`) to allow dynamic cloud workers on Render to connect.
3. **Database User Credentials**:
   - Navigate to **Security** → **Database Access**.
   - Add a new user (e.g. `recon_app`), generate a secure password, and grant `readWriteAnyDatabase` privileges.
4. **Connection String**:
   - Click **Connect** → **Drivers** (Node.js).
   - Copy URI: `mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/recon_prod?retryWrites=true&w=majority`

---

## 2. Backend Deployment: Render Web Service

The backend repository includes a committed Render Blueprint specification in [`render.yaml`](file:///d:/Prorgram/Project/taro/render.yaml).

### Option A: Deploy via Blueprint (Recommended)
1. In your Render Dashboard, click **New +** → **Blueprint**.
2. Connect your `Recon` GitHub repository.
3. Render reads `render.yaml` and initializes the `recon-api` web service automatically.
4. Supply the required sync environment variables:
   - `MONGODB_URI`: Your MongoDB Atlas URI.
   - `GEMINI_API_KEY` (or `GROQ_API_KEY`): Production LLM API key.
   - `RESEND_API_KEY`: Production email delivery key.
   - `ALLOWED_ORIGINS`: Your Vercel frontend URL (e.g., `https://recon-web.vercel.app`).
5. Click **Apply**. Render will run:
   ```bash
   npm install && npm run build:api
   node dist/src/api/index.js
   ```

### Option B: Manual Web Service Setup
- **Name**: `recon-api`
- **Runtime**: `Node`
- **Build Command**: `npm install && npm run build:api`
- **Start Command**: `node dist/src/api/index.js`
- **Health Check Path**: `/api/health`

---

## 3. Frontend Deployment: Vercel

1. Log in to [Vercel](https://vercel.com) and click **Add New...** → **Project**.
2. Import the `Recon` repository.
3. In **Project Settings**:
   - **Root Directory**: Select `apps/web`.
   - **Framework Preset**: `Next.js`.
4. Add **Environment Variables**:
   | Variable | Value | Description |
   | :--- | :--- | :--- |
   | `API_URL` | `https://recon-api.onrender.com` | Base URL of the Render backend |
   | `NEXT_PUBLIC_APP_URL` | `https://recon.vercel.app` | Production frontend domain |
5. Click **Deploy**. Vercel will build and launch the Next.js frontend with automated SSL and edge caching.

---

## 4. Production Health Verification

Once both services are running, verify the backend health check endpoint:

```bash
curl -i https://recon-api.onrender.com/api/health
```

Expected HTTP `200 OK` Response:
```json
{
  "status": "ok",
  "db": "connected",
  "llm": "configured",
  "timestamp": "2026-09-12T00:00:00.000Z",
  "service": "@taro/server"
}
```

---

## 5. Production Smoke Testing Checklist

- [ ] Register a new account with real email verification via Resend OTP.
- [ ] Log in and verify that the `taro_session` cookie is attached with `HttpOnly`, `SameSite=Lax`, and `Secure`.
- [ ] Submit a live Job Description and company URL on the dashboard.
- [ ] Confirm real-time polling progress updates through all 5 generation stages.
- [ ] Open the generated kit: verify Study Schedule, Question Bank, 3D Flashcards, and Weak-Spot Gap Radar.
- [ ] Launch an AI Mock Interview: verify microphone input, voice playback, code editor, timer, and diagnostic repeating error report.
- [ ] Run the headless evaluation CLI against Section 9 cases:
  ```bash
  npm run evaluate -- --input tests/cli/fixtures/test-cases.json --output tmp/results.json --mock
  ```
