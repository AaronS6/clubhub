# Deploying ClubHub — Step-by-Step (100% Free)

This guide deploys the entire app to **Render's free tier** using:
- **PostgreSQL** database (free, 1GB)
- **Web service** for the Next.js app (free, 512MB RAM)
- **Background worker** for the realtime socket.io service (free, 512MB RAM)

Total cost: **$0/month**. The free tier sleeps after 15 min of inactivity and
wakes on the next request (takes ~30s). For a club tool with light traffic,
this is perfectly fine.

---

## Prerequisites

1. A **GitHub account** (free).
2. Your ClubHub code pushed to a **GitHub repository** (public or private).
3. A **Render account** (free, sign up at render.com with your GitHub account).

---

## Step 1: Push your code to GitHub

If you haven't already, create a GitHub repo and push:

```bash
git init
git add .
git commit -m "ClubHub production-ready"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/clubhub.git
git push -u origin main
```

**Important**: Make sure `.env` is in `.gitignore` (it is by default). Never
commit your real secrets. The `.env.example` file is committed as a reference.

---

## Step 2: Create the PostgreSQL database on Render

1. Go to **https://dashboard.render.com** and sign in with GitHub.
2. Click **New +** → **PostgreSQL**.
3. Fill in:
   - **Name**: `clubhub-db`
   - **Database**: `clubhub` (leave blank to auto-create)
   - **User**: `clubhub` (leave blank to auto-create)
   - **Region**: closest to you
   - **Plan**: **Free** (1GB storage, 90 days — recreated on activity)
4. Click **Create Database**.
5. Once created, copy the **Internal Database URL** — you'll need it in Step 4.
   It looks like: `postgresql://clubhub:password@host.render.com:5432/clubhub`

---

## Step 3: Deploy the realtime worker service

The realtime socket.io service runs as a background worker (it holds persistent
WebSocket connections, so it can't be serverless).

1. In the Render dashboard, click **New +** → **Worker**.
2. Fill in:
   - **Name**: `clubhub-realtime`
   - **Region**: same as your database
   - **Plan**: **Free**
   - **Runtime**: **Docker**
   - **Dockerfile Path**: `mini-services/realtime/Dockerfile`
   - **Docker Build Context Directory**: `mini-services/realtime`
3. Under **Environment Variables**, add:
   - `REALTIME_TOKEN` → click **Generate** to create a random secret. **Copy this value** — you'll need it for the web service.
   - `EMIT_PORT` → `3004`
4. Click **Create Worker**. It will build and start.
5. Once running, note the worker's **internal hostname** (shown on the service
   page sidebar): something like `clubhub-realtime`. The web service will reach
   the emit API at `http://clubhub-realtime:3004/emit`.

> **Note**: Render free workers don't have a public URL by default. For the
> browser to connect via WebSocket, you need a public URL. Two options:
> - **Option A (simplest)**: Use Render's internal service discovery — the web
>   service talks to the worker internally via `http://clubhub-realtime:3004/emit`.
>   The browser connects via the web service's domain (you'd proxy `/socket.io`
>   or just accept that realtime falls back to polling). This is the simplest
>   free setup.
> - **Option B (full realtime)**: Deploy the realtime service as a **Web Service**
>   instead of a Worker (so it gets a public URL). This uses a second free web
>   service slot (Render allows multiple free services). The browser connects
>   directly to `wss://clubhub-realtime.onrender.com`.

**Recommended: Option B** for full realtime. Create it as a **Web Service** (not
Worker), plan **Free**, runtime **Docker**, same Dockerfile. Set `PORT=3003`.
Render gives it a public URL like `https://clubhub-realtime.onrender.com`.

---

## Step 4: Deploy the Next.js web service

1. In the Render dashboard, click **New +** → **Web Service**.
2. Connect your GitHub repo.
3. Fill in:
   - **Name**: `clubhub-web`
   - **Region**: same as your database
   - **Plan**: **Free**
   - **Runtime**: **Docker**
   - **Dockerfile Path**: `./Dockerfile`
