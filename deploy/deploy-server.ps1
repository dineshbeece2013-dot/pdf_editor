# deploy-server.ps1 — ship the Express/PostgreSQL API to the EC2 host.
# Usage:  powershell -File "<project>\deploy\deploy-server.ps1"
#
# Assumes the host already has PostgreSQL running, the `pdfpro` role/database,
# /opt/pdfpro/server/.env filled in, and the pdfpro-api systemd unit installed
# (see server/README.md "Deployment" for the one-time setup).
param(
    [string]$KeyPath = 'C:\Users\lenovo\Downloads\cline.pem',
    [string]$Server  = 'ec2-user@54.242.198.214'
)

$ErrorActionPreference = 'Stop'
$proj  = Split-Path -Parent $PSScriptRoot
$stage = Join-Path $env:TEMP 'pdfpro-server.tar.gz'

function Assert-Ok([string]$step) {
    if ($LASTEXITCODE -ne 0) { throw "$step FAILED (exit code $LASTEXITCODE)" }
}

Write-Host '==> 1/3 packing server/'
if (Test-Path $stage) { Remove-Item $stage }
Push-Location $proj
try {
    # node_modules and dist are rebuilt on the server.
    tar -czf $stage --exclude=server/node_modules --exclude=server/dist server
    Assert-Ok 'tar'
} finally { Pop-Location }

Write-Host '==> 2/3 uploading'
scp -i $KeyPath $stage "${Server}:/tmp/pdfpro-server.tar.gz"
Assert-Ok 'scp tarball'
scp -i $KeyPath (Join-Path $PSScriptRoot 'deploy-server.sh') "${Server}:/tmp/deploy-server.sh"
Assert-Ok 'scp script'

Write-Host '==> 3/3 installing + restarting'
ssh -i $KeyPath $Server 'chmod +x /tmp/deploy-server.sh && /tmp/deploy-server.sh && rm -f /tmp/pdfpro-server.tar.gz /tmp/deploy-server.sh'
Assert-Ok 'remote deploy'

Remove-Item $stage
Write-Host '==> DONE. API live behind nginx at http://<host>/api/'
