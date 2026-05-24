# deploy.ps1 — Rebuild the Finance Tracker addon on Home Assistant OS
#
# Usage:
#   $env:HA_TOKEN = "your-long-lived-token"
#   .\deploy.ps1                            # deploy to prod (default)
#   .\deploy.ps1 -Environment "test"        # deploy to test
#
# Or with explicit parameters:
#   .\deploy.ps1 -Environment "prod" -HaUrl "http://192.168.1.100:8123"
#
# Run this from the project root (z:\finance_tracker\).
# The script builds the frontend, then tells HAOS to rebuild the addon
# (which re-runs the Dockerfile using the files already on disk there).

param(
    [ValidateSet("test", "prod")]
    [string]$Environment = "prod",
    [string]$HaUrl      = "http://homeassistant.local:8123",
    [string]$Token      = $env:HA_TOKEN
)

# Map environment to folder path and addon slug
$envConfig = @{
    "prod" = @{
        "folder" = "z:\finance_tracker"
        "slug"   = "local_finance_tracker"
        "name"   = "Finance Tracker (Production)"
    }
    "test" = @{
        "folder" = "z:\finance_tracker_test"
        "slug"   = "local_finance_tracker_test"
        "name"   = "Finance Tracker (Test)"
    }
}

$config = $envConfig[$Environment]
$projectFolder = $config.folder
$addonSlug = $config.slug
$addonName = $config.name

Write-Host "`n🚀 Deploying to $Environment environment ($addonName)" -ForegroundColor Cyan

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $Token) {
    Write-Error @"
HA_TOKEN is not set. Create a long-lived access token in Home Assistant:
  Profile → Security → Long-lived access tokens → Create token

Then run:
  `$env:HA_TOKEN = 'paste-token-here'
  .\deploy.ps1 -Environment $Environment
"@
    exit 1
}

# ── 1. Build frontend ──────────────────────────────────────────────────────────
Write-Host "`nBuilding frontend..." -ForegroundColor Cyan
Push-Location "$projectFolder\frontend"
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed (exit $LASTEXITCODE)" }
} finally {
    Pop-Location
}
Write-Host "Frontend built." -ForegroundColor Green

# ── 2. Trigger addon rebuild via HA Supervisor API ─────────────────────────────
Write-Host "`nTriggering addon rebuild on $HaUrl ..." -ForegroundColor Cyan

$headers = @{
    "Authorization" = "Bearer $Token"
    "Content-Type"  = "application/json"
}

try {
    $resp = Invoke-RestMethod `
        -Uri    "$HaUrl/api/hassio/addons/$addonSlug/rebuild" `
        -Method POST `
        -Headers $headers
    Write-Host "Supervisor response: $($resp.result)" -ForegroundColor Green
} catch {
    Write-Warning "Rebuild request failed: $_"
    Write-Warning "The addon may still be rebuilding -- check HA > Settings > Add-ons > $addonName."
}

Write-Host "`nDone. Monitor rebuild progress in:" -ForegroundColor Yellow
Write-Host "  HA > Settings > Add-ons > $addonName > Log tab" -ForegroundColor Yellow

