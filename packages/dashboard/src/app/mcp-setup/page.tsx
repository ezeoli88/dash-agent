import { ArrowLeft } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { McpSetupContent } from '@/features/mcp-setup'

export default function McpSetupPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 p-6 md:p-10">
      <div className="mx-auto max-w-3xl">
        <Button variant="ghost" size="sm" asChild className="mb-6">
          <Link to="/repos">
            <ArrowLeft className="size-4 mr-1.5" />
            Volver
          </Link>
        </Button>
        <McpSetupContent />
      </div>
    </div>
  )
}
