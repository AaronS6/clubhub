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

> **Note on build vs. runtime:** the Docker image builds fine WITHOUT
> `NEXTAUTH_SECRET` (the build phase sets `NEXT_PHASE`, and the auth config
> only refuses to start a *serving* server without the secret). At RUNTIME
> the server still fails closed — it will not start with forgeable sessions
> — so the env var must be set on Render before the service boots.

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

| # | Key | Value | Notes |
|---|-----|-------|-------|
| 1 | `DATABASE_URL` | Paste your Supabase connection string from Step 2.3 | required |
| 2 | `NEXTAUTH_SECRET` | Click **Generate** (or paste the one from Step 3) | required |
| 3 | `NEXTAUTH_URL` | `https://clubhub-web.onrender.com` (we'll verify this after deploy) | required |
| 4 | `ADMIN_CLUB_PASSCODE` | `buildtogether12$` | required |
| 5 | `NODE_ENV` | `production` | required |
| 6 | `RESEND_API_KEY` | `re_...` (from resend.com) | optional — password-reset emails; see the "Resend" section below |
| 7 | `EMAIL_FROM` | `ClubHub <noreply@yourdomain.com>` | optional — defaults to Resend's sandbox sender |

**Required: 5 env vars** — no realtime vars needed since we're using polling. The
last two are optional and only enable emailed password resets; without them the
"Forgot?" flow can't deliver emails in production (dev still shows the reset
link in the dialog).

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

## STEP 5: Database Schema — run `supabase_sync.sql` (2 min, once per deploy)

**The app does NOT auto-create tables.** `prisma db push` can't run against
the Supabase pooler (prepared statements aren't supported), so the schema is
managed by hand-written SQL. After the FIRST deploy (and after any deploy
where `prisma/schema.prisma` changed), bring the database in line:

1. Open the Supabase dashboard → **SQL Editor** → **New query**
2. Paste the entire contents of **`supabase_sync.sql`** (repo root)
3. Click **Run**

The script is 100% idempotent — it creates any missing feature tables
(`JoinRequest`, `ClubTransaction`, `Badge`, `MemberBadge`, notes tables),
adds every missing column with the right defaults, creates missing indexes
and foreign keys, and enables Row-Level Security everywhere. Re-running it
never errors and never touches your data.

> **If you skip this step**, the app boots but every request that touches a
> drifted table 500s with `P2022: The column … does not exist` (this is
> exactly what `User.avatarDecoration` missing looked like: session
> callbacks + half the API failing).

> **Historical scripts** (`supabase_schema.sql`, `supabase_badges.sql`,
> `supabase_notes_schema.sql`, `supabase_rls_fix.sql`) are superseded by
> `supabase_sync.sql` on existing deployments — don't re-run them (the
> badges one DROPs its tables first!). They're kept for reference only.

If you ever need to wipe and reset the database (⚠️ deletes all data):
1. Drop every table in the public schema (SQL Editor)
2. Run `supabase_schema.sql`, then `supabase_sync.sql`

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

## Optional: Enable Password-Reset Emails via Resend (5 min)

Password reset is self-service — members enter their email on the login
screen ("Forgot?"), get a 1-hour single-use reset link, and set a new
password themselves. No exec involvement.

Without email configured the flow still works in development (the reset link
is returned directly in the dialog), but **in production emails are
required** — otherwise nobody can reset a password.

1. Create a free account at **https://resend.com** (free tier: 100 emails/day,
   3,000/month, 1 custom domain)
