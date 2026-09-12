'use client'

import { useEffect, useRef, useState } from 'react'

// One request per resource. Abort on selection/unmount, ignore old responses,
// recover on focus, and keep terminal history refreshable without busy polling.
export function useMonitorPoll<T>(url: string | null, interval: number, refreshKey: number, terminal?: (data: T) => boolean) {
  const [result, setResult] = useState<{url: string; data: T; receivedAt: number} | null>(null)
  const [failure, setFailure] = useState<{url: string; message: string} | null>(null)
  const terminalRef = useRef(terminal)
  terminalRef.current = terminal
  useEffect(() => {
    if (!url) return
    let disposed = false
    let busy = false
    let failures = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined
    const load = async () => {
      if (disposed || document.hidden || busy) return
      busy = true
      controller = new AbortController()
      const timeout = setTimeout(() => controller?.abort(), 8000)
      let stopped = false
      try {
        const response = await fetch(url, {signal: controller.signal, cache: 'no-store'})
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? 'Monitoring request failed')
        if (disposed) return
        failures = 0
        stopped = terminalRef.current?.(data) ?? false
        setResult({url, data, receivedAt: Date.now()})
        setFailure(null)
      } catch (error) {
        if (!disposed) {
          failures++
          setFailure({url, message: error instanceof Error && error.name !== 'AbortError' ? error.message : 'Monitoring request timed out'})
        }
      } finally {
        clearTimeout(timeout)
        busy = false
        if (!disposed && !stopped) timer = setTimeout(load, Math.min(30000, interval * 2 ** failures))
      }
    }
    const resume = () => { clearTimeout(timer); if (!document.hidden) void load() }
    void load()
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('focus', resume)
    return () => {
      disposed = true
      controller?.abort()
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('focus', resume)
    }
  }, [url, interval, refreshKey])
  return {
    data: result?.url === url ? result.data : null,
    receivedAt: result?.url === url ? result.receivedAt : null,
    error: failure?.url === url ? failure.message : null,
  }
}
