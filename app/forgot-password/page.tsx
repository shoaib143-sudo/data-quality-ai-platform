'use client'

import { FormEvent, Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AuthShell, authFieldClass, authPrimaryButtonClass } from '@/components/auth/auth-shell'

const COOLDOWN_MS = 60_000

function friendlyAuthError(message: string) {
  if (/rate limit/i.test(message)) return 'Too many authentication emails were requested recently. Please wait about a minute before trying again. Repeated clicks will extend the problem.'
  return 'We could not send the reset email right now. Please wait briefly and try again.'
}

function ForgotPasswordPage() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    if (!cooldownUntil) return
    const update = () => setRemaining(Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [cooldownUntil])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (cooldownUntil > Date.now()) return
    setLoading(true)
    setError('')
    setMessage('')

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })

    const nextAllowed = Date.now() + COOLDOWN_MS
    setCooldownUntil(nextAllowed)
    if (error) setError(friendlyAuthError(error.message))
    else setMessage('If an account exists for that email, a password reset link has been sent. Please check your inbox and junk folder before requesting another email.')
    setLoading(false)
  }

  const coolingDown = remaining > 0

  return (
    <AuthShell eyebrow="Account recovery" title="Reset your password" description="Request one secure reset link. To protect email delivery, DataNexus applies a short cooldown between requests.">
      <form onSubmit={onSubmit} className="space-y-5">
        <label className="block text-sm">
          Email
          <input required name="email" autoComplete="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={authFieldClass} />
        </label>
        {error && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
        {message && <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">{message}</p>}
        <button type="submit" disabled={loading || coolingDown} className={authPrimaryButtonClass}>
          {loading ? 'Sending…' : coolingDown ? `Try again in ${remaining}s` : 'Send reset link'}
        </button>
        <p className="text-sm leading-6 text-slate-500">If you were just invited, use the invitation email first. It will take you directly to password setup.</p>
        <p className="text-sm leading-6 text-slate-500"><a className="font-semibold text-sky-300 hover:text-sky-200" href="/login">Back to sign in</a></p>
      </form>
    </AuthShell>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<main id="main-content" tabIndex={-1} className="flex min-h-screen items-center justify-center">Loading…</main>}>
      <ForgotPasswordPage />
    </Suspense>
  )
}
