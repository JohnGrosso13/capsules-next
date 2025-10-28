Param(
  [switch]$SkipDeploy = $false,
  [switch]$Tail = $false
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Read-EnvLocal {
  Param([string]$Path)
  if (!(Test-Path $Path)) { throw ".env.local not found at $Path" }
  $map = @{}
  Get-Content $Path | ForEach-Object {
    if ($_ -match '^(?<k>[A-Za-z0-9_]+)=(?<v>.*)$') {
      $k = $Matches.k.Trim()
      $v = $Matches.v.Trim()
      $map[$k] = $v
    }
  }
  return $map
}

function Ensure-Cmd {
  Param([string]$Name)
  $exists = (Get-Command $Name -ErrorAction SilentlyContinue) -ne $null
  if (-not $exists) { throw "Required command not found: $Name" }
}

function Run-Safe {
  Param([string]$Cmd)
  Write-Host "→ $Cmd" -ForegroundColor Cyan
  try {
    Invoke-Expression $Cmd
  } catch {
    Write-Warning "Command failed but continuing: $Cmd`n$($_.Exception.Message)"
  }
}

Write-Host "Capsules • R2 pipeline setup (Cloudflare + Mux)" -ForegroundColor Green
Ensure-Cmd "node"
Ensure-Cmd "npm"

$repoRoot = (Resolve-Path "$(Split-Path -Parent $MyInvocation.MyCommand.Path)\..")
$workerDir = Join-Path $repoRoot "workers\r2-pipeline"
$envPath = Join-Path $repoRoot ".env.local"

if (!(Test-Path $workerDir)) { throw "Worker directory not found: $workerDir" }
$envMap = Read-EnvLocal -Path $envPath

# Ensure Wrangler v4 is available via npx
Write-Host "Ensuring wrangler is available..." -ForegroundColor Yellow
Run-Safe "npm i -D wrangler@^4"

Push-Location $workerDir

Write-Host "Authenticating to Cloudflare (runs browser login if needed)..." -ForegroundColor Yellow
Run-Safe "npx wrangler whoami"
Run-Safe "npx wrangler login"

$bucket = if ($envMap.ContainsKey('R2_BUCKET')) { $envMap['R2_BUCKET'] } else { 'capsules-next' }
Write-Host "Ensuring R2 bucket '$bucket' exists..." -ForegroundColor Yellow
Run-Safe "npx wrangler r2 bucket create $bucket"

Write-Host "Ensuring Queues exist..." -ForegroundColor Yellow
Run-Safe "npx wrangler queues create r2-upload-events"
Run-Safe "npx wrangler queues create r2-processing-tasks"

Write-Host "Ensuring KV namespace exists..." -ForegroundColor Yellow
$kvId = $envMap['R2_KV_NAMESPACE_ID']
if (-not $kvId) {
  Write-Host "R2_KV_NAMESPACE_ID not set in .env.local; creating a new namespace 'UPLOAD_SESSIONS_KV'..." -ForegroundColor Yellow
  Run-Safe "npx wrangler kv namespace create UPLOAD_SESSIONS_KV"
  Write-Host "→ Copy the created namespace id into workers/r2-pipeline/wrangler.toml and .env.local as R2_KV_NAMESPACE_ID." -ForegroundColor Magenta
}

function Put-Secret {
  Param([string]$Name, [string]$Value)
  if (-not $Value) { Write-Warning "Skipping secret $Name (no value)"; return }
  $temp = New-TemporaryFile
  try {
    Set-Content -Path $temp -Value $Value -NoNewline -Encoding UTF8
    Write-Host "Setting secret: $Name" -ForegroundColor Yellow
    & powershell -Command "Get-Content -LiteralPath '$temp' | npx wrangler secret put $Name" | Out-Host
  } finally { Remove-Item -ErrorAction SilentlyContinue $temp }
}

Put-Secret -Name "SUPABASE_SERVICE_ROLE_KEY" -Value $envMap['SUPABASE_SERVICE_ROLE_KEY']
Put-Secret -Name "MUX_TOKEN_ID" -Value $envMap['MUX_TOKEN_ID']
Put-Secret -Name "MUX_TOKEN_SECRET" -Value $envMap['MUX_TOKEN_SECRET']
if ($envMap['MUX_ENVIRONMENT']) { Put-Secret -Name "MUX_ENVIRONMENT" -Value $envMap['MUX_ENVIRONMENT'] }
if ($envMap['MUX_PLAYBACK_DOMAIN']) { Put-Secret -Name "MUX_PLAYBACK_DOMAIN" -Value $envMap['MUX_PLAYBACK_DOMAIN'] }

if (-not $SkipDeploy) {
  Write-Host "Deploying worker..." -ForegroundColor Yellow
  Run-Safe "npx wrangler deploy"
}

if ($Tail) {
  Write-Host "Tailing logs (Ctrl+C to stop)..." -ForegroundColor Yellow
  Run-Safe "npx wrangler tail"
}

Pop-Location
Write-Host "Setup script finished." -ForegroundColor Green

