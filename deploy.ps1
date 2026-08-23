# Deploys The Daily Page to Vercel and wires up the Telegram webhook.
# Prerequisite: `npx vercel login` (once).
# Run:          .\deploy.ps1

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host "`n== checking login ==" -ForegroundColor Cyan
$who = npx --yes vercel whoami 2>&1 | Out-String
if ($who -match 'Logged out|not authenticated') {
  Write-Host "Not logged in. Run 'npx vercel login' first, then re-run this script." -ForegroundColor Red
  exit 1
}
Write-Host "logged in as $($who.Trim() -split "`n" | Select-Object -Last 1)"

# --- read .env ------------------------------------------------------------
$vars = @{}
foreach ($line in (Get-Content .env)) {
  if ($line -match '^\s*([A-Z_]+)\s*=\s*"?(.*?)"?\s*$') { $vars[$Matches[1]] = $Matches[2] }
}
foreach ($k in @('DATABASE_URL','TELEGRAM_BOT_TOKEN','TELEGRAM_OWNER_ID','APP_SECRET','APP_TZ')) {
  if (-not $vars[$k]) { Write-Host "$k missing from .env" -ForegroundColor Red; exit 1 }
}

Write-Host "`n== linking project ==" -ForegroundColor Cyan
npx --yes vercel link --yes --project daily-page

Write-Host "`n== pushing env vars ==" -ForegroundColor Cyan
foreach ($k in @('DATABASE_URL','TELEGRAM_BOT_TOKEN','TELEGRAM_OWNER_ID','APP_SECRET','APP_TZ')) {
  foreach ($target in @('production','preview','development')) {
    # remove first so re-runs are idempotent; ignore "not found"
    try { npx --yes vercel env rm $k $target --yes 2>&1 | Out-Null } catch {}
    $vars[$k] | npx --yes vercel env add $k $target 2>&1 | Out-Null
  }
  Write-Host "  set $k"
}

Write-Host "`n== deploying ==" -ForegroundColor Cyan
$out = npx --yes vercel --prod --yes 2>&1 | Out-String
Write-Host $out
$url = ([regex]::Matches($out, 'https://[a-z0-9\-]+\.vercel\.app') | Select-Object -Last 1).Value
if (-not $url) { Write-Host "Could not parse the deployment URL from the output above." -ForegroundColor Red; exit 1 }
Write-Host "deployed: $url" -ForegroundColor Green

# --- PUBLIC_URL has to point at the deployment, so it is set last ---------
Write-Host "`n== setting PUBLIC_URL ==" -ForegroundColor Cyan
$raw = (Get-Content .env -Raw) -replace 'PUBLIC_URL=""', ('PUBLIC_URL="' + $url + '"')
[System.IO.File]::WriteAllText("$PWD\.env", $raw, (New-Object System.Text.UTF8Encoding($false)))
foreach ($target in @('production','preview','development')) {
  try { npx --yes vercel env rm PUBLIC_URL $target --yes 2>&1 | Out-Null } catch {}
  $url | npx --yes vercel env add PUBLIC_URL $target 2>&1 | Out-Null
}
npx --yes vercel --prod --yes 2>&1 | Out-Null   # redeploy so the new var is live

Write-Host "`n== registering telegram webhook ==" -ForegroundColor Cyan
$body = @{
  url = "$url/api/telegram"
  secret_token = $vars['APP_SECRET']
  allowed_updates = @('message','callback_query')
  drop_pending_updates = $true
} | ConvertTo-Json
$r = Invoke-RestMethod -Method Post -ContentType 'application/json' -Body $body `
     -Uri "https://api.telegram.org/bot$($vars['TELEGRAM_BOT_TOKEN'])/setWebhook"
Write-Host "setWebhook ok=$($r.ok) — $($r.description)"

$info = Invoke-RestMethod -Uri "https://api.telegram.org/bot$($vars['TELEGRAM_BOT_TOKEN'])/getWebhookInfo"
Write-Host "webhook url:        $($info.result.url)"
Write-Host "pending updates:    $($info.result.pending_update_count)"
if ($info.result.last_error_message) {
  Write-Host "last error: $($info.result.last_error_message)" -ForegroundColor Yellow
}

Write-Host "`n=========================================" -ForegroundColor Green
Write-Host " Website:  $url/api/login?key=$($vars['APP_SECRET'])" -ForegroundColor Green
Write-Host " Bot:      https://t.me/rana_daily_page_bot" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host "`nOpen the website link once per device (it sets a cookie), then send /help to the bot."
Write-Host "Cron jobs still need setting up — see the README."