2. (Recommended) Verify your own domain — this is what lets you send to ANY
   address (not just your own). The from-address domain MUST be a domain
   you verified here.
   - **Prereq:** a domain whose DNS you control (~$10/yr from Namecheap or
     Cloudflare). You CANNOT verify the free `*.onrender.com` subdomain —
     Render controls that DNS, not you.
   - **Resend → Domains → Add Domain.** Enter your domain — Resend
     recommends a sending subdomain like `mail.yourdomain.com` (isolates
     your email reputation; any address on what you enter can send, e.g.
     `noreply@mail.yourdomain.com`). Pick the region closest to your
     recipients.
   - **Copy the records.** Open the domain's **Records** tab — it lists the
     DNS records (DKIM + SPF: TXT / MX, or CNAME for newer domains, plus
     Return-Path). Add each one EXACTLY (type + host + value) in your DNS
     provider's panel. Copy/paste — don't retype.
     - Most providers auto-append your domain to the Host field: if Resend
       shows `resend._domainkey.yourdomain.com`, enter just
       `resend._domainkey` (otherwise you get a doubled-domain record).
     - Root-level records use `@` as the host (Namecheap/GoDaddy).
     - **Cloudflare: set CNAMEs to "DNS only" (grey cloud)** — a proxied
       (orange-cloud) CNAME breaks verification.
     - Resend has per-provider screenshots: docs → "DNS provider guides".
   - **Verify.** Back on the domain page click **Verify DNS Records**.
     Usually verifies within ~15 minutes; worst case 72h for DNS
     propagation. Still failing after 72h? Double-check the records and
     click "Restart verification".
   - **Add DMARC** once verified (the `_dmarc` record Resend shows) —
     better deliverability, less spam-foldering.
   - No domain at all? Use Resend's sandbox sender `onboarding@resend.dev` —
     but it only delivers to YOUR Resend account's own email address. Fine
     for testing, not for a real club.
3. Create an API key: Dashboard → API Keys → Create API Key (Full access)
4. Add two env vars to your web service / `.env`:
   - `RESEND_API_KEY` → `re_...` (the key from step 3)
   - `EMAIL_FROM` → `ClubHub <noreply@yourdomain.com>` — must be on the
     domain you verified in step 2 (e.g. `ClubHub <noreply@mail.yourdomain.com>`
     if you verified a subdomain). While testing without a domain:
     `ClubHub <onboarding@resend.dev>`.
5. Redeploy / restart — "Forgot?" now sends a real email with a
   **Reset password** button

**Verify:** request a reset for your own account and confirm the email
arrives (check spam on first send). The link expires in 1 hour and works
once — after a successful reset the token is deleted server-side.

**Reading the logs** (Render → your service → Logs, filter for `[email]`):
`RESEND_API_KEY is not set` → the key env var is missing; `Resend returned
error: ... 403` → key is present but the send was rejected — almost always
an unverified from-domain or the sandbox sender trying to deliver to
someone other than the Resend account owner; `Sent successfully to: ...
ID: ...` → working.

---

## Get Found on Search Engines (SEO) — 10 min

