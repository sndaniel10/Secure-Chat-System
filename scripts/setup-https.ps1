# setup-https.ps1 — Generate locally-trusted TLS certs for dev HTTPS.
# Run once per machine: npm run setup-https
#
# Requires mkcert. If not installed, this script will try to install it
# via winget (Windows 10+). Chocolatey and Scoop are tried as fallbacks.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Find-Mkcert {
    try { $null = Get-Command mkcert -ErrorAction Stop; return $true } catch { return $false }
}

if (-not (Find-Mkcert)) {
    Write-Host "mkcert not found -- attempting install..." -ForegroundColor Yellow

    $installed = $false

    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "  Installing via winget..."
        winget install --id FiloSottile.mkcert --exact --accept-source-agreements --accept-package-agreements
        $installed = Find-Mkcert
    }

    if (-not $installed -and (Get-Command choco -ErrorAction SilentlyContinue)) {
        Write-Host "  Installing via Chocolatey..."
        choco install mkcert -y
        $installed = Find-Mkcert
    }

    if (-not $installed -and (Get-Command scoop -ErrorAction SilentlyContinue)) {
        Write-Host "  Installing via Scoop..."
        scoop install mkcert
        $installed = Find-Mkcert
    }

    if (-not $installed) {
        Write-Host ""
        Write-Host "Could not install mkcert automatically." -ForegroundColor Red
        Write-Host "Install it manually from https://github.com/FiloSottile/mkcert/releases" -ForegroundColor Red
        Write-Host "then re-run: npm run setup-https" -ForegroundColor Red
        exit 1
    }

    $machinePath = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
    $userPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")
    $env:PATH = $machinePath + ";" + $userPath
}

Write-Host ""
Write-Host "Installing local CA (you may see a UAC prompt)..." -ForegroundColor Cyan
mkcert -install

$localIPs = @("localhost", "127.0.0.1")
$nets = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notmatch "^127\." -and $_.PrefixOrigin -ne "WellKnown" }
foreach ($net in $nets) {
    $localIPs += $net.IPAddress
}

Write-Host ""
Write-Host ("Generating certificates for: " + ($localIPs -join ", ")) -ForegroundColor Cyan

$projectRoot = Split-Path $PSScriptRoot -Parent
$certsDir = Join-Path $projectRoot "certs"
if (-not (Test-Path $certsDir)) {
    New-Item -ItemType Directory -Path $certsDir | Out-Null
}

Push-Location $certsDir
try {
    & mkcert @localIPs
} finally {
    Pop-Location
}

$generatedCert = Get-ChildItem $certsDir -Filter "*.pem" |
    Where-Object { $_.Name -notlike "*-key.pem" } |
    Select-Object -First 1

$generatedKey = Get-ChildItem $certsDir -Filter "*-key.pem" | Select-Object -First 1

$certDest = Join-Path $certsDir "cert.pem"
$keyDest = Join-Path $certsDir "key.pem"

if ($generatedCert -and ($generatedCert.FullName -ne $certDest)) {
    Move-Item $generatedCert.FullName $certDest -Force
}
if ($generatedKey -and ($generatedKey.FullName -ne $keyDest)) {
    Move-Item $generatedKey.FullName $keyDest -Force
}

Write-Host ""
Write-Host "Done! Certificates written to:" -ForegroundColor Green
Write-Host "  $certDest"
Write-Host "  $keyDest"
Write-Host ""
Write-Host "Run 'npm run dev' -- the server will start in HTTPS mode automatically." -ForegroundColor Green

$firstNetIP = ""
if ($nets) {
    $firstNetIP = ($nets | Select-Object -First 1).IPAddress
}
if ($firstNetIP) {
    Write-Host ""
    Write-Host "To trust the cert on a mobile device, open this URL in the device browser:" -ForegroundColor Yellow
    Write-Host ("  https://" + $firstNetIP + ":3000/api/dev-ca") -ForegroundColor Yellow
}
