'use client'

import { FormEvent, Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function safeNext(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard'
  return value
}

function LoginPage() {
  const searchParams = useSearchParams()
  const next = safeNext(searchParams.get('next'))
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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-16">
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="mt-2 text-sm text-slate-500">Sign in to Data Governance PowerHouse.</p>
        </div>
        <label className="block text-sm font-medium">Email<input required autoComplete="email" type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
        <div>
          <label className="block text-sm font-medium">Password<input required autoComplete="current-password" type="password" value={password} onChange={e => setPassword(e.target.value)} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
          <a className="mt-2 inline-block text-sm underline" href={`/forgot-password?email=${encodeURIComponent(email)}`}>Forgot password?</a>
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {searchParams.get('error') && !error && <p role="alert" className="text-sm text-red-600">Authentication could not be completed. Please try again.</p>}
        {searchParams.get('reset') === 'success' && <p role="status" className="text-sm">Your password has been updated. Please sign in.</p>}
        <button disabled={loading || ssoLoading} className="w-full rounded-md bg-black px-4 py-2 text-white disabled:opacity-50">{loading ? 'Signing in…' : 'Sign in'}</button>
        <div className="flex items-center gap-3"><span className="h-px flex-1 bg-slate-200" /><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">or</span><span className="h-px flex-1 bg-slate-200" /></div>
        <button type="button" onClick={() => void signInWithSso()} disabled={loading || ssoLoading} className="w-full rounded-md border border-blue-200 bg-blue-50 px-4 py-2 font-semibold text-blue-700 disabled:opacity-50">{ssoLoading ? 'Opening enterprise SSO…' : 'Continue with Enterprise SSO'}</button>
        <p className="text-xs leading-5 text-slate-500">Enterprise SSO uses the SAML 2.0 provider registered for your work email domain. SSO accounts are mapped to governed organization access after successful authentication.</p>
        <p className="text-sm text-slate-500">Need an account? <a className="underline" href={`/signup?next=${encodeURIComponent(next)}`}>Create one</a></p>
      </form>
    </main>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center">Loading…</main>}>
      <LoginPage />
    </Suspense>
  )
}
