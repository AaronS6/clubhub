# Deploying ClubHub — Step-by-Step (100% Free)

This guide deploys the entire app using:
- **Supabase** for PostgreSQL (free, 500MB, pauses but never deletes data)
- **Render** for the Next.js web service (free, 512MB RAM)
- **Render** for the realtime socket.io service (free, 512MB RAM)

Total cost: **$0/month**

---

## Prerequisites

1. A **GitHub account** (free)
2. Your ClubHub code pushed to a **GitHub repository**
3. A **Render account** (free — sign up at render.com with GitHub)
4. A **Supabase account** (free — sign up at supabase.com with GitHub)

---

## Step 1: Push your code to GitHub

```bash
git init
git add .
git commit -m "ClubHub production-ready"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/clubhub.git
git push -u origin main
```

> **Important**: `.env` is in `.gitignore` (never commit real secrets). The `.env.example` file is committed as a reference.

---

## Step 2: Create the Supabase database

1. Go to **https://supabase.com** → sign in → **New Project**
2. Fill in:
   - **Name**: `clubhub`
   - **Database Password**: generate a strong one, **save it somewhere safe** (you'll need it)
   - **Region**: closest to you
   - **Plan**: **Free**
3. Click **Create new project** (takes ~2 min)
4. Once ready, go to **Project Settings** (gear icon) → **Database** → **Connection string** → select **URI**
5. Copy the **Connection string**. It looks like:
   ```
   postgresql://postgres.[your-project-ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
   ```
6. Replace `[YOUR-PASSWORD]` with the password you saved in step 2.
7. Add `?connection_limit=3&pool_timeout=10` to the end of the URL (keeps us under Supabase's connection limit). Your final URL should look like:
   ```
   postgresql://postgres.abc123:yourpassword@aws-0-us-east-1.pooler.supabase.com:6543/postgres?connection_limit=3&pool_timeout=10
   ```
   This is your **`DATABASE_URL`** — keep it handy, you'll paste it into Render in Step 5.

> **Why Supabase is great**: It's real PostgreSQL (zero schema changes), 500MB is plenty for a club app, and if it pauses after 7 days of inactivity, **your data is preserved** — just log into the Supabase dashboard (or the app will auto-wake it on the next query).

---

## Step 3: Deploy the realtime service on Render

The realtime socket.io service needs its own public URL so browsers can connect via WebSocket.

1. Go to **https://dashboard.render.com** → **New +** → **Web Service**
2. Connect your GitHub repo
3. Fill in:
   - **Name**: `clubhub-realtime`
   - **Region**: same as your Supabase region
   - **Plan**: **Free**
   - **Runtime**: **Docker**
   - **Dockerfile Path**: `mini-services/realtime/Dockerfile`
   - **Docker Build Context Directory**: `mini-services/realtime`
4. Under **Environment Variables**, add:
   - `REALTIME_TOKEN` → click **Generate** to create a random secret. **Copy this value** — you'll need it for the web service.
   - `PORT` → `3003`
   - `EMIT_PORT` → `3004`
5. Click **Create Web Service**. It builds in ~2 min.
6. Once deployed, Render gives you a public URL like `https://clubhub-realtime.onrender.com`. **Copy this URL** — you'll need it for `NEXT_PUBLIC_REALTIME_URL` in Step 5.

---

## Step 4: Deploy the Next.js web service on Render

1. In the Render dashboard → **New +** → **Web Service**
2. Connect the same GitHub repo
3. Fill in:
   - **Name**: `clubhub-web`
   - **Region**: same as Supabase
   - **Plan**: **Free**
   - **Runtime**: **Docker**
   - **Dockerfile Path**: `./Dockerfile`
4. Under **Environment Variables**, add ALL of these:

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | *(paste your Supabase connection string from Step 2, with the `?connection_limit=3&pool_timeout=10` suffix)* |
   | `NEXTAUTH_SECRET` | *(click **Generate** — a random base64 string)* |
   | `NEXTAUTH_URL` | `https://clubhub-web.onrender.com` *(update after first deploy if Render assigned a different name)* |
   | `ADMIN_CLUB_PASSCODE` | `buildtogether12$` *(or your custom passcode)* |
   | `REALTIME_TOKEN` | *(paste the SAME value you generated in Step 3)* |
   | `REALTIME_EMIT_URL` | `http://clubhub-realtime:3004/emit` *(internal URL — uses Render's service discovery)* |
   | `NEXT_PUBLIC_REALTIME_URL` | `https://clubhub-realtime.onrender.com` *(the realtime service's PUBLIC URL from Step 3)* |
   | `NODE_ENV` | `production` |

5. Click **Create Web Service**. First build takes ~3-5 min.
6. Once deployed, visit your web URL → you should see the ClubHub landing page.
7. If Render assigned a different name than `clubhub-web`, update `NEXTAUTH_URL` to match, then redeploy.

---

## Step 5: Initialize the database

The Dockerfile's startup command runs `npx prisma db push --accept-data-loss` automatically on every deploy — this creates all the tables. So the database is ready as soon as the first deploy completes. **No manual step needed.**

If you ever need to reset the database (e.g. wipe test data), open the Render shell (Shell tab on the web service) and run:
```bash
npx prisma db push --accept-data-loss
```

---

## Step 6: Verify

1. Visit your web URL: `https://clubhub-web.onrender.com`
2. Click **Sign up** → create an account
3. Click **Create a club** → enter the admin passcode: `buildtogether12$`
4. You should land on the dashboard as an executive
5. Open a second browser (incognito) → sign up as a different user → join the club with the code + password → verify realtime sync (create a task in one session, watch it appear in the other within ~1-2 seconds)

---

## Free tier limitations

- **Web service cold starts**: Render free web services sleep after 15 min of inactivity → first request after sleep takes ~30s. Subsequent requests are fast.
- **Supabase pausing**: Free Supabase projects pause after 7 days of inactivity. **Your data is preserved** — the app will auto-wake it on the next query (takes ~2-3s), or log into the Supabase dashboard to unpause manually. To prevent pausing, visit your app at least once a week.
- **750 Render instance-hours/month**: Enough for 1 web service + 1 realtime service always-on without exceeding the limit.

---

## Optional: Email notifications

Email is optional — the app gracefully no-ops without it. To enable:

1. Sign up at **https://resend.com** (free tier: 100 emails/day)
2. Get an API key
3. Add to your web service env vars:
   - `RESEND_API_KEY` → your key
   - `EMAIL_FROM` → `ClubHub <onboarding@resend.dev>` (Resend sandbox sender — only delivers to your account's verified email. Verify your domain at Resend to send to anyone.)

---

## Troubleshooting

**Build fails on Render**: Check the build logs. Common issues:
- Missing env var — make sure all 8 are set in the web service
- Prisma client not generated — the `postinstall` script handles this, but if it fails, add `npx prisma generate` to the build manually

**Database connection errors**:
- Make sure `DATABASE_URL` has the `?connection_limit=3&pool_timeout=10` suffix
- Make sure you replaced `[YOUR-PASSWORD]` with the actual password
- Use the **pooler** connection (port `6543`), not the direct connection (port `5432`)

**Realtime not working** (changes don't sync live):
- If `NEXT_PUBLIC_REALTIME_URL` is wrong/unset, the app **falls back to polling** (every 5-30s) — it still works, just not instant
- Check the realtime service logs — it should show `[realtime] socket connected` when the browser connects

**"Taking a moment to load" screen**:
- This means the `/api/me` call is slow (usually a Supabase cold start or Render cold start)
- Click **Retry** — it should resolve once the connections warm up

**Can't create a club**:
- Make sure `ADMIN_CLUB_PASSCODE` is set to `buildtogether12$` (or your custom value) in the web service env vars
- The passcode is checked server-side — the dialog sends it to `/api/clubs/verify-admin-passcode`

---

## Quick reference: all env vars

| Service | Var | Value |
|---------|-----|-------|
| **Web** | `DATABASE_URL` | Supabase pooler connection string (port 6543) + `?connection_limit=3&pool_timeout=10` |
| Web | `NEXTAUTH_SECRET` | Random base64 (click Generate in Render) |
| Web | `NEXTAUTH_URL` | `https://your-web-name.onrender.com` |
| Web | `ADMIN_CLUB_PASSCODE` | `buildtogether12$` |
| Web | `REALTIME_TOKEN` | Same as realtime service |
| Web | `REALTIME_EMIT_URL` | `http://clubhub-realtime:3004/emit` |
| Web | `NEXT_PUBLIC_REALTIME_URL` | `https://clubhub-realtime.onrender.com` |
| Web | `NODE_ENV` | `production` |
| **Realtime** | `REALTIME_TOKEN` | Same as web service |
| Realtime | `PORT` | `3003` |
| Realtime | `EMIT_PORT` | `3004` |
