'use client'

import Link, { type LinkProps } from 'next/link'
import { useRouter } from 'next/navigation'
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react'

type TransitionDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => { finished: Promise<void> }
}

type Props = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps | 'href'> & {
    children: ReactNode
    transitionName: string
  }

function shouldUseNativeTransition(event: MouseEvent<HTMLAnchorElement>) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  return typeof (document as TransitionDocument).startViewTransition === 'function'
}

export function CardToPageLink({ href, transitionName, onClick, children, target, ...props }: Props) {
  const router = useRouter()

  return (
    <Link
      {...props}
      href={href}
      target={target}
      data-card-to-page={transitionName}
      onClick={(event) => {
        onClick?.(event)
        if (target === '_blank' || !shouldUseNativeTransition(event)) return

        event.preventDefault()
        const doc = document as TransitionDocument
        void doc.startViewTransition?.(async () => {
          router.push(typeof href === 'string' ? href : href.pathname ?? '/')
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        }).finished.catch(() => {
          router.push(typeof href === 'string' ? href : href.pathname ?? '/')
        })
      }}
    >
      {children}
    </Link>
  )
}
