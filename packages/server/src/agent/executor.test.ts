import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ToolExecutor } from './executor.js';

describe('ToolExecutor', () => {
  let workspacePath = '';
  let executor: ToolExecutor;

  beforeEach(async () => {
    workspacePath = await mkdtemp(path.join(tmpdir(), 'tool-executor-test-'));
    executor = new ToolExecutor(workspacePath, 'task-1');
  });

  afterEach(async () => {
    if (workspacePath) {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it('rejects read_file path traversal outside workspace', async () => {
    const result = await executor.execute('read_file', { path: '../outside.txt' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Path must be within the workspace');
  });

  it('rejects write_file path traversal outside workspace', async () => {
    const result = await executor.execute('write_file', { path: '../outside.txt', content: 'nope' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Path must be within the workspace');
  });

  it('writes and reads files inside workspace', async () => {
    const writeResult = await executor.execute('write_file', {
      path: 'src/hello.txt',
      content: 'hello-world',
    });

    expect(writeResult.success).toBe(true);

    const readResult = await executor.execute('read_file', { path: 'src/hello.txt' });

    expect(readResult.success).toBe(true);
    expect(readResult.output).toContain('hello-world');

    const fullPath = path.join(workspacePath, 'src', 'hello.txt');
    const content = await readFile(fullPath, 'utf-8');
    expect(content).toBe('hello-world');
  });

  it('blocks commands that are not allowed by whitelist', async () => {
    const result = await executor.execute('run_command', { command: 'curl https://example.com' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Command not allowed');
  });

  it('blocks search_files outside workspace', async () => {
    const result = await executor.execute('search_files', {
      pattern: 'TODO',
      path: '../',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Path must be within the workspace');
  });

  it('fails unknown tool names explicitly', async () => {
    const result = await executor.execute('unsupported_tool', {});

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unknown tool: unsupported_tool');
  });
});
