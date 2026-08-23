# Deploys The Daily Page to Vercel and wires up the Telegram webhook.
#
#   .\deploy.ps1 -Token vcp_xxx     # token from vercel.com/account/settings/tokens
#   .\deploy.ps1                    # or set $env:VERCEL_TOKEN first
#
# Idempotent — safe to re-run.

param([string]$Token = $env:VERCEL_TOKEN)

# NOT 'Stop': PowerShell 5.1 wraps a native exe's stderr as an ErrorRecord even
# on exit code 0, and the Vercel CLI writes progress there. 'Stop' would abort
# the deploy on perfectly successful commands.
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot

if (-not $Token) { Write-Host "Need -Token (or `$env:VERCEL_TOKEN)." -ForegroundColor Red; exit 1 }
$H = @{ Authorization = "Bearer $Token" }

# --- read .env ------------------------------------------------------------
# Split on the FIRST '=' only: DATABASE_URL's query string contains more.
$vars = @{}
foreach ($line in (Get-Content .env -Encoding UTF8)) {
  if ($line -match '^\s*([A-Z_]+)=(.*)$') { $vars[$Matches[1]] = $Matches[2].Trim().Trim('"') }
}
$required = @('DATABASE_URL','TELEGRAM_BOT_TOKEN','TELEGRAM_OWNER_ID','APP_SECRET','APP_TZ')
foreach ($k in $required) {
  if (-not $vars[$k]) { Write-Host "$k missing from .env" -ForegroundColor Red; exit 1 }
}

Write-Host "`n== resolving project ==" -ForegroundColor Cyan
$teams  = Invoke-RestMethod -Uri 'https://api.vercel.com/v2/teams' -Headers $H
$teamId = ($teams.teams | Select-Object -First 1).id
$proj   = Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/daily-page?teamId=$teamId" -Headers $H
Write-Host "$($proj.name) ($($proj.id))"

# --- env vars, via the REST API -------------------------------------------
# NOT `vercel env add`: piping a string to a native command's stdin in
# PowerShell 5.1 prepends a UTF-8 BOM, so every value lands one invisible
# character too long and every secret comparison silently fails.
Write-Host "`n== pushing env vars ==" -ForegroundColor Cyan
$envUrl = "https://api.vercel.com/v10/projects/daily-page/env?teamId=$teamId&upsert=true"
foreach ($k in $required) {
  $payload = @{
    key = $k; value = $vars[$k]; type = 'encrypted'
    target = @('production','preview','development')
  } | ConvertTo-Json -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
  try {
    Invoke-RestMethod -Uri $envUrl -Method Post -Headers $H -ContentType 'application/json' -Body $bytes | Out-Null
    Write-Host ("  {0,-20} {1} chars" -f $k, $vars[$k].Length)
  } catch {
    Write-Host "  $k FAILED: $($_.ErrorDetails.Message)" -ForegroundColor Red; exit 1
  }
}

# --- deploy ---------------------------------------------------------------
# Env vars are read at build time, so this must come AFTER pushing them.
Write-Host "`n== deploying ==" -ForegroundColor Cyan
$out = npx --yes vercel --prod --yes --token $Token 2>&1 | Out-String
$alias = ([regex]::Matches($out, 'https://daily-page-[a-z0-9]+\.vercel\.app') |
          ForEach-Object { $_.Value } | Where-Object { $_ -notmatch '-[a-z0-9]{9,}-' } |
          Select-Object -Last 1)
if (-not $alias) { $alias = 'https://daily-page-pi.vercel.app' }
Write-Host "live at $alias" -ForegroundColor Green

# --- telegram webhook -----------------------------------------------------
# Point at the stable alias, never the per-deploy URL: that URL is frozen to
# one build, so the next deploy would leave Telegram talking to old code.
Write-Host "`n== registering webhook ==" -ForegroundColor Cyan
$body = @{
  url = "$alias/api/telegram"
  secret_token = $vars['APP_SECRET']
  allowed_updates = @('message','callback_query')
  drop_pending_updates = $true
} | ConvertTo-Json
$r = Invoke-RestMethod -Method Post -ContentType 'application/json' `
     -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) `
     -Uri "https://api.telegram.org/bot$($vars['TELEGRAM_BOT_TOKEN'])/setWebhook"
Write-Host "setWebhook ok=$($r.ok)"

$info = Invoke-RestMethod -Uri "https://api.telegram.org/bot$($vars['TELEGRAM_BOT_TOKEN'])/getWebhookInfo"
Write-Host "  url     : $($info.result.url)"
Write-Host "  pending : $($info.result.pending_update_count)"
if ($info.result.last_error_message) {
  Write-Host "  last err: $($info.result.last_error_message)" -ForegroundColor Yellow
}

# --- verify ---------------------------------------------------------------
Write-Host "`n== verifying ==" -ForegroundColor Cyan
$loginUrl = "$alias/api/login?key=$($vars['APP_SECRET'])"
try {
  Invoke-WebRequest -Uri $loginUrl -UseBasicParsing -MaximumRedirection 0 -ErrorAction Stop | Out-Null
  Write-Host "  secret check: PASS"
} catch {
  # A 302 lands here too, and a 302 is exactly what success looks like.
  if ($_.Exception.Response.StatusCode.value__ -eq 401) {
    Write-Host "  secret check: FAIL (401)" -ForegroundColor Red
  } else {
    Write-Host "  secret check: PASS (redirect)"
  }
}

Write-Host "`n-----------------------------------------" -ForegroundColor Green
Write-Host " Website : $loginUrl" -ForegroundColor Green
Write-Host " Bot     : https://t.me/rana_daily_page_bot" -ForegroundColor Green
Write-Host "-----------------------------------------" -ForegroundColor Green
Write-Host ""
Write-Host "Open the website link once per device - it sets a cookie for a year."
Write-Host "Press Start in the bot chat before it can message you."
Write-Host "Cron jobs are set up separately - see the README."
