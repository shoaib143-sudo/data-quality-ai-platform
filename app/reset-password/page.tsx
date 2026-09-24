'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AuthShell, authFieldClass, authPrimaryButtonClass } from '@/components/auth/auth-shell'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace('/login?error=reset_session')
    })
  }, [router])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError('Passwords do not match.')

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    await supabase.auth.signOut()
    router.replace('/login?reset=success')
  }

  return (
    <AuthShell eyebrow="Secure your account" title="Choose a new password" description="Set a new password for your DataNexus account.">
      <form onSubmit={onSubmit} className="space-y-5">
        <label className="block text-sm">New password<input required name="new-password" autoComplete="new-password" minLength={8} type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={authFieldClass} /></label>
        <label className="block text-sm">Confirm password<input required name="confirm-password" autoComplete="new-password" minLength={8} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={authFieldClass} /></label>
        {error && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
        <button type="submit" disabled={loading} className={authPrimaryButtonClass}>{loading ? 'Updating…' : 'Update password'}</button>
      </form>
    </AuthShell>
  )
}
