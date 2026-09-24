'use client'

import { FormEvent, Suspense, useState } from 'react'
import { ArrowRight, Building2, CheckCircle2, Eye, EyeOff, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { safeAuthReturnPath } from '@/lib/auth/safe-auth-return-path'

function LoginPage() {
  const searchParams = useSearchParams()
  const next = safeAuthReturnPath(searchParams.get('next'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [ssoLoading, setSsoLoading] = useState(false)
  const busy = loading || ssoLoading

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
      setError('Enter your work email first so DataNexus can select the correct enterprise identity provider.')
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
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#050b17] text-slate-100">
      <div className="mx-auto grid min-h-screen max-w-[1560px] lg:grid-cols-[1.08fr_.92fr]">
        <section className="relative hidden overflow-hidden border-r border-cyan-300/10 px-12 py-14 lg:flex lg:flex-col xl:px-16">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(34,211,238,.13),transparent_30%),radial-gradient(circle_at_78%_82%,rgba(168,85,247,.11),transparent_30%)]" />
          <div className="relative">
            <div className="inline-flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-cyan-500 via-blue-600 to-violet-600 font-black text-white shadow-[0_0_28px_rgba(34,211,238,.18)]">DN</span>
              <div>
                <p className="text-lg font-black tracking-tight text-white">DataNexus AI</p>
                <p className="text-xs text-slate-500">Trusted data. Better decisions.</p>
              </div>
            </div>

            <div className="mt-20 max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/[0.06] px-3 py-1.5 text-xs font-bold text-cyan-200">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Governed data intelligence
              </div>
              <h1 className="mt-6 text-5xl font-black leading-[1.04] tracking-[-0.045em] text-white xl:text-6xl">
                One trusted place to understand, improve and govern your data.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-slate-400">
                Move from discovery to profiling, quality, lineage and governed action without losing the evidence behind each decision.
              </p>
            </div>

            <div className="mt-10 grid max-w-2xl gap-3 sm:grid-cols-3">
              {[
                ['Evidence first', 'Every decision stays traceable to governed evidence.'],
                ['Role aware', 'Your workspace adapts to approved responsibilities.'],
                ['Fail closed', 'Sensitive actions remain protected by explicit authority.'],
              ].map(([title, detail]) => (
                <div key={title} className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4">
                  <CheckCircle2 className="h-4 w-4 text-cyan-300" aria-hidden="true" />
                  <p className="mt-3 text-sm font-bold text-slate-100">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative mt-auto flex items-center gap-3 pt-10 text-xs text-slate-600">
            <ShieldCheck className="h-4 w-4 text-cyan-400" aria-hidden="true" />
            Governed access · project-scoped authorization · auditable actions
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
          <div className="w-full max-w-[470px]">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-300/20 bg-gradient-to-br from-cyan-500 via-blue-600 to-violet-600 text-xs font-black text-white">DN</span>
              <div>
                <p className="font-black text-white">DataNexus AI</p>
                <p className="text-xs text-slate-500">Trusted data. Better decisions.</p>
              </div>
            </div>

            <div className="rounded-[28px] border border-cyan-300/12 bg-[#09192d]/95 p-6 shadow-[0_28px_80px_rgba(0,0,0,.38),0_0_36px_rgba(34,211,238,.04)] sm:p-8">
              <div className="flex items-start gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.07] text-cyan-200">
                  <LockKeyhole className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">Secure workspace</p>
                  <h2 className="mt-1 text-3xl font-black tracking-tight text-white">Welcome back</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">Sign in with your DataNexus account or continue through your organization&apos;s identity provider.</p>
                </div>
              </div>

              <form onSubmit={onSubmit} aria-busy={busy} className="mt-7 space-y-5">
                <label className="block text-sm font-semibold text-slate-200">
                  Work email
                  <input
                    required
                    name="email"
                    autoComplete="email"
                    type="email"
                    inputMode="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[#061321] px-3.5 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/45"
                  />
                </label>

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="password" className="text-sm font-semibold text-slate-200">Password</label>
                    <a className="text-xs font-bold text-cyan-300 hover:text-cyan-200" href={`/forgot-password?email=${encodeURIComponent(email)}`}>Forgot password?</a>
                  </div>
                  <div className="relative mt-2">
                    <input
                      id="password"
                      required
                      name="password"
                      autoComplete="current-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={event => setPassword(event.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-[#061321] px-3.5 py-3 pr-12 text-sm text-white outline-none focus:border-cyan-300/45"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(value => !value)}
                      className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500 hover:bg-white/[0.05] hover:text-slate-200"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </div>
                </div>

                {error ? (
                  <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.08] px-4 py-3 text-sm leading-6 text-rose-200">{error}</div>
                ) : null}
                {searchParams.get('error') && !error ? (
                  <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.08] px-4 py-3 text-sm leading-6 text-rose-200">Authentication could not be completed. Please try again.</div>
                ) : null}
                {searchParams.get('reset') === 'success' ? (
                  <div role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.08] px-4 py-3 text-sm leading-6 text-emerald-200">Your password has been updated. Please sign in.</div>
                ) : null}

                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-3 text-sm font-black text-white shadow-[0_0_24px_rgba(34,211,238,.12)] hover:from-blue-500 hover:to-cyan-500 disabled:opacity-50"
                >
                  {loading ? 'Signing in…' : 'Sign in'}
                  {!loading ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
                </button>

                <div className="flex items-center gap-3" aria-hidden="true">
                  <span className="h-px flex-1 bg-white/10" />
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">or use enterprise access</span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>

                <button
                  type="button"
                  onClick={() => void signInWithSso()}
                  disabled={busy}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.055] px-4 py-3 text-sm font-black text-cyan-100 hover:border-cyan-300/30 hover:bg-cyan-300/[0.09] disabled:opacity-50"
                >
                  <Building2 className="h-4 w-4" aria-hidden="true" />
                  {ssoLoading ? 'Opening enterprise SSO…' : 'Continue with Enterprise SSO'}
                </button>
              </form>

              <div className="mt-6 rounded-xl border border-white/[0.07] bg-[#061321]/80 p-4">
                <p className="text-xs leading-5 text-slate-500">
                  Enterprise SSO uses the SAML 2.0 provider registered for your work email domain. Successful sign-in is still mapped to governed organization and project access.
                </p>
              </div>

              <p className="mt-6 text-center text-sm text-slate-500">
                Need an account? <a className="font-bold text-cyan-300 hover:text-cyan-200" href={`/signup?next=${encodeURIComponent(next)}`}>Create one</a>
              </p>
            </div>

            <p className="mt-5 text-center text-[11px] leading-5 text-slate-600">Your sign-in route preserves only validated same-origin return paths.</p>
          </div>
        </section>
      </div>
    </main>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<main id="main-content" tabIndex={-1} className="grid min-h-screen place-items-center bg-[#050b17] text-sm text-slate-500">Preparing secure sign in…</main>}>
      <LoginPage />
    </Suspense>
  )
}
