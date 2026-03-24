/**
 * Downloads the NAPI prebuilt binary for better-sqlite3 directly from GitHub.
 * NAPI binaries are ABI-stable and work across all Node versions (v6+) 
 * without any compilation or Visual Studio required.
 * 
 * Runs automatically as `postinstall` after `npm install`.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');
const zlib = require('zlib');

const VERSION = '11.7.0';
const PLATFORM = process.platform; // 'win32', 'linux', 'darwin'
const ARCH = process.arch;         // 'x64', 'arm64'

// NAPI prebuilt filenames from better-sqlite3 GitHub releases
const filename = `better-sqlite3-v${VERSION}-napi-v8-${PLATFORM}-${ARCH}.tar.gz`;
const url = `https://github.com/WiseLibs/better-sqlite3/releases/download/v${VERSION}/${filename}`;

const destDir = path.join(__dirname, '..', 'node_modules', 'better-sqlite3', 'prebuilds', `${PLATFORM}-${ARCH}`);
const destFile = path.join(destDir, 'better_sqlite3.node');

// Skip if already installed
if (fs.existsSync(destFile)) {
  console.log('better-sqlite3 prebuilt already present, skipping download.');
  process.exit(0);
}

// Also skip if npm install ran WITH scripts (binary was compiled natively)
const releaseFile = path.join(__dirname, '..', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
if (fs.existsSync(releaseFile)) {
  console.log('better-sqlite3 native binary already compiled, skipping download.');
  process.exit(0);
}

console.log(`Downloading better-sqlite3 NAPI prebuilt for ${PLATFORM}-${ARCH}...`);
console.log(`URL: ${url}`);

fs.mkdirSync(destDir, { recursive: true });

const tmpFile = path.join(os.tmpdir(), filename);

function download(url, dest, cb) {
  const file = fs.createWriteStream(dest);
  function get(url) {
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        return get(res.headers.location);
      }
      if (res.statusCode !== 200) {
        console.error(`Download failed: HTTP ${res.statusCode}`);
        process.exit(1);
      }
      res.pipe(file);
      file.on('finish', () => file.close(cb));
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      console.error('Download error:', err.message);
      process.exit(1);
    });
  }
  get(url);
}

download(url, tmpFile, () => {
  console.log('Download complete. Extracting...');
  
  try {
    // Use tar command (available on Windows 10+, macOS, Linux)
    const extractDir = path.join(os.tmpdir(), 'bsql3-extract');
    fs.mkdirSync(extractDir, { recursive: true });
    execSync(`tar -xzf "${tmpFile}" -C "${extractDir}"`, { stdio: 'pipe' });
    
    // Find the .node file
    function findNode(dir) {
      for (const f of fs.readdirSync(dir)) {
        const full = path.join(dir, f);
        if (f === 'better_sqlite3.node') return full;
        if (fs.statSync(full).isDirectory()) {
          const found = findNode(full);
          if (found) return found;
        }
      }
      return null;
    }
    
    const nodeFile = findNode(extractDir);
    if (!nodeFile) {
      console.error('Could not find better_sqlite3.node in archive');
      process.exit(1);
    }
    
    fs.copyFileSync(nodeFile, destFile);
    fs.rmSync(extractDir, { recursive: true, force: true });
    fs.unlinkSync(tmpFile);
    
    console.log(`✓ better-sqlite3 NAPI prebuilt installed successfully`);
    console.log(`  → ${destFile}`);
  } catch (err) {
    console.error('Extraction failed:', err.message);
    console.error('You may need to install Visual Studio Build Tools.');
    console.error('Or use Node.js v20 LTS which has prebuilt binaries bundled.');
    process.exit(1);
  }
});
