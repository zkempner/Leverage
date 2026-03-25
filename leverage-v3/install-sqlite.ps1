# Downloads the pre-compiled better-sqlite3 NAPI binary directly from GitHub
# No Visual Studio, no compilation, works on any Node version
# Run this once after 'npm install --ignore-scripts'

Write-Host "Installing better-sqlite3 prebuilt binary..." -ForegroundColor Cyan

$version = "11.7.0"
$url = "https://github.com/WiseLibs/better-sqlite3/releases/download/v$version/better-sqlite3-v$version-napi-v8-win32-x64.tar.gz"
$dest = ".\node_modules\better-sqlite3"
$tarFile = "$env:TEMP\better-sqlite3.tar.gz"

Write-Host "Downloading from GitHub releases..."
Invoke-WebRequest -Uri $url -OutFile $tarFile -UseBasicParsing

Write-Host "Extracting..."
# Create the prebuilt directory
$prebuiltDir = "$dest\prebuilds\win32-x64"
New-Item -ItemType Directory -Force -Path $prebuiltDir | Out-Null

# Extract using tar (built into Windows 10+)
tar -xzf $tarFile -C $env:TEMP

# Find and copy the .node file
$nodeFile = Get-ChildItem -Path $env:TEMP -Filter "better_sqlite3.node" -Recurse | Select-Object -First 1
if ($nodeFile) {
    Copy-Item $nodeFile.FullName "$prebuiltDir\better_sqlite3.node"
    Write-Host "Binary installed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Now run: npm run dev" -ForegroundColor Green
} else {
    Write-Host "Could not find better_sqlite3.node in extracted files" -ForegroundColor Red
    Write-Host "Contents of $env:TEMP:" -ForegroundColor Yellow
    Get-ChildItem $env:TEMP -Filter "*.node"
}

# Cleanup
Remove-Item $tarFile -ErrorAction SilentlyContinue
