import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertCircle } from 'lucide-react'
import { useMcpConfig } from '../hooks/use-mcp-config'
import { PLATFORMS } from '../lib/platforms'
import { PlatformSnippet } from './platform-snippet'

export function McpSetupContent() {
  const { data: mcpConfig, isLoading, error } = useMcpConfig()

  if (isLoading) {
    return (
      <div className="max-w-3xl space-y-6 animate-in fade-in duration-300">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !mcpConfig) {
    return (
      <div className="flex max-w-3xl items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <AlertCircle className="size-5 shrink-0 text-destructive" />
        <div>
          <p className="text-sm font-medium">Failed to load MCP configuration</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {error?.message || 'Could not connect to the server'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">MCP Setup</h1>
        <p className="mt-1 text-sm text-muted-foreground md:text-base">
          Connect your AI coding tools to Agent Board via MCP (Model Context Protocol). Copy the
          configuration snippet for your platform and paste it into the corresponding config file.
        </p>
      </div>

      {/* Server info summary */}
      <div className="text-sm text-muted-foreground">
        Endpoint:{' '}
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{mcpConfig.url}</code>
      </div>

      {/* Platform tabs */}
      <Tabs defaultValue="claude-code">
        <TabsList className="h-auto w-full justify-start gap-1 bg-transparent p-0 flex-wrap">
          {PLATFORMS.map((p) => (
            <TabsTrigger
              key={p.id}
              value={p.id}
              className="rounded-full px-3 py-1.5 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              {p.name}
            </TabsTrigger>
          ))}
        </TabsList>
        {PLATFORMS.map((p) => (
          <TabsContent key={p.id} value={p.id} className="mt-4">
            <PlatformSnippet platform={p} mcpConfig={mcpConfig} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