4. Under **Environment Variables**, add ALL of these:

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | *(paste the Internal Database URL from Step 2)* |
   | `NEXTAUTH_SECRET` | *(click Generate — a random base64 string)* |
   | `NEXTAUTH_URL` | `https://clubhub-web.onrender.com` *(your web service's public URL — update after first deploy if different)* |
   | `ADMIN_CLUB_PASSCODE` | `buildtogether12$` *(or your custom passcode)* |
   | `REALTIME_TOKEN` | *(paste the same value you generated in Step 3)* |
   | `REALTIME_EMIT_URL` | `http://clubhub-realtime:3004/emit` *(internal URL to the worker's emit API)* |
   | `NEXT_PUBLIC_REALTIME_URL` | `https://clubhub-realtime.onrender.com` *(the worker's PUBLIC URL — only if you used Option B in Step 3; otherwise leave blank and realtime falls back to polling)* |
   | `NODE_ENV` | `production` |

5. Click **Create Web Service**. The first build takes ~3-5 minutes.
6. Once deployed, Render gives you a public URL like
   `https://clubhub-web.onrender.com`. Visit it — you should see the ClubHub
   landing page.
7. **Update `NEXTAUTH_URL`** to match the exact URL Render assigned (if it
   differs from what you guessed), then redeploy.

---

## Step 5: Initialize the database

The Dockerfile's startup command runs `npx prisma db push --accept-data-loss`
automatically on every deploy, which creates all the tables. So the database
is ready as soon as the first deploy completes — no manual step needed.

If you ever need to reset the database, you can run the same command from the
Render shell (Shell tab on the web service):

```bash
npx prisma db push --accept-data-loss
```

---

## Step 6: Verify

1. Visit your web URL (`https://clubhub-web.onrender.com`).
2. Click **Sign up**, create an account.
3. Click **Create a club**, enter the admin passcode (`buildtogether12$`).
4. You should land on the dashboard as an executive.
5. Open a second browser (incognito), sign up as a different user, join the
   club with the code + password. Verify realtime sync works (create a task in
   one session, watch it appear in the other).

---

## Free tier limitations to know

- **Cold starts**: Free web services sleep after 15 min of inactivity. The first
  request after sleep takes ~30s to wake up. Subsequent requests are fast.
- **Database expiry**: Free PostgreSQL databases are deleted after 90 days of
  inactivity. To prevent this, visit your app at least once every 90 days (or
  upgrade to the $7/month plan for persistent storage).
- **750 hours/month**: Free tier includes 750 instance-hours per month across
  all free services — enough for one always-on web service + one always-on
  worker without exceeding the limit.
- **512MB RAM**: Sufficient for a club app. If you see OOM errors, you may need
  the paid tier.

---

## Optional: Email notifications

Email is optional (the app gracefully no-ops without it). To enable:

1. Sign up at **https://resend.com** (free tier: 100 emails/day).
2. Get an API key.
3. Add to your web service env vars:
   - `RESEND_API_KEY` → your key
   - `EMAIL_FROM` → `ClubHub <onboarding@resend.dev>` (sandbox sender; only
     delivers to your Resend account email. Verify your domain to send to anyone.)

---

## Troubleshooting

**Build fails on Render**: Check the build logs. The most common issue is a
missing env var. The `postinstall` script runs `prisma generate` automatically.

**Database connection errors**: Make sure `DATABASE_URL` is set to the
**Internal** Database URL (not the external one) for lower latency. Both work.

**Realtime not working**: If you used Option A (no public realtime URL), the
app falls back to polling (every 5-30s depending on the view). It still works,
just not instant. For full realtime, use Option B and set
`NEXT_PUBLIC_REALTIME_URL`.

**"Taking a moment to load" screen**: This means the `/api/me` call is slow
(usually a cold-start database connection). Click Retry — it should resolve
once the database connection warms up.

---

## Quick reference: all env vars

| Service | Var | Value |
|---------|-----|-------|
| Web | `DATABASE_URL` | Render Postgres internal URL |
| Web | `NEXTAUTH_SECRET` | Random base64 string |
| Web | `NEXTAUTH_URL` | `https://your-app.onrender.com` |
| Web | `ADMIN_CLUB_PASSCODE` | `buildtogether12$` |
| Web | `REALTIME_TOKEN` | Same as realtime service |
| Web | `REALTIME_EMIT_URL` | `http://clubhub-realtime:3004/emit` |
| Web | `NEXT_PUBLIC_REALTIME_URL` | `https://clubhub-realtime.onrender.com` (or leave blank) |
| Web | `NODE_ENV` | `production` |
| Realtime | `REALTIME_TOKEN` | Same as web service |
| Realtime | `PORT` | `3003` |
| Realtime | `EMIT_PORT` | `3004` |
