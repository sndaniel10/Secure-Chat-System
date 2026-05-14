# setup-https.ps1 — Generate locally-trusted TLS certs for dev HTTPS.
# Run once per machine: npm run setup-https

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path $PSScriptRoot -Parent

function Find-Mkcert {
    try { $null = Get-Command mkcert -ErrorAction Stop; return $true } catch { return $false }
}

function Download-Mkcert {
    Write-Host "  Downloading mkcert from GitHub..." -ForegroundColor Cyan
    try {
        $release = Invoke-RestMethod "https://api.github.com/repos/FiloSottile/mkcert/releases/latest"
        $asset = $release.assets | Where-Object { $_.name -like "*windows-amd64*" } | Select-Object -First 1
        if (-not $asset) {
            Write-Host "  Could not find Windows release asset." -ForegroundColor Red
            return $null
        }
        $dest = Join-Path $env:TEMP "mkcert.exe"
        Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $dest -UseBasicParsing
        return $dest
    } catch {
        Write-Host ("  Download failed: " + $_.Exception.Message) -ForegroundColor Red
        return $null
    }
}

$mkcertCmd = "mkcert"

if (-not (Find-Mkcert)) {
    Write-Host "mkcert not found -- trying to install..." -ForegroundColor Yellow

    $installed = $false

    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "  Trying winget..."
        try {
            winget install --id FiloSottile.mkcert --exact --accept-source-agreements --accept-package-agreements 2>&1 | Out-Null
            $installed = Find-Mkcert
        } catch { }
    }

    if (-not $installed) {
        $exe = Download-Mkcert
        if ($exe -and (Test-Path $exe)) {
            $mkcertCmd = $exe
            $installed = $true
            Write-Host "  Downloaded to $exe" -ForegroundColor Green
        }
    }

    if (-not $installed) {
        Write-Host ""
        Write-Host "Could not obtain mkcert automatically." -ForegroundColor Red
        Write-Host "Download it manually from: https://github.com/FiloSottile/mkcert/releases" -ForegroundColor Red
        Write-Host "Place mkcert.exe somewhere on your PATH, then re-run: npm run setup-https" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "Installing local CA into browser/system trust stores..." -ForegroundColor Cyan
Write-Host "(A UAC prompt may appear -- click Yes to allow.)" -ForegroundColor Yellow
& $mkcertCmd -install

$localIPs = @("localhost", "127.0.0.1")
$nets = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notmatch "^127\." -and $_.PrefixOrigin -ne "WellKnown" }
foreach ($net in $nets) {
    $localIPs += $net.IPAddress
}

Write-Host ""
Write-Host ("Generating certificates for: " + ($localIPs -join ", ")) -ForegroundColor Cyan

$certsDir = Join-Path $projectRoot "certs"
if (-not (Test-Path $certsDir)) {
    New-Item -ItemType Directory -Path $certsDir | Out-Null
}

Push-Location $certsDir
try {
    & $mkcertCmd @localIPs
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
