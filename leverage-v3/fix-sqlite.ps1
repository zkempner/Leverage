# Downloads the prebuilt better-sqlite3 binary directly from GitHub
# Works on any Node version without compilation

Write-Host "Downloading prebuilt better-sqlite3 for Node 25..." -ForegroundColor Cyan

$nodeVersion = node -e "console.log(process.versions.napi)"
Write-Host "NAPI version: $nodeVersion"

# Use node-pre-gyp to fetch prebuilt
cd node_modules/better-sqlite3
node -e "
const { execSync } = require('child_process');
try {
  execSync('node ../prebuild-install/bin.js --runtime napi', { stdio: 'inherit' });
} catch(e) {
  console.log('Trying npm install with build flag...');
  process.exit(1);
}
"
cd ../..
Write-Host "Done. Run: npm run dev" -ForegroundColor Green
