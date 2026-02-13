import { describe, expect, it } from 'vitest';
import { isCommandAllowed } from './whitelist.js';

describe('command whitelist', () => {
  it('allows a valid npm subcommand', () => {
    const result = isCommandAllowed('npm run test');

    expect(result.allowed).toBe(true);
  });

  it('rejects blocked commands', () => {
    const result = isCommandAllowed('curl https://example.com');

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toContain('blocked');
    }
  });

  it('rejects dangerous shell operators', () => {
    const result = isCommandAllowed('npm run test | cat');

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toContain("Shell operator '|'");
    }
  });

  it('rejects unknown commands', () => {
    const result = isCommandAllowed('custom-tool run');

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toContain('not in the allowed command list');
    }
  });

  it('rejects non-whitelisted subcommands', () => {
    const result = isCommandAllowed('npm publish');

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toContain("Subcommand 'publish'");
    }
  });

  it('allows command flags when base command is whitelisted', () => {
    const result = isCommandAllowed('npm --version');

    expect(result.allowed).toBe(true);
  });

  it('allows wildcard commands for node runtime', () => {
    const result = isCommandAllowed('node script.js');

    expect(result.allowed).toBe(true);
  });
});
