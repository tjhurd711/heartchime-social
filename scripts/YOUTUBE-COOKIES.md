# YouTube cookies for cloud clip download

YouTube blocks downloads from AWS Lambda / ECS IPs. Search may still work; **download** needs fresh browser cookies on S3.

Cookies are **never** committed to git or bundled in Lambda deploy zips. The cloud fetcher downloads them from S3 at invoke time and passes `--cookies` to yt-dlp.

## Refresh loop (do this every ~7 days, or when AWS fetch fails)

```powershell
cd "c:\Users\tyler\New folder\heartchime-social"

# 1. Export cookies from Chrome (close Chrome first if it errors)
.\scripts\export-youtube-cookies.ps1
# Or Edge: .\scripts\export-youtube-cookies.ps1 --edge

# 2. Upload to private S3 key (stores uploaded-at metadata for the UI age indicator)
node scripts/upload-youtube-cookies.mjs

# 3. Ensure Lambda env points at that key
node scripts/configure-celebrity-clips-lambda.mjs
```

Add to `.env.local` / Vercel (once):

```
YOUTUBE_COOKIES_S3_KEY=config/youtube-cookies.txt
YOUTUBE_COOKIES_S3_BUCKET=heartbeat-photos-prod
```

**Chrome extension option:** Install **Get cookies.txt LOCALLY** → export on youtube.com (signed in) → save as `%USERPROFILE%\Downloads\youtube-cookies.txt` → run step 2.

## After upload

1. Video Editor → check **Cookies: Nd old** near **Fetch from YouTube (AWS)** (warns when > 7 days).
2. Click **Fetch from YouTube (AWS)** (works from the deployed Vercel site — no local `npm run dev` required).

If YouTube still blocks, the UI shows:

> YouTube blocked the cloud fetch — refresh cookies (see YOUTUBE-COOKIES.md) or fetch locally

Re-run the refresh loop above, then retry.

## Cloud fetcher behavior

- Downloads `s3://…/config/youtube-cookies.txt` at invoke time
- Rotates yt-dlp player clients (`android,web_safari` first)
- Uses a realistic Chrome user-agent, `--sleep-requests 1`, and retries
- Keeps `--download-sections` / download-window support
- Optional proxy plug-in (not configured): set Lambda env `YOUTUBE_PROXY_URL` → yt-dlp `--proxy` (residential proxy provider)

## Mac (alternative)

```bash
pip3 install yt-dlp
yt-dlp --cookies-from-browser chrome --cookies ~/youtube-cookies.txt --skip-download "https://www.youtube.com/watch?v=jNQXAC9IVRw"
# Prefer the Node uploader so uploaded-at metadata is set:
# node scripts/upload-youtube-cookies.mjs ~/youtube-cookies.txt
aws s3 cp ~/youtube-cookies.txt s3://heartbeat-photos-prod/config/youtube-cookies.txt \
  --content-type text/plain \
  --metadata uploaded-at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
```
