# Deploying ClubHub — Single Service (100% Free)

This guide deploys ClubHub using:
- **Supabase** for PostgreSQL (free, 500MB, pauses but never deletes data)
- **Render** for ONE Next.js web service (free, 512MB RAM)

**Total cost: $0/month. Total Render hours: ~720/month (under the 750 free limit).**

Realtime push is disabled — the app uses polling (5-30s intervals) which is plenty fast for a club app. You can enable realtime later if needed (see the end of this guide).

---

## PREREQUISITES (5 min)

Create 3 free accounts:

1. **GitHub** — https://github.com/signup
2. **Render** — https://render.com → Sign Up → "Sign up with GitHub"
3. **Supabase** — https://supabase.com → "Start your project" → "Sign in with GitHub"

---

## STEP 1: Push Your Code to GitHub (5 min)

### 1.1 Create a GitHub repository

1. Go to **https://github.com/new**
2. Fill in:
   - **Repository name**: `clubhub`
   - **Visibility**: **Private** (recommended)
   - **DO NOT** check "Add a README file"
3. Click **Create repository**
4. Copy the repo URL: `https://github.com/YOUR_USERNAME/clubhub.git`

### 1.2 Push your code

Open a terminal in the project folder and run:

```bash
git init
git add .
git commit -m "ClubHub production-ready"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/clubhub.git
git push -u origin main
```

> If asked for credentials, use a GitHub Personal Access Token (GitHub Settings → Developer settings → Personal access tokens → Generate new token → check "repo" scope → use it as your password).

### ✅ Checkpoint
Visit `https://github.com/YOUR_USERNAME/clubhub` — you should see all your files.

---

## STEP 2: Create the Supabase Database (5 min)

### 2.1 Create a project

1. Go to **https://supabase.com/dashboard**
2. Click **New project**
3. Fill in:
   - **Name**: `clubhub`
   - **Organization**: create one if prompted (name it anything)
   - **Database Password**: click **Generate a password** → **COPY AND SAVE THIS** somewhere safe
   - **Region**: closest to you
   - **Plan**: **Free**
4. Click **Create new project**
5. Wait ~2 minutes for provisioning

### 2.2 Get your connection string

1. Once ready, click the **gear icon** (Project Settings) in the bottom-left
2. Click **Database**
3. Scroll to **Connection string** → select **URI**
4. You'll see:
   ```
   postgresql://postgres.abc123xyz:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   ```
5. **Copy this URL**

### 2.3 Build your final DATABASE_URL

Take the URL from step 2.2 and:
1. Replace `[YOUR-PASSWORD]` with the password you saved in step 2.1
2. Add `?connection_limit=3&pool_timeout=10` to the end

**Final result looks like:**
```
postgresql://postgres.abc123xyz:aB3xK9mN2pQ7rT4v@aws-0-us-east-1.pooler.supabase.com:6543/postgres?connection_limit=3&pool_timeout=10
```

**Save this string** — you'll paste it into Render in Step 4.

### ✅ Checkpoint
You have a string starting with `postgresql://postgres.` and ending with `?connection_limit=3&pool_timeout=10`.

---

## STEP 3: Generate a NextAuth Secret (1 min)

You need a random secret for session signing. You'll do this in Render (Step 4) by clicking "Generate" — but if you want to prepare it now:

Run in a terminal:
```bash
openssl rand -base64 32
```

Copy the output (something like `K7mN2pQ7rT4vWxYz9aB3xK9mN2pQ7rT4v...=`).

**Save this value.**

---

## STEP 4: Deploy the Web Service on Render (5 min)

### 4.1 Create the service

1. Go to **https://dashboard.render.com**
2. Click **New +** (top right) → **Web Service**
3. Connect your GitHub account if prompted
4. Find your `clubhub` repo → click **Connect**

### 4.2 Configure the service

Fill in:

| Field | Value |
|-------|-------|
| **Name** | `clubhub-web` |
| **Region** | Same as your Supabase region |
| **Branch** | `main` |
| **Runtime** | **Docker** |
| **Dockerfile Path** | `./Dockerfile` |
| **Plan** | **Free** |

