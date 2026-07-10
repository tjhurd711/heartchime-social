# Home-PC fetch workers

Run yt-dlp on one or more home PCs so the **deployed** Vercel Video Editor can fetch clips without exposing those PCs to the internet as servers.

Workers poll a private Supabase queue (`fetch_jobs`), claim a job, run the same local fetch path as `npm run dev` → Fetch locally, upload clips to S3, then mark the job done.

## One-time setup (each PC)

1. Install **Node.js 20+**, **Python 3**, **ffmpeg**, and ensure `python` / `ffmpeg` are on `PATH`.
2. Clone/sync this repo so the sibling folder exists:
   - `.../heartchime-social`
   - `.../heartbeat_mobileapp/lambdas/celebrity_clips` (handler.py)
3. Copy env into `heartchime-social/.env.local` (service role + AWS upload keys):

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
S3_BUCKET_NAME=heartbeat-photos-prod
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-2
# optional:
# FETCH_WORKER_ID=office-pc
# YOUTUBE_COOKIES_FILE=C:\Users\you\Downloads\youtube-cookies.txt
# CELEBRITY_CLIPS_HANDLER_DIR=C:\path\to\heartbeat_mobileapp\lambdas\celebrity_clips
```

4. Export YouTube cookies on **this** PC (signed-in Chrome):

```powershell
cd path\to\heartchime-social
.\scripts\export-youtube-cookies.ps1
# or Chrome extension → Downloads\youtube-cookies.txt
```

5. Apply the Supabase migration once (project-wide):

`supabase/migrations/20260710140000_create_fetch_jobs.sql`

## Run the worker

```powershell
cd path\to\heartchime-social
node scripts/fetch-worker.mjs
```

Leave it running. It polls every 10s, claims with `claim_fetch_job` (SKIP LOCKED — two workers never get the same job), and requeues claims older than 10 minutes if a PC dies mid-job.

### Always-on options

- **Windows Task Scheduler**: “At log on” → `node scripts/fetch-worker.mjs` (start in `heartchime-social`)
- **pm2**: `pm2 start scripts/fetch-worker.mjs --name fetch-worker`

## Using it from the site

1. Open Video Editor on the **deployed** site (or local).
2. Enter a celebrity name → **Fetch via worker**.
3. Status shows `pending` → `claimed` (hostname) → clips appear via the normal clip poll; or `failed` with error text.

Local **Fetch locally** and **Fetch from YouTube (AWS)** are unchanged.

## Security notes

- Workers use the **service role** key — keep `.env.local` on the PC only; never commit it.
- PCs are not inbound-exposed; they only poll Supabase outbound.
- `fetch_jobs` RLS: no anon/authenticated policies (service role only).
