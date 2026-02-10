#!/usr/bin/env node

/**
 * agent-board CLI
 *
 * Lightweight wrapper that downloads, verifies, extracts, and runs
 * the agent-board binary from Cloudflare R2.
 *
 * Usage: npx ai-agent-board [--port <number>] [--no-open]
 */

import { existsSync, mkdirSync, rmSync, chmodSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform, arch } from 'node:os';
import { spawn } from 'node:child_process';
import { R2_BASE_URL, fetchJSON, downloadFile, verifySHA256 } from './download.js';

// ── Read version from package.json ─────────────────────────────────
const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
);
const VERSION = pkg.version;

// ── Platform detection ─────────────────────────────────────────────
function detectPlatform() {
  const plat = platform();
  const ar = arch();

  const map = {
    'linux-x64': 'linux-x64',
    'darwin-x64': 'macos-x64',
    'darwin-arm64': 'macos-arm64',
    'win32-x64': 'win-x64',
  };

  const key = `${plat}-${ar}`;
  const mapped = map[key];

  if (!mapped) {
    console.error(`\n  Unsupported platform: ${key}`);
    console.error('  Supported: linux-x64, macos-x64, macos-arm64, win-x64\n');
    process.exit(1);
  }

  return mapped;
}

// ── Cache management ───────────────────────────────────────────────
function getCacheDir(platformId) {
  const base = process.env.XDG_CACHE_HOME || join(homedir(), '.cache');
  return join(base, 'agent-board', `v${VERSION}`, platformId);
}

function getBinaryName() {
  return platform() === 'win32' ? 'agent-board.exe' : 'agent-board';
}

// ── ZIP extraction ─────────────────────────────────────────────────
async function extractZip(zipPath, destDir) {
  // adm-zip is the only external dependency
  const AdmZip = (await import('adm-zip')).default;
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destDir, /* overwrite */ true);
}

// ── Download, verify, and extract ──────────────────────────────────
async function downloadAndExtract(platformId, cacheDir) {
  const tag = `v${VERSION}`;
  const manifestUrl = `${R2_BASE_URL}/binaries/${tag}/manifest.json`;
  const zipUrl = `${R2_BASE_URL}/binaries/${tag}/${platformId}/agent-board.zip`;
  const zipDest = join(cacheDir, 'agent-board.zip');

  mkdirSync(cacheDir, { recursive: true });

  console.log(`\n  agent-board ${tag}`);
  console.log(`  Platform: ${platformId}`);
  console.log(`  Cache:    ${cacheDir}\n`);

  // 1. Fetch manifest for checksums
  let manifest;
  try {
    manifest = await fetchJSON(manifestUrl);
  } catch (err) {
    console.error(`  Failed to fetch manifest: ${err.message}`);
    console.error(`  URL: ${manifestUrl}\n`);
    process.exit(1);
  }

  const entry = manifest.platforms && manifest.platforms[platformId];
  if (!entry || !entry.sha256) {
    console.error(`  No checksum found for platform "${platformId}" in manifest.\n`);
    process.exit(1);
  }

  // 2. Download ZIP
  try {
    await downloadFile(zipUrl, zipDest, (downloaded, total) => {
      if (total > 0) {
        const pct = Math.round((downloaded / total) * 100);
        const mb = (downloaded / 1024 / 1024).toFixed(1);
        const totalMb = (total / 1024 / 1024).toFixed(1);
        process.stdout.write(`\r  Downloading... ${mb} MB / ${totalMb} MB (${pct}%)`);
      }
    });
    process.stdout.write('\n');
  } catch (err) {
    console.error(`\n  Failed to download: ${err.message}`);
    console.error(`  URL: ${zipUrl}\n`);
    cleanup(zipDest);
    process.exit(1);
  }

  // 3. Verify SHA-256
  process.stdout.write('  Verifying checksum... ');
  if (!verifySHA256(zipDest, entry.sha256)) {
    console.error('FAILED');
    console.error('\n  SHA-256 mismatch — the download may be corrupted or tampered with.');
    console.error('  Try running with --clear-cache and retry.\n');
    cleanup(zipDest);
    process.exit(1);
  }
  console.log('OK');

  // 4. Extract ZIP
  process.stdout.write('  Extracting... ');
  try {
    await extractZip(zipDest, cacheDir);
  } catch (err) {
    console.error('FAILED');
    console.error(`\n  Extraction error: ${err.message}\n`);
    cleanup(zipDest);
    process.exit(1);
  }
  console.log('OK');

  // 5. Clean up ZIP
  cleanup(zipDest);

  // 6. Make binary executable on Unix
  if (platform() !== 'win32') {
    const binPath = join(cacheDir, getBinaryName());
    chmodSync(binPath, 0o755);
  }

  console.log('  Download complete.\n');
}

function cleanup(filePath) {
  try {
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch {
    // Ignore cleanup errors
  }
}

// ── Auto-update check (non-blocking) ──────────────────────────────
function checkForUpdates() {
  const latestUrl = `${R2_BASE_URL}/latest.json`;

  fetchJSON(latestUrl)
    .then((data) => {
      if (data && data.version && data.version !== VERSION) {
        console.log(`\n  Update available: v${VERSION} -> v${data.version}`);
        console.log('  Run: npx ai-agent-board@latest\n');
      }
    })
    .catch(() => {
      // Silently ignore — this is a non-blocking check
    });
}

// ── Run the binary ─────────────────────────────────────────────────
function runBinary(cacheDir, args) {
  const binaryPath = join(cacheDir, getBinaryName());

  const child = spawn(binaryPath, args, {
    cwd: cacheDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      __BIN_MODE__: '1',
      AGENT_BOARD_USER_DIR: process.cwd(),
    },
  });

  child.on('error', (err) => {
    if (err.code === 'EACCES') {
      console.error('\n  Permission denied. Try: chmod +x ' + binaryPath);
    } else if (err.code === 'ENOENT') {
      console.error('\n  Binary not found. Cache may be corrupted.');
      console.error('  Try: npx ai-agent-board --clear-cache');
    } else {
      console.error(`\n  Failed to start agent-board: ${err.message}`);
    }
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });

  // Forward signals to child process
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, () => {
      child.kill(sig);
    });
  }
}

// ── CLI argument parsing ───────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
  agent-board v${VERSION}

  Usage: npx ai-agent-board [options]

  Options:
    --port <number>   Server port (default: 51767)
    --no-open         Don't open browser automatically
    --clear-cache     Delete cached binary and re-download
    --version, -v     Show version
    --help, -h        Show this help
`);
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(`agent-board v${VERSION}`);
    process.exit(0);
  }

  if (args.includes('--clear-cache')) {
    const base = process.env.XDG_CACHE_HOME || join(homedir(), '.cache');
    const versionCacheDir = join(base, 'agent-board', `v${VERSION}`);
    if (existsSync(versionCacheDir)) {
      rmSync(versionCacheDir, { recursive: true });
      console.log(`  Cache cleared: ${versionCacheDir}`);
    } else {
      console.log('  No cache to clear.');
    }
    process.exit(0);
  }

  return args;
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs();
  const platformId = detectPlatform();
  const cacheDir = getCacheDir(platformId);
  const binaryPath = join(cacheDir, getBinaryName());

  // Download if not cached
  if (!existsSync(binaryPath)) {
    await downloadAndExtract(platformId, cacheDir);
  }

  // Non-blocking update check
  checkForUpdates();

  // Run the binary, forwarding all CLI args
  runBinary(cacheDir, args);
}

main().catch((err) => {
  console.error(`\n  Unexpected error: ${err.message}\n`);
  process.exit(1);
});
