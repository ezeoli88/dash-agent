import { describe, expect, it } from 'vitest';
import { localRepoPath } from './github-url.js';

describe('localRepoPath', () => {
  it('keeps leading slash for unix file URLs', () => {
    expect(localRepoPath('file:///home/user/repo')).toBe('/home/user/repo');
  });

  it('keeps windows drive paths', () => {
    expect(localRepoPath('file://C:/Users/test/repo')).toBe('C:/Users/test/repo');
    expect(localRepoPath('file:///C:/Users/test/repo')).toBe('C:/Users/test/repo');
  });

  it('normalizes malformed unix file URLs without leading slash', () => {
    expect(localRepoPath('file://home/user/repo')).toBe('/home/user/repo');
  });
});
