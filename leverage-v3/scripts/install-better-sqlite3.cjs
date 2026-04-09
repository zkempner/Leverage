/**
 * Ensures better-sqlite3 native binary is available.
 * Uses prebuild-install (bundled with better-sqlite3) first,
 * falls back gracefully so npm install never fails.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const bsqlDir = path.join(__dirname, '..', 'node_modules', 'better-sqlite3');

// Check if binary already exists (prebuilt or compiled)
const prebuiltGlob = path.join(bsqlDir, 'prebuilds');
const releaseFile = path.join(bsqlDir, 'build', 'Release', 'better_sqlite3.node');

if (fs.existsSync(releaseFile)) {
  console.log('better-sqlite3: native binary already compiled.');
  process.exit(0);
}

if (fs.existsSync(prebuiltGlob)) {
  const entries = fs.readdirSync(prebuiltGlob);
  if (entries.length > 0) {
    console.log('better-sqlite3: prebuilt binary already present.');
    process.exit(0);
  }
}

// Try prebuild-install (ships with better-sqlite3)
try {
  console.log('better-sqlite3: attempting prebuild-install...');
  execSync('npx prebuild-install -r napi', {
    cwd: bsqlDir,
    stdio: 'inherit',
    timeout: 60000,
  });
  console.log('better-sqlite3: prebuilt binary installed successfully.');
  process.exit(0);
} catch (e) {
  console.warn('better-sqlite3: prebuild-install failed, trying node-gyp rebuild...');
}

// Try node-gyp rebuild as fallback
try {
  execSync('npx node-gyp rebuild', {
    cwd: bsqlDir,
    stdio: 'inherit',
    timeout: 120000,
  });
  console.log('better-sqlite3: compiled from source successfully.');
  process.exit(0);
} catch (e) {
  console.warn('');
  console.warn('========================================================');
  console.warn('  better-sqlite3 binary not available.');
  console.warn('  The app may fail at runtime. To fix, either:');
  console.warn('    1. Install Visual Studio Build Tools (Windows)');
  console.warn('    2. Use Node.js v20 LTS (has prebuilt binaries)');
  console.warn('    3. Run: npm rebuild better-sqlite3');
  console.warn('========================================================');
  console.warn('');
  // Exit 0 so npm install doesn't fail
  process.exit(0);
}
