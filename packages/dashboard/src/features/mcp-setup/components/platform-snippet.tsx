import { CopyButton } from './copy-button'
import type { Platform } from '../lib/platforms'
import type { McpConfigResponse } from '../hooks/use-mcp-config'

interface PlatformSnippetProps {
  platform: Platform
  mcpConfig: McpConfigResponse
}

export function PlatformSnippet({ platform, mcpConfig }: PlatformSnippetProps) {
  const snippet = platform.buildSnippet(mcpConfig.url)

  return (
    <div className="space-y-3">
      {/* Config path */}
      <div className="text-sm text-muted-foreground">
        Config file:{' '}
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
          {platform.configPath}
        </code>
      </div>

      {/* Snippet code block */}
      <div className="relative rounded-lg bg-zinc-950 dark:bg-zinc-900 border">
        <div className="absolute right-2 top-2">
          <CopyButton value={snippet} />
        </div>
        <pre className="overflow-x-auto p-4 pr-12 text-sm font-mono text-zinc-100 leading-relaxed">
          <code>{snippet}</code>
        </pre>
      </div>

      {/* Notes */}
      {platform.notes && (
        <p className="text-xs italic text-muted-foreground">{platform.notes}</p>
      )}
    </div>
  )
}
