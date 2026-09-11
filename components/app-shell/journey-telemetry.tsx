'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import type { ReactNode } from 'react'

type Stage = 'CONNECT' | 'DISCOVER' | 'PROFILE' | 'REMEDIATE' | 'VERIFY' | 'COMPLETE'

async function emitJourneyEvent(input: {
  projectId: string
  eventType: 'UX_JOURNEY_VIEWED' | 'UX_JOURNEY_NEXT_ACTION_SELECTED'
  stage: Stage
  completedStages: number
}) {
  try {
    await fetch('/api/ux/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify(input),
    })
  } catch {
    // Product telemetry must never block the governed user journey.
  }
}

export function JourneyViewTelemetry({
  projectId,
  stage,
  completedStages,
}: {
  projectId: string
  stage: Stage
  completedStages: number
}) {
  useEffect(() => {
    const key = `datanexus:ux-journey-view:${projectId}:${stage}:${completedStages}`
    try {
      if (window.sessionStorage.getItem(key)) return
      window.sessionStorage.setItem(key, '1')
    } catch {
      // Session storage availability is optional. Event delivery remains best effort.
    }
    void emitJourneyEvent({ projectId, eventType: 'UX_JOURNEY_VIEWED', stage, completedStages })
  }, [projectId, stage, completedStages])

  return null
}

export function TrackedJourneyLink({
  projectId,
  stage,
  completedStages,
  href,
  className,
  children,
}: {
  projectId: string
  stage: Stage
  completedStages: number
  href: string
  className?: string
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        void emitJourneyEvent({
          projectId,
          eventType: 'UX_JOURNEY_NEXT_ACTION_SELECTED',
          stage,
          completedStages,
        })
      }}
    >
      {children}
    </Link>
  )
}
