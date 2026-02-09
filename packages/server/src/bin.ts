/**
 * Binary entry point for agent-board.
 * Used with `bun build --compile` to create a standalone executable.
 *
 * Starts the server and opens the browser automatically.
 */

// Prevent index.ts from auto-starting the server
process.env['__BIN_MODE__'] = '1';

async function run(): Promise<void> {
  // Dynamic import to ensure __BIN_MODE__ is set before index.ts loads
  const { main } = await import('./index.js');

  const port = await main();
  const url = `http://localhost:${port}`;

  console.log(`\n  agent-board is running at ${url}\n`);

  // Open browser automatically
  try {
    const { exec } = await import('child_process');
    const cmd = process.platform === 'win32'
      ? `start ${url}`
      : process.platform === 'darwin'
        ? `open ${url}`
        : `xdg-open ${url}`;

    exec(cmd, (error) => {
      if (error) {
        console.log(`  Open ${url} in your browser manually`);
      }
    });
  } catch {
    console.log(`  Open ${url} in your browser manually`);
  }
}

run().catch((error: Error) => {
  console.error('Failed to start agent-board:', error.message);
  process.exit(1);
});
