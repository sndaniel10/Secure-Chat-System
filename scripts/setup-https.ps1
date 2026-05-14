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
  Write-Host "mkcert not found — attempting install..." -ForegroundColor Yellow

  $installed = $false

  # Try winget first (ships with Windows 10 1809+)
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host "  Installing via winget..."
    winget install --id FiloSottile.mkcert --exact --accept-source-agreements --accept-package-agreements
    $installed = Find-Mkcert
  }

  # Fall back to Chocolatey
  if (-not $installed -and (Get-Command choco -ErrorAction SilentlyContinue)) {
    Write-Host "  Installing via Chocolatey..."
    choco install mkcert -y
    $installed = Find-Mkcert
  }

  # Fall back to Scoop
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

  # Refresh PATH so the newly installed binary is visible in this session
  $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" +
              [System.Environment]::GetEnvironmentVariable("PATH", "User")
}

# Install the local CA into the system/browser trust stores
Write-Host ""
Write-Host "Installing local CA (you may see a UAC prompt)..." -ForegroundColor Cyan
mkcert -install

# Collect every non-loopback IPv4 address on this machine
$localIPs = @("localhost", "127.0.0.1")
$nets = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notmatch "^127\." -and $_.PrefixOrigin -ne "WellKnown" }
foreach ($net in $nets) {
  $localIPs += $net.IPAddress
}

Write-Host ""
Write-Host "Generating certificates for: $($localIPs -join ', ')" -ForegroundColor Cyan

# Create certs/ directory next to this script's parent (project root)
$projectRoot = Split-Path $PSScriptRoot -Parent
$certsDir = Join-Path $projectRoot "certs"
if (-not (Test-Path $certsDir)) {
  New-Item -ItemType Directory -Path $certsDir | Out-Null
}

# Run mkcert from the certs directory so output lands there
Push-Location $certsDir
try {
  & mkcert @localIPs
} finally {
  Pop-Location
}

# mkcert names the files after the first SAN — rename to the expected names
$generatedCert = Get-ChildItem $certsDir -Filter "*+*.pem" | Select-Object -First 1
$generatedKey  = Get-ChildItem $certsDir -Filter "*+*-key.pem" | Select-Object -First 1

# If only two files exist total, pick them by exclusion
if (-not $generatedCert) {
  $generatedCert = Get-ChildItem $certsDir -Filter "*.pem" |
                   Where-Object { $_.Name -notlike "*-key.pem" } |
                   Select-Object -First 1
}
if (-not $generatedKey) {
  $generatedKey = Get-ChildItem $certsDir -Filter "*-key.pem" | Select-Object -First 1
}

$certDest = Join-Path $certsDir "cert.pem"
$keyDest  = Join-Path $certsDir "key.pem"

if ($generatedCert -and $generatedCert.FullName -ne $certDest) {
  Move-Item $generatedCert.FullName $certDest -Force
}
if ($generatedKey -and $generatedKey.FullName -ne $keyDest) {
  Move-Item $generatedKey.FullName $keyDest -Force
}

Write-Host ""
Write-Host "Done! Certificates written to:" -ForegroundColor Green
Write-Host "  $certDest"
Write-Host "  $keyDest"
Write-Host ""
Write-Host "Run 'npm run dev' — the server will start in HTTPS mode automatically." -ForegroundColor Green
Write-Host ""
Write-Host "To trust the cert on a mobile device, open this URL in the device browser:" -ForegroundColor Yellow
$firstNetIP = ($nets | Select-Object -First 1).IPAddress
if ($firstNetIP) {
  Write-Host "  https://${firstNetIP}:3000/api/dev-ca" -ForegroundColor Yellow
}
