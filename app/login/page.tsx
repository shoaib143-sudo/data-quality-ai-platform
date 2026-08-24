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

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-6 rounded-xl border p-8 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in to the Data Quality platform.</p>
        </div>
        <label className="block text-sm">Email<input required autoComplete="email" type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full rounded-md border px-3 py-2" /></label>
        <div>
          <label className="block text-sm">Password<input required autoComplete="current-password" type="password" value={password} onChange={e => setPassword(e.target.value)} className="mt-2 w-full rounded-md border px-3 py-2" /></label>
          <a className="mt-2 inline-block text-sm underline" href={`/forgot-password?email=${encodeURIComponent(email)}`}>Forgot password?</a>
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {searchParams.get('error') && !error && <p role="alert" className="text-sm text-red-600">Authentication could not be completed. Please try again.</p>}
        {searchParams.get('reset') === 'success' && <p role="status" className="text-sm">Your password has been updated. Please sign in.</p>}
        <button disabled={loading} className="w-full rounded-md bg-black px-4 py-2 text-white disabled:opacity-50">{loading ? 'Signing in…' : 'Sign in'}</button>
        <p className="text-sm text-muted-foreground">Need an account? <a className="underline" href={`/signup?next=${encodeURIComponent(next)}`}>Create one</a></p>
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
