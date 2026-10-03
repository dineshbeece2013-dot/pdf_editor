# deploy.ps1 — build pdf-editor-pro and deploy it to the EC2 nginx server.
# Usage (from anywhere):  powershell -File "C:\Users\lenovo\Desktop\New folder\pdf-editor-pro\deploy\deploy.ps1"
param(
    [string]$KeyPath = 'C:\Users\lenovo\Downloads\cline.pem',
    [string]$Server  = 'ec2-user@54.242.198.214',
    [string]$WebRoot = '/usr/share/nginx/html'
)

$ErrorActionPreference = 'Stop'
$proj = Split-Path -Parent $PSScriptRoot   # deploy/ -> project root

function Assert-Ok([string]$step) {
    if ($LASTEXITCODE -ne 0) { throw "$step FAILED (exit code $LASTEXITCODE)" }
}

Write-Host '==> 1/4 npm run build'
Push-Location $proj
try { npm run build; Assert-Ok 'npm build' } finally { Pop-Location }

Write-Host '==> 2/4 packing dist/'
$tar = Join-Path $proj '_dist.tar.gz'
if (Test-Path $tar) { Remove-Item $tar }
tar -a -c -f $tar -C $proj dist
Assert-Ok 'tar'

Write-Host '==> 3/4 uploading'
scp -i $KeyPath $tar "${Server}:/tmp/dist.tar.gz"; Assert-Ok 'scp dist'
scp -i $KeyPath (Join-Path $PSScriptRoot 'nginx.conf') "${Server}:/tmp/nginx.conf"; Assert-Ok 'scp nginx.conf'

Write-Host '==> 4/4 installing + restarting nginx'
ssh -i $KeyPath $Server "sudo cp /tmp/nginx.conf /etc/nginx/nginx.conf && sudo nginx -t && sudo find $WebRoot -mindepth 1 -delete && sudo tar -xzf /tmp/dist.tar.gz -C $WebRoot --strip-components=1 && sudo systemctl restart nginx && rm -f /tmp/dist.tar.gz /tmp/nginx.conf && curl -s -o /dev/null -w 'deployed: %{http_code}\n' http://127.0.0.1/"
Assert-Ok 'ssh deploy'

Remove-Item $tar
$ip = ($Server -split '@')[-1]
Write-Host "==> DONE. Live at: http://$ip/"
