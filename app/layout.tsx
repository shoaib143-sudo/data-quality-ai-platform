import { Analytics } from '@vercel/analytics/next'
import { Suspense } from 'react'
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { ProfileMenu } from '@/components/app-shell/profile-menu'
import { FloatingDataNexusAgent } from '@/components/ai/floating-datanexus-agent'
import './globals.css'
import './legacy-dark-compat.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

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
  themeColor: '#0b1422',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className="dn-page antialiased">
        <div
          className={inter.variable}
          style={{ fontFamily: 'var(--font-inter), Inter, ui-sans-serif, system-ui, sans-serif' }}
        >
          {children}
          <ProfileMenu />
          <Suspense fallback={null}><FloatingDataNexusAgent /></Suspense>
          {process.env.NODE_ENV === 'production' && <Analytics />}
        </div>
      </body>
    </html>
  )
}
