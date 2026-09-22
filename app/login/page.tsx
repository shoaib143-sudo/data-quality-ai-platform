'use client'

import { FormEvent, Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { safeAuthReturnPath } from '@/lib/auth/safe-auth-return-path'
import { AuthShell, authFieldClass, authPrimaryButtonClass, authSecondaryButtonClass } from '@/components/auth/auth-shell'

function LoginPage() {
  const searchParams = useSearchParams()
  const next = safeAuthReturnPath(searchParams.get('next'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [ssoLoading, setSsoLoading] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    window.location.assign(next)
  }

  async function signInWithSso() {
    const domain = email.trim().split('@').at(-1)?.toLowerCase()
    if (!domain || !email.includes('@')) {
      setError('Enter your work email first so the correct enterprise identity provider can be selected.')
      return
    }
    setSsoLoading(true)
    setError('')
    const supabase = createClient()
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
    const { data, error: ssoError } = await supabase.auth.signInWithSSO({ domain, options: { redirectTo } })
    if (ssoError || !data?.url) {
      setError(ssoError?.message ?? 'No enterprise SSO provider is configured for this email domain.')
      setSsoLoading(false)
      return
    }
    window.location.assign(data.url)
  }

  return (
    <AuthShell eyebrow="Welcome back" title="Sign in" description="Continue to your governed DataNexus workspace.">
      <form onSubmit={onSubmit} className="space-y-5">
        <label className="block text-sm font-medium">Email<input required name="email" autoComplete="email" type="email" value={email} onChange={e => setEmail(e.target.value)} className={authFieldClass} /></label>
        <div>
          <label className="block text-sm font-medium">Password<input required name="password" autoComplete="current-password" type="password" value={password} onChange={e => setPassword(e.target.value)} className={authFieldClass} /></label>
          <a className="mt-2 inline-block text-sm font-semibold text-sky-300 hover:text-sky-200" href={`/forgot-password?email=${encodeURIComponent(email)}`}>Forgot password?</a>
        </div>
        {error && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
        {searchParams.get('error') && !error && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">Authentication could not be completed. Please try again.</p>}
        {searchParams.get('reset') === 'success' && <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">Your password has been updated. Please sign in.</p>}
        <button type="submit" disabled={loading || ssoLoading} className={authPrimaryButtonClass}>{loading ? 'Signing in…' : 'Sign in'}</button>
        <div className="flex items-center gap-3"><span className="h-px flex-1 bg-white/10" /><span className="text-[10px] font-black uppercase tracking-[.16em] text-slate-600">or</span><span className="h-px flex-1 bg-white/10" /></div>
        <button type="button" onClick={() => void signInWithSso()} disabled={loading || ssoLoading} className={authSecondaryButtonClass}>{ssoLoading ? 'Opening enterprise SSO…' : 'Continue with Enterprise SSO'}</button>
        <p className="text-xs leading-5 text-slate-500">Enterprise SSO uses the SAML 2.0 provider registered for your work email domain. SSO accounts are mapped to governed organization access after successful authentication.</p>
        <p className="text-sm text-slate-500">Need an account? <a className="font-semibold text-sky-300 hover:text-sky-200" href={`/signup?next=${encodeURIComponent(next)}`}>Create one</a></p>
      </form>
    </AuthShell>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<main id="main-content" tabIndex={-1} className="flex min-h-screen items-center justify-center">Loading…</main>}>
      <LoginPage />
    </Suspense>
  )
}
