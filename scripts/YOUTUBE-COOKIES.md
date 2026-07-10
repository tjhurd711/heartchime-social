# YouTube cookies for clip download

YouTube blocks downloads from AWS Lambda IPs. Search still works; **download** needs browser cookies.

## Windows (this PC)

**Prerequisites:** Log into [youtube.com](https://www.youtube.com) in Chrome (or Edge).

```powershell
cd "c:\Users\tyler\New folder\heartchime-social"

# 1. Export cookies from Chrome (close Chrome first if it errors)
.\scripts\export-youtube-cookies.ps1
# Or Edge: .\scripts\export-youtube-cookies.ps1 --edge

# 2. Upload to S3 (uses AWS keys from .env.local — no Mac, no aws CLI)
node scripts/upload-youtube-cookies.mjs

# 3. Push config to Lambda
node scripts/configure-celebrity-clips-lambda.mjs
```

Add to `.env.local` (once):

```
YOUTUBE_COOKIES_S3_KEY=config/youtube-cookies.txt
YOUTUBE_COOKIES_S3_BUCKET=heartbeat-photos-prod
```

**Chrome extension option:** Install **Get cookies.txt LOCALLY** → export on youtube.com → save as `%USERPROFILE%\youtube-cookies.txt` → run step 2 above.

---

## Mac (alternative)

```bash
pip3 install yt-dlp
yt-dlp --cookies-from-browser chrome --cookies ~/youtube-cookies.txt --skip-download "https://www.youtube.com/watch?v=jNQXAC9IVRw"
export AWS_PROFILE=admin
aws s3 cp ~/youtube-cookies.txt s3://heartbeat-photos-prod/config/youtube-cookies.txt
```

---

## After upload

Video Editor → **Fetch from YouTube**

Cookies expire every few weeks — re-export and re-upload when downloads fail again.
