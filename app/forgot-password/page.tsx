'use client'

import { FormEvent, Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-6 rounded-xl border p-8 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold">Reset your password</h1>
          <p className="mt-2 text-sm text-muted-foreground">Enter your email and we&apos;ll send one reset link. To protect email delivery, wait before requesting another.</p>
        </div>
        <label className="block text-sm">
          Email
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-md border px-3 py-2" />
        </label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
        <button disabled={loading || coolingDown} className="w-full rounded-md bg-black px-4 py-2 text-white disabled:opacity-50">
          {loading ? 'Sending…' : coolingDown ? `Try again in ${remaining}s` : 'Send reset link'}
        </button>
        <p className="text-sm text-muted-foreground">If you were just invited, use the invitation email first. It will take you directly to password setup.</p>
        <p className="text-sm text-muted-foreground"><a className="underline" href="/login">Back to sign in</a></p>
      </form>
    </main>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center">Loading…</main>}>
      <ForgotPasswordPage />
    </Suspense>
  )
}
