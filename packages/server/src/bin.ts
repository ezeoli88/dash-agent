/**
 * Binary entry point for agent-board.
 * Used with `bun build --compile` to create a standalone executable.
 *
 * Starts the server and opens the browser automatically.
 */

import { networkInterfaces } from 'os';

// Prevent index.ts from auto-starting the server
process.env['__BIN_MODE__'] = '1';

/**
 * Returns the first non-internal IPv4 address (LAN IP).
 * Falls back to 'localhost' if none found.
 */
function getLanIP(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    const interfaces = nets[name];
    if (!interfaces) continue;
    for (const iface of interfaces) {
      // Skip internal (loopback) and non-IPv4
      if (iface.internal || iface.family !== 'IPv4') continue;
      return iface.address;
    }
  }
  return 'localhost';
}

async function run(): Promise<void> {
  // Check for --no-open flag
  const noOpen = process.argv.includes('--no-open');

  // Dynamic import to ensure __BIN_MODE__ is set before index.ts loads
  const { main } = await import('./index.js');

  const { port, token } = await main();
  const lanIP = getLanIP();
  const tokenParam = token ? `?token=${token}` : '';
  const localUrl = `http://localhost:${port}${tokenParam}`;
  const lanUrl = `http://${lanIP}:${port}${tokenParam}`;

  console.log('');
  console.log('  ┌──────────────────────────────────────────┐');
  console.log('  │          agent-board is running           │');
  console.log('  └──────────────────────────────────────────┘');
  console.log('');
  console.log(`  Local:   ${localUrl}`);
  console.log(`  Network: ${lanUrl}`);
  if (token) {
    console.log(`  Auth:    Enabled (token in URL)`);
  } else {
    console.log(`  Auth:    DISABLED`);
  }
  console.log('');
  console.log('  Press Ctrl+C to stop');
  console.log('');

  // Open browser with LAN IP (accessible from other devices too)
  if (!noOpen) {
    try {
      const { exec } = await import('child_process');
      const cmd = process.platform === 'win32'
        ? `start ${lanUrl}`
        : process.platform === 'darwin'
          ? `open ${lanUrl}`
          : `xdg-open ${lanUrl}`;

      exec(cmd, (error) => {
        if (error) {
          console.log(`  Open ${lanUrl} in your browser manually`);
        }
      });
    } catch {
      console.log(`  Open ${lanUrl} in your browser manually`);
    }
  }
}

run().catch((error: Error) => {
  console.error('Failed to start agent-board:', error.message);
  process.exit(1);
});
