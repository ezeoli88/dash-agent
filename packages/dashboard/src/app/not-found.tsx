import Link from 'next/link'
import { FileQuestion, Home, ArrowLeft, ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <FileQuestion className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
            </div>

            <h1 className="text-4xl font-bold mb-2">404</h1>
            <h2 className="text-xl font-semibold mb-2">Page Not Found</h2>

            <p className="text-muted-foreground mb-6 max-w-sm">
              The page you are looking for does not exist, has been moved, or is temporarily unavailable.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto mb-6">
              <Button asChild className="w-full sm:w-auto">
                <Link href="/board">
                  <ClipboardList className="h-4 w-4 mr-2" />
                  Go to Tasks
                </Link>
              </Button>
              <Button variant="outline" asChild className="w-full sm:w-auto">
                <Link href="/">
                  <Home className="h-4 w-4 mr-2" />
                  Go Home
                </Link>
              </Button>
            </div>

            <div className="text-sm text-muted-foreground">
              <p>Looking for something specific? Try these:</p>
              <ul className="mt-2 space-y-1">
                <li>
                  <Link
                    href="/board"
                    className="text-primary hover:underline inline-flex items-center"
                  >
                    <ArrowLeft className="h-3 w-3 mr-1" />
                    View all tasks
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
