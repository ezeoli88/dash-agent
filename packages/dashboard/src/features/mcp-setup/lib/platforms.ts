export interface Platform {
  id: string
  name: string
  configPath: string
  notes?: string
  buildSnippet: (url: string) => string
}

export const PLATFORMS: Platform[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    configPath: '.mcp.json (project) or ~/.claude.json → mcpServers (global)',
    buildSnippet: (url) => {
      return JSON.stringify(
        { mcpServers: { 'agent-board': { type: 'http', url } } },
        null,
        2
      )
    },
  },
  {
    id: 'vscode',
    name: 'VS Code (Copilot)',
    configPath: '.vscode/mcp.json',
    buildSnippet: (url) => {
      return JSON.stringify(
        { servers: { 'agent-board': { type: 'http', url } } },
        null,
        2
      )
    },
  },
  {
    id: 'cursor',
    name: 'Cursor',
    configPath: '.cursor/mcp.json (project) or ~/.cursor/mcp.json (global)',
    buildSnippet: (url) => {
      return JSON.stringify(
        { mcpServers: { 'agent-board': { url } } },
        null,
        2
      )
    },
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    configPath: '~/.codeium/windsurf/mcp_config.json',
    buildSnippet: (url) => {
      return JSON.stringify(
        { mcpServers: { 'agent-board': { serverUrl: url } } },
        null,
        2
      )
    },
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    configPath: '~/.codex/config.toml',
    notes: 'Codex uses TOML format.',
    buildSnippet: (url) => {
      return `[mcp_servers.agent-board]\nurl = "${url}"\n`
    },
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    configPath: '~/.gemini/settings.json (global) or .gemini/settings.json (project)',
    buildSnippet: (url) => {
      return JSON.stringify(
        { mcpServers: { 'agent-board': { url } } },
        null,
        2
      )
    },
  },
]
