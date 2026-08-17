# scripts/run-critic-pipeline.ps1
$ErrorActionPreference = "Stop"

$ProjectRoot = "C:\Users\patri\OneDrive\Documents\VScodeProjects\rental-mcp"
Set-Location $ProjectRoot

# --- Azure OpenAI (required if .env injects 0 vars) ---
$env:AZURE_OPENAI_ENDPOINT    = "https://rentalllm.openai.azure.com"
$env:AZURE_OPENAI_API_KEY     = "PASTE_YOUR_KEY_HERE"
$env:AZURE_OPENAI_DEPLOYMENT  = "gpt-4.1-mini"
$env:AZURE_OPENAI_API_VERSION = "2024-12-01-preview"

# --- Notify ---
$env:NOTIFY_EMAIL_TO          = "your@malin.com"
$env:NOTIFY_EMAIL_FROM        = "rental-mcp-bot@malin.com"   # if your tool needs it
$env:NOTIFY_INCLUDE_HIGH_LOGIC = "true"
$env:CRITIC_BATCH_LIMIT       = "30"

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
  Write-Log "Running criticBatch..."
  node src/jobs/criticBatch.js 2>&1 | Tee-Object -FilePath $OutLog -Append
  Write-Log "criticBatch exit: $LASTEXITCODE"

  Write-Log "Running notifyCritiques..."
  node src/jobs/notifyCritiques.js 2>&1 | Tee-Object -FilePath $OutLog -Append
  Write-Log "notifyCritiques exit: $LASTEXITCODE"

  Write-Log "=== Critic pipeline done ==="
  exit 0
}
catch {
  Write-Log "PIPELINE ERROR: $_"
  exit 1
}