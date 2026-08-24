'use client'

import { FormEvent, Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function safeNext(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard'
  return value
}

function SignupPage() {
  const searchParams = useSearchParams()
  const next = safeNext(searchParams.get('next'))
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
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-6 rounded-xl border p-8 shadow-sm">
        <div><h1 className="text-2xl font-semibold">Create account</h1><p className="mt-2 text-sm text-muted-foreground">Create your platform account.</p></div>
        <label className="block text-sm">Email<input required autoComplete="email" type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full rounded-md border px-3 py-2" /></label>
        <label className="block text-sm">Password<input required minLength={8} autoComplete="new-password" type="password" value={password} onChange={e => setPassword(e.target.value)} className="mt-2 w-full rounded-md border px-3 py-2" /></label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {message && <p role="status" className="text-sm">{message}</p>}
        <button disabled={loading} className="w-full rounded-md bg-black px-4 py-2 text-white disabled:opacity-50">{loading ? 'Creating…' : 'Create account'}</button>
        <p className="text-sm text-muted-foreground">Already registered? <a className="underline" href={`/login?next=${encodeURIComponent(next)}`}>Sign in</a></p>
      </form>
    </main>
  )
}


export default function Page() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center">Loading…</main>}>
      <SignupPage />
    </Suspense>
  )
}
