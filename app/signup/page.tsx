'use client'

import { FormEvent, Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { safeAuthReturnPath } from '@/lib/auth/safe-auth-return-path'
import { AuthShell, authFieldClass, authPrimaryButtonClass } from '@/components/auth/auth-shell'

function SignupPage() {
  const searchParams = useSearchParams()
  const next = safeAuthReturnPath(searchParams.get('next'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    const supabase = createClient()
    const callback = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: callback },
    })

    if (error) setError(error.message)
    else if (data.session) window.location.assign(next)
    else setMessage('Account created. Check your email to confirm your address.')
    setLoading(false)
  }

  return (
    <AuthShell eyebrow="Get started" title="Create account" description="Create your DataNexus identity. Governed organization access is resolved separately after authentication.">
      <form onSubmit={onSubmit} className="space-y-5">
        <label className="block text-sm">Email<input required name="email" autoComplete="email" type="email" value={email} onChange={e => setEmail(e.target.value)} className={authFieldClass} /></label>
        <label className="block text-sm">Password<input required name="password" minLength={8} autoComplete="new-password" type="password" value={password} onChange={e => setPassword(e.target.value)} className={authFieldClass} /></label>
        {error && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
        {message && <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">{message}</p>}
        <button type="submit" disabled={loading} className={authPrimaryButtonClass}>{loading ? 'Creating…' : 'Create account'}</button>
        <p className="text-sm text-slate-500">Already registered? <a className="font-semibold text-sky-300 hover:text-sky-200" href={`/login?next=${encodeURIComponent(next)}`}>Sign in</a></p>
      </form>
    </AuthShell>
  )
}


export default function Page() {
  return (
    <Suspense fallback={<main id="main-content" tabIndex={-1} className="flex min-h-screen items-center justify-center">Loading…</main>}>
      <SignupPage />
    </Suspense>
  )
}
