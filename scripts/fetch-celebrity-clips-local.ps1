# Fetch YouTube clips locally (Solution 3) - uses your home IP + browser cookies.
# Uploads to S3 and writes Supabase rows; then refresh Video Editor and generate reel.
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$CelebrityName,
    [switch]$SearchOnly
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$handlerDir = Join-Path (Split-Path $root -Parent) "heartbeat_mobileapp\lambdas\celebrity_clips"
$envFile = Join-Path $root ".env.local"

if (-not (Test-Path $envFile)) {
    Write-Error ".env.local not found at $envFile"
}

foreach ($line in Get-Content $envFile) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
    $eq = $trimmed.IndexOf("=")
    if ($eq -lt 1) { continue }
    $name = $trimmed.Substring(0, $eq).Trim()
    $value = $trimmed.Substring($eq + 1).Trim()
    if ($name -eq "YOUTUBE_COOKIES_S3_KEY" -or $name -eq "YOUTUBE_COOKIES_S3_BUCKET") { continue }
    [Environment]::SetEnvironmentVariable($name, $value, "Process")
}

if (-not $env:CELEBRITY_CLIPS_BUCKET) {
    $env:CELEBRITY_CLIPS_BUCKET = $env:S3_BUCKET_NAME
}

$cookiesCandidates = @(
    (Join-Path $env:USERPROFILE "Downloads\www.youtube.com_cookies.txt"),
    (Join-Path $env:USERPROFILE "Downloads\youtube-cookies.txt"),
    (Join-Path $env:USERPROFILE "youtube-cookies.txt")
)
$cookiesFile = $cookiesCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $cookiesFile) {
    Write-Error "No cookies file found. Run: .\scripts\export-youtube-cookies.ps1"
}
$env:YOUTUBE_COOKIES_FILE = $cookiesFile
$env:YOUTUBE_SEARCH_BACKEND = "ytdlp"

if ($env:AWS_S3_UPLOAD_ACCESS_KEY_ID -and $env:AWS_S3_UPLOAD_SECRET_ACCESS_KEY) {
    $env:AWS_ACCESS_KEY_ID = $env:AWS_S3_UPLOAD_ACCESS_KEY_ID
    $env:AWS_SECRET_ACCESS_KEY = $env:AWS_S3_UPLOAD_SECRET_ACCESS_KEY
}

Remove-Item Env:AWS_PROFILE -ErrorAction SilentlyContinue
Remove-Item Env:AWS_DEFAULT_PROFILE -ErrorAction SilentlyContinue
if (-not $env:AWS_ACCESS_KEY_ID -or -not $env:AWS_SECRET_ACCESS_KEY) {
    Write-Error "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set in .env.local"
}
if (-not $env:AWS_REGION) { $env:AWS_REGION = "us-east-2" }

Write-Host "Celebrity: $CelebrityName"
Write-Host "Cookies:   $cookiesFile"
Write-Host "Bucket:    $($env:CELEBRITY_CLIPS_BUCKET)"
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    Write-Warning "ffmpeg not found - clips download in full (no 20s trim). Install: winget install Gyan.FFmpeg"
}
Write-Host "Installing Python deps (first run may take a minute)..."
python -m pip install -q -U "yt-dlp[default]"
python -m pip install -q -r (Join-Path $handlerDir "requirements.txt")
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Warning "Node.js not found. YouTube downloads need Node for yt-dlp EJS. Install from https://nodejs.org"
}

Push-Location $handlerDir
try {
    $args = @("handler.py", $CelebrityName)
    if ($SearchOnly) { $args += "--search-only" }
    python @args
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Done. Open Video Editor, enter '$CelebrityName', click Refresh clips, then Generate memorial reel."