### 4.3 Add environment variables

Scroll to **Environment Variables**. Add each one by clicking **Add Environment Variable**:

| # | Key | Value |
|---|-----|-------|
| 1 | `DATABASE_URL` | Paste your Supabase connection string from Step 2.3 |
| 2 | `NEXTAUTH_SECRET` | Click **Generate** (or paste the one from Step 3) |
| 3 | `NEXTAUTH_URL` | `https://clubhub-web.onrender.com` (we'll verify this after deploy) |
| 4 | `ADMIN_CLUB_PASSCODE` | `buildtogether12$` |
| 5 | `NODE_ENV` | `production` |

**That's only 5 env vars** — no realtime vars needed since we're using polling.

### 4.4 Deploy

1. Scroll to the bottom → click **Create Web Service**
2. The build takes **3-5 minutes**. Watch for:
   - `✔ Generated Prisma Client` — Prisma client generated
   - `✓ Compiled successfully` — Next.js build succeeded
3. When done, you'll see **Live** in green

### 4.5 Verify the URL

1. Copy your web service URL from the top of the page (e.g., `https://clubhub-web.onrender.com`)
2. Check that `NEXTAUTH_URL` matches it exactly
3. If Render assigned a different name, update `NEXTAUTH_URL`, then click **Manual Deploy** → **Deploy latest commit**

### ✅ Checkpoint
- Web service shows **Live**
- All 5 env vars are set
- `NEXTAUTH_URL` matches the actual URL

---

## STEP 5: Database Auto-Initializes (0 min — automatic)

**Nothing to do here.** The Dockerfile runs `npx prisma db push` on startup, which creates all database tables automatically. By the time the web service shows **Live**, your database is ready.

If you ever need to manually reset the database:
1. Go to your web service → **Shell** tab
2. Run: `npx prisma db push --accept-data-loss`

---

## STEP 6: Verify Everything Works (5 min)

### 6.1 Visit your app

1. Open `https://clubhub-web.onrender.com` in your browser
2. You should see the ClubHub landing page with "Run your clubs like a team."

> **First load may take ~30 seconds** — Render free services sleep after 15 min idle and need to wake up. Subsequent loads are fast.

### 6.2 Create your first account

1. Click **Sign up**
2. Fill in:
   - **Full name**: `Admin User`
   - **Email**: your email
   - **Password**: at least 8 chars with a letter and number (e.g., `ClubAdmin2024!`)
3. Click **Create account**
4. You'll see the "Welcome to ClubHub" onboarding screen

### 6.3 Create your first club

1. Click **Create a club**
2. Fill in:
   - **Club name**: `Test Club` (or your real club name)
   - **Description**: `My first club`
   - **Accent color**: pick any color
   - **Club password**: something members use to join (e.g., `clubpass123`) — min 4 chars
   - **Admin passcode**: `buildtogether12$` ← required to create a club
3. Click **Create club**
4. You should land on the dashboard as an **Executive**

### 6.4 Test multi-user (polling sync)

1. **Copy your club code** (shown on the dashboard, e.g., `ABC123`)
2. **Open an incognito/private window** (Ctrl+Shift+N)
3. Go to your app URL
4. Click **Sign up** → create a SECOND account with a different email
5. Click **Join a club with a code**
6. Enter:
   - **Club code**: the code from step 1
   - **Club password**: the password you set in step 3
7. Click **Join**
8. Now you have two sessions: Executive (window 1) and Member (window 2)

### 6.5 Test polling sync

1. In **Window 1** (executive): go to **Tasks** → **New Task** → create "Test sync"
2. Switch to **Window 2** (member): go to **Tasks** → wait up to **5 seconds** → "Test sync" should appear

> With polling (no realtime), updates take 5-30 seconds to sync between users. This is normal and fine for a club app.

### ✅ Final Checkpoint
- ✅ App loads at `https://clubhub-web.onrender.com`
- ✅ You can sign up and create a club with `buildtogether12$`
- ✅ A second user can join with the club code + password
- ✅ Task creation in one window appears in the other within ~5 seconds

**You're live!** 🎉

---

## POST-DEPLOY: Keep It Free

### Prevent Supabase from pausing (recommended)

Supabase pauses free databases after 7 days of inactivity. Your data is **never deleted**, but the app takes ~3s to wake it. To prevent pausing:

1. Go to **https://uptimerobot.com** → sign up (free)
2. Click **Add New Monitor**
3. Fill in:
   - **Monitor Type**: HTTP(s)
   - **Friendly Name**: `ClubHub keep-alive`
   - **URL**: `https://clubhub-web.onrender.com`
   - **Monitoring Interval**: `30 minutes`
4. Click **Create Monitor**

This pings your app every 30 minutes, keeping both Render (no 30s cold starts) and Supabase (no pausing) awake.

### Render free tier

- **1 web service = ~720 hours/month** (under the 750 free hour limit ✅)
- Service sleeps after 15 min idle → first request takes ~30s to wake
- UptimeRobot (above) prevents sleeping entirely

---

## Optional: Enable Realtime Later

If you ever want instant sync (sub-second instead of 5-30s polling), you can add the realtime service without changing any code:

1. Deploy a second Render web service:
   - **Name**: `clubhub-realtime`
   - **Runtime**: Docker
   - **Dockerfile Path**: `mini-services/realtime/Dockerfile`
   - **Docker Build Context**: `mini-services/realtime`
   - **Env vars**: `REALTIME_TOKEN` (generate), `PORT=3003`, `EMIT_PORT=3004`
2. Add 3 env vars to your existing web service:
   - `REALTIME_TOKEN` → same value as the realtime service
   - `REALTIME_EMIT_URL` → `http://clubhub-realtime:3004/emit`
   - `NEXT_PUBLIC_REALTIME_URL` → `https://clubhub-realtime.onrender.com`
3. Redeploy the web service

**Note:** Adding a second service pushes you to ~1440 hours/month, exceeding the 750 free limit. Render will stop one service mid-month. Only do this if you upgrade one service to the $7/month Starter plan, or if you're okay with one service sleeping.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **Build fails** | Check Render build logs. Verify all 5 env vars are set. |
| **Database connection error** | Verify `DATABASE_URL` has the password filled in and `?connection_limit=3&pool_timeout=10` at the end. Use port `6543` (pooler), not `5432`. |
| **"Taking a moment to load" screen** | Supabase or Render is cold-starting. Click **Retry**. Set up UptimeRobot to prevent this. |
| **Can't create a club** | Verify `ADMIN_CLUB_PASSCODE` is set to `buildtogether12$` in the web service env vars. |
| **Updates slow between users** | Normal with polling — takes 5-30 seconds. This is expected behavior with the single-service setup. |
| **404 on homepage** | Wait for the build to complete. Check the web service shows "Live". |

---

## Quick Reference: All Environment Variables

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `postgresql://postgres.abc123:PASSWORD@aws-0-region.pooler.supabase.com:6543/postgres?connection_limit=3&pool_timeout=10` |
| `NEXTAUTH_SECRET` | (generated random string) |
| `NEXTAUTH_URL` | `https://your-web-name.onrender.com` |
| `ADMIN_CLUB_PASSCODE` | `buildtogether12$` |
| `NODE_ENV` | `production` |

---

## Summary

| Step | What | Time |
|------|------|------|
| 1 | Push to GitHub | 5 min |
| 2 | Create Supabase database | 5 min |
| 3 | Generate NextAuth secret | 1 min |
| 4 | Deploy web service on Render | 5 min |
| 5 | Database auto-initializes | 0 min (automatic) |
| 6 | Verify everything works | 5 min |
| **Total** | | **~25 min** |

You're done. Your app is live at `https://clubhub-web.onrender.com`, costs $0/month, and uses ~720 of your 750 free Render hours.
