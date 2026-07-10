# Export YouTube cookies from Chrome or Edge on Windows (must be logged into YouTube).
$ErrorActionPreference = "Stop"

$outFile = Join-Path $env:USERPROFILE "Downloads\youtube-cookies.txt"
$outDir = Split-Path $outFile -Parent
if (-not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir | Out-Null
}
$testUrl = "https://www.youtube.com/watch?v=jNQXAC9IVRw"

Write-Host "Installing yt-dlp (if needed)..."
python -m pip install -q yt-dlp

$browser = "chrome"
if ($args -contains "--edge") { $browser = "edge" }

Write-Host "Exporting cookies from $browser..."
Write-Host "IMPORTANT: Close all $browser windows first, or export will fail."
python -m yt_dlp --cookies-from-browser $browser --cookies $outFile --skip-download $testUrl
if ($LASTEXITCODE -ne 0) {
  Write-Error "Export failed. Close $browser completely, log into youtube.com, then retry."
}

if (-not (Test-Path $outFile)) {
  Write-Error "Export failed - no cookies file written. Try --edge or close the browser."
}

$content = Get-Content $outFile -Raw
$loggedIn = @('LOGIN_INFO', "`tSID`t", "`t__Secure-1PSID`t", "`t__Secure-3PSID`t") | Where-Object { $content -match [regex]::Escape($_) }
if ($content -notmatch 'youtube\.com' -or $loggedIn.Count -eq 0) {
  Write-Error @"
Cookies file looks incomplete.
Best fix: install 'Get cookies.txt LOCALLY' in Chrome, open youtube.com while signed in, export to:
  $outFile
Or close ALL Chrome windows and run this script again.
"@
}

Write-Host "Saved: $outFile"
Write-Host "Next: .\scripts\fetch-celebrity-clips-local.ps1 `"Celebrity Name`""
