Write-Host "LEVERAGE v3 - Setup Script" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

# Step 1: Remove old node_modules and reinstall with correct better-sqlite3
Write-Host "`n[1/3] Removing old node_modules..." -ForegroundColor Yellow
if (Test-Path "node_modules") {
    Remove-Item -Recurse -Force "node_modules" -ErrorAction SilentlyContinue
}

Write-Host "[2/3] Installing dependencies (this takes 2-3 minutes)..." -ForegroundColor Yellow
npm install --ignore-scripts
if ($LASTEXITCODE -ne 0) {
    Write-Host "npm install failed" -ForegroundColor Red
    exit 1
}

# Step 2: Force-install prebuilt binary for better-sqlite3 on current Node version
Write-Host "[3/3] Installing better-sqlite3 prebuilt binary..." -ForegroundColor Yellow
npx --yes @mapbox/node-pre-gyp install --fallback-to-build=false --directory node_modules/better-sqlite3
if ($LASTEXITCODE -ne 0) {
    Write-Host "Prebuilt not found, trying to rebuild..." -ForegroundColor Yellow
    # Try prebuild-install directly
    node node_modules/better-sqlite3/node_modules/.bin/prebuild-install --runtime napi
}

Write-Host "`nSetup complete! Starting server..." -ForegroundColor Green
Write-Host "Open http://localhost:5000 in your browser" -ForegroundColor Green
Write-Host ""

# Start sidecar in new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\python-sidecar'; pip install -r requirements.txt -q; python main.py"

# Start node server
npm run dev
