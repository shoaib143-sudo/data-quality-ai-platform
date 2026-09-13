'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Bot, Maximize2, Minimize2, Send, Sparkles, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Message = { role: 'user' | 'assistant'; content: string }
type CopilotResponse = {
  answer?: string
  suggestedFollowUps?: string[]
  sourceRoutes?: string[]
  persona?: string
  scope?: string
  error?: string
}

const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061426]'

export function FloatingDataNexusAgent() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [authenticated, setAuthenticated] = useState(false)
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [suggestions, setSuggestions] = useState<string[]>([
    'What needs my attention today?',
    'Explain what I am looking at',
    'Where should I go next?',
  ])
  const [sources, setSources] = useState<string[]>([])
  const [persona, setPersona] = useState('')
  const [scope, setScope] = useState('')
  const transcriptRef = useRef<HTMLDivElement | null>(null)

  const currentPath = useMemo(() => {
    const query = searchParams.toString()
    return query ? `${pathname}?${query}` : pathname
  }, [pathname, searchParams])

  useEffect(() => {
    const supabase = createClient()
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setAuthenticated(Boolean(data.session))
    })
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      setAuthenticated(Boolean(session))
      if (!session) {
        setOpen(false)
        setMessages([])
      }
    })
    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  useEffect(() => {
    if (!open || persona) return
    let active = true
    void fetch('/api/ai/copilot/chat', { cache: 'no-store' })
      .then(async response => {
        const payload = await response.json() as { persona?: string; starters?: string[] }
        if (!response.ok || !active) return
        setPersona(payload.persona || '')
        if (payload.starters?.length) setSuggestions(payload.starters.filter(Boolean).slice(0, 3))
      })
      .catch(() => undefined)
    return () => { active = false }
  }, [open, persona])

  useEffect(() => {
    setSources([])
    setScope('')
  }, [currentPath])

  if (!authenticated || pathname === '/login') return null

  async function ask(value: string) {
    const trimmed = value.trim()
    if (!trimmed || busy) return

    const nextMessages: Message[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(nextMessages)
    setQuestion('')
    setBusy(true)

    try {
      const response = await fetch('/api/ai/copilot/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          question: trimmed,
          path: currentPath,
          history: messages.slice(-8),
        }),
      })
      const payload = await response.json() as CopilotResponse
      if (!response.ok) throw new Error(payload.error || 'DataNexus AI could not answer this question.')

      setMessages(current => [...current, { role: 'assistant', content: payload.answer || 'No answer was returned.' }])
      setSuggestions(payload.suggestedFollowUps?.filter(Boolean).slice(0, 3) ?? [])
      setSources(payload.sourceRoutes?.filter(route => route.startsWith('/')).slice(0, 4) ?? [])
      setPersona(payload.persona || '')
      setScope(payload.scope || '')
    } catch (error) {
      setMessages(current => [...current, {
        role: 'assistant',
        content: error instanceof Error ? error.message : 'DataNexus AI is temporarily unavailable.',
      }])
    } finally {
      setBusy(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void ask(question)
  }

  return (
    <>
      <button
        type="button"
        aria-label={open ? 'Close DataNexus AI Agent' : 'Open DataNexus AI Agent'}
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        className={`fixed bottom-5 left-4 z-[120] grid h-12 w-12 place-items-center rounded-2xl border border-violet-400/35 bg-gradient-to-br from-violet-600 to-blue-600 text-white shadow-[0_16px_42px_rgba(37,99,235,.32)] hover:-translate-y-0.5 hover:shadow-[0_20px_52px_rgba(37,99,235,.42)] ${focus}`}
      >
        {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Bot className="h-5 w-5" aria-hidden="true" />}
      </button>

      {open ? (
        <section
          aria-label="DataNexus AI Agent"
          className={`fixed bottom-20 left-4 z-[119] flex max-h-[min(70vh,720px)] flex-col overflow-hidden rounded-[22px] border border-violet-400/25 bg-[#07182a]/98 shadow-[0_28px_90px_rgba(0,0,0,.55)] backdrop-blur-xl transition-all ${expanded ? 'h-[min(78vh,780px)] w-[min(720px,calc(100vw-2rem))]' : 'h-[min(620px,68vh)] w-[min(410px,calc(100vw-2rem))]'}`}
        >
          <header className="flex items-center justify-between gap-3 border-b border-white/[0.08] bg-gradient-to-r from-violet-600/15 via-blue-600/10 to-cyan-500/5 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-200">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white">DataNexus AI Agent</p>
                <p className="truncate text-[10px] text-slate-500">
                  {persona ? `${persona} copilot` : 'Persona-aware governed copilot'}{scope ? ` · ${scope}` : ''}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setExpanded(value => !value)}
              className={`grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/[0.06] hover:text-white ${focus}`}
              aria-label={expanded ? 'Compact AI Agent' : 'Expand AI Agent'}
            >
              {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </header>

          <div ref={transcriptRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {!messages.length ? (
              <div className="rounded-2xl border border-white/[0.07] bg-[#0a1d33] p-4">
                <p className="text-sm font-bold text-white">Ask about the page you are on.</p>
                <p className="mt-2 text-xs leading-5 text-slate-400">I use your resolved persona, current page scope and governed evidence available to your account. I will not treat an AI suggestion as governance authority.</p>
              </div>
            ) : null}

            {messages.map((message, index) => (
              <div key={index} className={message.role === 'user' ? 'ml-8' : 'mr-8'}>
                <div className={`rounded-2xl px-3.5 py-3 text-sm leading-6 ${message.role === 'user' ? 'bg-blue-600 text-white' : 'border border-white/[0.07] bg-[#0a1d33] text-slate-200'}`}>
                  {message.content}
                </div>
              </div>
            ))}
            {busy ? <div className="mr-8 rounded-2xl border border-white/[0.07] bg-[#0a1d33] px-3.5 py-3 text-sm text-slate-400">Reviewing governed evidence…</div> : null}
          </div>

          {(suggestions.length || sources.length) ? (
            <div className="border-t border-white/[0.07] px-4 py-3">
              {suggestions.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map(item => (
                    <button key={item} type="button" disabled={busy} onClick={() => void ask(item)} className={`rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:border-cyan-400/25 hover:text-white disabled:opacity-50 ${focus}`}>
                      {item}
                    </button>
                  ))}
                </div>
              ) : null}
              {sources.length ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-600">Evidence</span>
                  {sources.map(route => (
                    <Link key={route} href={route} className={`inline-flex items-center gap-1 text-[11px] font-bold text-cyan-300 hover:text-cyan-200 ${focus}`}>
                      {route}<ArrowRight className="h-3 w-3" />
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <form onSubmit={submit} className="flex items-end gap-2 border-t border-white/[0.08] bg-[#061426]/70 p-3">
            <label className="sr-only" htmlFor="datanexus-ai-question">Ask DataNexus AI</label>
            <textarea
              id="datanexus-ai-question"
              value={question}
              onChange={event => setQuestion(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  if (question.trim()) void ask(question)
                }
              }}
              rows={2}
              maxLength={2000}
              placeholder="Ask about risks, trusted data, issues, lineage, controls…"
              className={`min-h-[46px] flex-1 resize-none rounded-xl border border-white/10 bg-[#08182b] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 ${focus}`}
            />
            <button type="submit" disabled={busy || !question.trim()} className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 text-white disabled:opacity-40 ${focus}`} aria-label="Send question">
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
        </section>
      ) : null}
    </>
  )
}
