'use client'

import { FormEvent, Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function ForgotPasswordPage() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })

    if (error) setError(error.message)
    else setMessage('If an account exists for that email, a password reset link has been sent.')
    setLoading(false)
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-6 rounded-xl border p-8 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold">Reset your password</h1>
          <p className="mt-2 text-sm text-muted-foreground">Enter your email and we&apos;ll send you a reset link.</p>
        </div>
        <label className="block text-sm">
          Email
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-md border px-3 py-2" />
        </label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {message && <p role="status" className="text-sm">{message}</p>}
        <button disabled={loading} className="w-full rounded-md bg-black px-4 py-2 text-white disabled:opacity-50">
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
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