The app ships SEO-ready: `robots.txt` welcomes crawlers, `/sitemap.xml` is
generated from the database (homepage + every club whose execs enabled public
listing — unlisted clubs never appear), pages carry OpenGraph/social-preview
tags, and public club profiles set their own `<title>` ("Robotics Club —
ClubHub"). What's left is telling Google your site exists:

### 1. Verify ownership with Google Search Console (the big one)

1. Go to **https://search.google.com/search-console** → sign in → **Add
   property** → **URL prefix** → enter your site URL (e.g.
   `https://your-web-name.onrender.com`).
2. Choose the **"HTML tag"** verification method. Google shows a tag like
   `<meta name="google-site-verification" content="abc123XYZ" />` — copy just
   the `abc123XYZ` part.
3. Render → your web service → **Environment** → add:
   `GSC_VERIFICATION_TOKEN` = that token → save → **Manual Deploy → Deploy
   latest commit**.
4. Back in Search Console click **Verify**. (It reads the tag your app now
   emits automatically — no code changes, ever.)

### 2. Submit the sitemap + request indexing

1. Search Console → **Sitemaps** → enter `sitemap.xml` → **Submit**.
2. **URL Inspection** (top bar) → paste your site URL → **Request indexing**.
   First indexing usually takes 1–7 days.

### 3. Bing (+ DuckDuckGo + Yahoo, which use Bing's index)

Go to **https://www.bing.com/webmasters** → **Import from Google Search
Console** (one click once GSC is verified) — or add
`BING_VERIFICATION_TOKEN` the same way as step 1.

### 4. Keep the site awake (free-tier specifics)

Render's free tier sleeps after 15 idle minutes — a sleeping site responds
too slowly to crawlers. Set up **UptimeRobot** (already recommended in
Troubleshooting): free account → HTTP monitor → ping your URL every 5 min.

### 5. Get real links (fastest way to get indexed AND rank)

Search engines discover and trust sites through links. Ask your school to
link the site from its clubs page, post it in the club's Instagram bio, or
share it anywhere members gather. Even 2–3 real links dramatically speed up
indexing.

### Honest notes

- Logged-in club content is never indexed (it's behind auth — that's correct).
  The indexable surface is the landing page + public club profiles.
- A free `*.onrender.com` subdomain CAN rank, but a custom domain
  (~$10/yr — same one you'd verify for Resend email) reads better in results.
  After attaching it in Render → Settings → Custom Domains, set
  `NEXT_PUBLIC_SITE_URL` = `https://yourdomain.com` on the service so the
  sitemap, robots, and social previews all use it, then redeploy and add the
  domain as a SECOND property in Search Console.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **Build fails** | Check Render build logs. Verify all 5 env vars are set. |
| **500s + `P2022: The column … does not exist`** | Production schema has drifted behind the code (e.g. `User.avatarDecoration`). Run the full **`supabase_sync.sql`** in the Supabase SQL Editor — see STEP 5. One run fixes every missing column/table at once. |
| **`[auth] session callback error` in the logs** | Same root cause as above — the session callback reads `User` columns that don't exist yet. `supabase_sync.sql` fixes it. |
| **Database connection error** | Verify `DATABASE_URL` has the password filled in and `?connection_limit=3&pool_timeout=10` at the end. Use port `6543` (pooler), not `5432`. |
| **"Taking a moment to load" screen** | Supabase or Render is cold-starting. Click **Retry**. Set up UptimeRobot to prevent this. |
| **Can't create a club** | Verify `ADMIN_CLUB_PASSCODE` is set to `buildtogether12$` in the web service env vars. |
| **Updates slow between users** | Normal with polling — takes 5-30 seconds. This is expected behavior with the single-service setup. |
| **404 on homepage** | Wait for the build to complete. Check the web service shows "Live". |
| **"Forgot?" email never arrives** | `RESEND_API_KEY` is missing/invalid, or you're sending from `onboarding@resend.dev` to an address that isn't your own Resend account email (the sandbox sender only delivers to the account owner). Verify a domain in Resend and set `EMAIL_FROM` to it. Check the service logs for `[email]` lines. |
| **Site doesn't show up on Google** | Verify ownership + submit `sitemap.xml` in Google Search Console (see "Get Found on Search Engines"), then Request indexing for your URL — first indexing takes 1–7 days. Also keep the site awake (UptimeRobot) and get real links (school website, socials). Check `/robots.txt` and `/sitemap.xml` load in a browser. |

---

## Quick Reference: All Environment Variables

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `postgresql://postgres.abc123:PASSWORD@aws-0-region.pooler.supabase.com:6543/postgres?connection_limit=3&pool_timeout=10` |
| `NEXTAUTH_SECRET` | (generated random string) |
| `NEXTAUTH_URL` | `https://your-web-name.onrender.com` |
| `ADMIN_CLUB_PASSCODE` | `buildtogether12$` |
| `NODE_ENV` | `production` |
| `RESEND_API_KEY` | (optional — `re_...` from resend.com; enables password-reset emails) |
| `EMAIL_FROM` | (optional — `ClubHub <noreply@yourdomain.com>` once your domain is verified) |
| `GSC_VERIFICATION_TOKEN` | (optional — Google Search Console "HTML tag" token; see "Get Found on Search Engines") |
| `BING_VERIFICATION_TOKEN` | (optional — Bing Webmaster Tools "Meta tag" token; covers DuckDuckGo/Yahoo too) |
| `NEXT_PUBLIC_SITE_URL` | (optional — set to `https://yourdomain.com` when you attach a custom domain) |

---

## Summary

| Step | What | Time |
|------|------|------|
| 1 | Push to GitHub | 5 min |
| 2 | Create Supabase database | 5 min |
| 3 | Generate NextAuth secret | 1 min |
| 4 | Deploy web service on Render | 5 min |
| 5 | Run `supabase_sync.sql` in the SQL Editor | 2 min |
| 6 | Verify everything works | 5 min |
| **Total** | | **~25 min** |

You're done. Your app is live at `https://clubhub-web.onrender.com`, costs $0/month, and uses ~720 of your 750 free Render hours.
