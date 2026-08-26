# scripts/run-critic-pipeline.ps1
$ErrorActionPreference = "Stop"

$ProjectRoot = "C:\Users\patri\OneDrive\Documents\VScodeProjects\rental-mcp"
Set-Location $ProjectRoot

if (-not $env:AZURE_OPENAI_API_KEY) { throw "AZURE_OPENAI_API_KEY not set" }
if (-not $env:GITHUB_TOKEN) { throw "GITHUB_TOKEN not set" }
if (-not $env:NOTIFY_EMAIL_TO) { throw "NOTIFY_EMAIL_TO not set" }

$env:GITHUB_OWNER = "PwannMalin"
$env:GITHUB_REPO = "rental-mcp"
$env:GITHUB_BASE_BRANCH = "main"
          
$env:NOTIFY_INCLUDE_HIGH_LOGIC = "false"
$env:CRITIC_BATCH_LIMIT = "30"

$LogDir = Join-Path $ProjectRoot "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Stamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$OutLog = Join-Path $LogDir "pipeline_$Stamp.log"

function Write-Log($msg) {
  $line = "$(Get-Date -Format o)  $msg"
  Add-Content -Path $OutLog -Value $line
  Write-Host $line
}

Write-Log "=== Critic pipeline start ==="

try {
  Write-Log "1/3 criticBatch..."
  node src/jobs/criticBatch.js 2>&1 | Tee-Object -FilePath $OutLog -Append
  Write-Log "criticBatch exit: $LASTEXITCODE"

  Write-Log "2/3 notifyCritiques..."
  node src/jobs/notifyCritiques.js 2>&1 | Tee-Object -FilePath $OutLog -Append
  Write-Log "notifyCritiques exit: $LASTEXITCODE"

  Write-Log "3/3 architectPr..."
  node src/jobs/architectPr.js 2>&1 | Tee-Object -FilePath $OutLog -Append
  Write-Log "architectPr exit: $LASTEXITCODE"

  Write-Log "=== Critic pipeline done ==="
  exit 0
}
catch {
  Write-Log "PIPELINE ERROR: $_"
  exit 1
}