'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { OpenRouterConnect } from './openrouter-connect'
import { GitHubConnect } from '@/features/setup/components/github-connect'
import { GitLabConnect } from '@/features/setup/components/gitlab-connect'

/**
 * Connections section showing GitHub and GitLab token connections
 */
export function ConnectionsSection({ id }: { id?: string }) {
  return (
    <Card id={id}>
      <CardHeader>
        <CardTitle className="text-lg">Conexiones</CardTitle>
        <CardDescription>
          Conecta OpenRouter, GitHub o GitLab
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <OpenRouterConnect />
        <GitHubConnect />
        <GitLabConnect />
      </CardContent>
    </Card>
  )
}
