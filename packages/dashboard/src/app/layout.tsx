import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Providers } from '@/components/shared/providers'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: {
    default: 'Agent Board',
    template: '%s | Agent Board',
  },
  description: 'Dashboard para gestionar tareas de un agente IA autonomo',
  keywords: ['AI', 'agent', 'tasks', 'automation', 'dashboard'],
  authors: [{ name: 'Agent Board' }],
  creator: 'Agent Board',
  metadataBase: new URL('http://localhost:3003'),
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    siteName: 'Agent Board',
    title: 'Agent Board',
    description: 'Dashboard para gestionar tareas de un agente IA autonomo',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        {/* Skip to main content link for accessibility */}
        <a
          href="#main-content"
          className="skip-link"
        >
          Skip to main content
        </a>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
