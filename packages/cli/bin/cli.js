#!/usr/bin/env node

/**
 * agent-board CLI
 *
 * Lightweight wrapper that downloads and runs the agent-board binary.
 * The binary is a Bun-compiled standalone executable that includes:
 *   - Express API server
 *   - React SPA frontend (static)
 *   - SQLite database (sql.js + WASM)
 *   - All agent logic
 *
 * Usage: npx agent-board [--port <number>]
 */

import { existsSync, mkdirSync, chmodSync, rmSync, createWriteStream, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform, arch } from 'node:os';
import { spawn } from 'node:child_process';
import { get as httpsGet } from 'node:https';

// ── Config ──────────────────────────────────────────────────────────
const VERSION = '0.1.0';
const GITHUB_OWNER = 'your-username';
const GITHUB_REPO = 'agent-board';
const RELEASE_BASE_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download`;

// ── Platform detection ──────────────────────────────────────────────
function getPlatformInfo() {
  const plat = platform();
  const ar = arch();

  const platformMap = {
    win32: 'win',
    darwin: 'macos',
    linux: 'linux',
  };

  const archMap = {
    x64: 'x64',
    arm64: 'arm64',
  };

  const os = platformMap[plat];
  const cpu = archMap[ar];

  if (!os || !cpu) {
    console.error(`Unsupported platform: ${plat}-${ar}`);
    console.error('Supported: win-x64, macos-x64, macos-arm64, linux-x64, linux-arm64');
    process.exit(1);
  }

  const ext = plat === 'win32' ? '.exe' : '';
  const binaryName = `agent-board-${os}-${cpu}${ext}`;

  return { os, cpu, binaryName, ext };
}

// ── Cache management ────────────────────────────────────────────────
function getCacheDir() {
  const base = process.env.XDG_CACHE_HOME || join(homedir(), '.cache');
  return join(base, 'agent-board', `v${VERSION}`);
}

function getCachedBinaryPath() {
  const { binaryName } = getPlatformInfo();
  return join(getCacheDir(), binaryName);
}

// ── Download with progress ──────────────────────────────────────────
function download(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (url) => {
      httpsGet(url, (res) => {
        // Follow redirects (GitHub releases redirect to CDN)
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return follow(res.headers.location);
        }

        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          return;
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;
        const file = createWriteStream(dest);

        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (totalBytes > 0) {
            const pct = Math.round((downloadedBytes / totalBytes) * 100);
            const mb = (downloadedBytes / 1024 / 1024).toFixed(1);
            const totalMb = (totalBytes / 1024 / 1024).toFixed(1);
            process.stdout.write(`\r  Downloading... ${mb}MB / ${totalMb}MB (${pct}%)`);
          }
        });

        res.pipe(file);

        file.on('finish', () => {
          file.close();
          if (totalBytes > 0) {
            process.stdout.write('\n');
          }
          resolve();
        });

        file.on('error', (err) => {
          unlinkSync(dest);
          reject(err);
        });
      }).on('error', reject);
    };

    follow(url);
  });
}

// ── Download binary from GitHub Releases ────────────────────────────
async function downloadBinary() {
  const { binaryName } = getPlatformInfo();
  const url = `${RELEASE_BASE_URL}/v${VERSION}/${binaryName}`;
  const dest = getCachedBinaryPath();
  const cacheDir = getCacheDir();

  // Ensure cache directory exists
  mkdirSync(cacheDir, { recursive: true });

  console.log(`\n  agent-board v${VERSION}`);
  console.log(`  Binary: ${binaryName}`);
  console.log(`  Cache:  ${cacheDir}\n`);

  try {
    await download(url, dest);
  } catch (err) {
    console.error(`\n  Failed to download binary from:\n  ${url}\n`);
    console.error(`  ${err.message}\n`);
    console.error('  Possible causes:');
    console.error('  - No release found for this version');
    console.error('  - No binary available for your platform');
    console.error('  - Network connectivity issue\n');
    process.exit(1);
  }

  // Make executable on Unix
  if (platform() !== 'win32') {
    chmodSync(dest, 0o755);
  }

  console.log('  Download complete.\n');
}

// ── Run the binary ──────────────────────────────────────────────────
function runBinary(args) {
  const binaryPath = getCachedBinaryPath();

  const child = spawn(binaryPath, args, {
    stdio: 'inherit',
    env: { ...process.env },
  });

  child.on('error', (err) => {
    if (err.code === 'EACCES') {
      console.error('\n  Permission denied. Try: chmod +x ' + binaryPath);
    } else if (err.code === 'ENOENT') {
      console.error('\n  Binary not found. Cache may be corrupted.');
      console.error('  Try deleting: ' + getCacheDir());
    } else {
      console.error(`\n  Failed to start agent-board: ${err.message}`);
    }
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });

  // Forward signals to child
  const signals = ['SIGTERM', 'SIGINT'];
  for (const sig of signals) {
    process.on(sig, () => {
      child.kill(sig);
    });
  }
}

// ── CLI argument parsing ────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
  agent-board v${VERSION}

  Usage: npx agent-board [options]

  Options:
    --port <number>   Server port (default: auto-detect)
    --no-open         Don't open browser automatically
    --clear-cache     Delete cached binary and re-download
    --version, -v     Show version
    --help, -h        Show this help

  The binary is cached at: ${getCacheDir()}
`);
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(`agent-board v${VERSION}`);
    process.exit(0);
  }

  if (args.includes('--clear-cache')) {
    const cacheDir = getCacheDir();
    if (existsSync(cacheDir)) {
      rmSync(cacheDir, { recursive: true });
      console.log(`  Cache cleared: ${cacheDir}`);
    } else {
      console.log('  No cache to clear.');
    }
    process.exit(0);
  }

  return args;
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs();
  const binaryPath = getCachedBinaryPath();

  // Download if not cached
  if (!existsSync(binaryPath)) {
    await downloadBinary();
  }

  // Run the binary, forwarding all args
  runBinary(args);
}

main().catch((err) => {
  console.error(`\n  Unexpected error: ${err.message}\n`);
  process.exit(1);
});
