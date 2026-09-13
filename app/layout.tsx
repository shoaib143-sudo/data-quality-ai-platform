import { Analytics } from '@vercel/analytics/next'
import { Suspense } from 'react'
import type { Metadata, Viewport } from 'next'
import { ProfileMenu } from '@/components/app-shell/profile-menu'
import { FloatingDataNexusAgent } from '@/components/ai/floating-datanexus-agent'
import './globals.css'
import './legacy-dark-compat.css'

export const metadata: Metadata = {
  title: 'DataNexus AI',
  description: 'Business-first data governance, quality and profiling intelligence',
  generator: 'v0.app',
  icons: {
    icon: [
      { url: '/icon-light-32x32.png', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark-32x32.png', media: '(prefers-color-scheme: dark)' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#061426',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        {children}
        <ProfileMenu />
        <Suspense fallback={null}><FloatingDataNexusAgent /></Suspense>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
