'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Copy, KeyRound, Loader2, Plus, Save, ShieldCheck } from 'lucide-react'

type Organization = { id: string; name: string; currentRole: 'OWNER' | 'ADMIN' }
type SsoDomain = { id: string; organization_id: string; domain: string; provider_id: string | null; auto_join: boolean; default_role: string; enabled: boolean; updated_at: string }
type ScimDirectory = { id: string; organization_id: string; name: string; default_role: string; enabled: boolean; created_at: string; last_used_at: string | null }

export function IdentityManager({ organizations }: { organizations: Organization[] }) {
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? '')
  const [domains, setDomains] = useState<SsoDomain[]>([])
  const [directories, setDirectories] = useState<ScimDirectory[]>([])
  const [domain, setDomain] = useState('')
  const [providerId, setProviderId] = useState('')
  const [autoJoin, setAutoJoin] = useState(false)
  const [defaultRole, setDefaultRole] = useState<'MEMBER' | 'ADMIN'>('MEMBER')
  const [directoryName, setDirectoryName] = useState('Enterprise directory')
  const [directoryRole, setDirectoryRole] = useState<'MEMBER' | 'ADMIN'>('MEMBER')
  const [oneTimeToken, setOneTimeToken] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const selected = useMemo(() => organizations.find((item) => item.id === organizationId), [organizations, organizationId])

  async function load() {
    if (!organizationId) return
    setError('')
    const response = await fetch(`/api/admin/identity?organizationId=${encodeURIComponent(organizationId)}`)
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) { setError(payload.error ?? 'Unable to load enterprise identity configuration.'); return }
    setDomains(payload.ssoDomains ?? [])
    setDirectories(payload.scimDirectories ?? [])
  }

  useEffect(() => { setOneTimeToken(''); void load() }, [organizationId])

  async function saveDomain(event: FormEvent) {
    event.preventDefault(); setBusy('domain'); setError(''); setMessage(''); setOneTimeToken('')
    try {
      const response = await fetch('/api/admin/identity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'UPSERT_SSO_DOMAIN', organizationId, domain, providerId: providerId || null, autoJoin, defaultRole, enabled: true }) })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'Unable to save SSO domain mapping.')
      setMessage('Enterprise SSO domain mapping saved.')
      setDomain(''); setProviderId('')
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save SSO domain mapping.') } finally { setBusy('') }
  }

  async function createDirectory(event: FormEvent) {
    event.preventDefault(); setBusy('scim'); setError(''); setMessage(''); setOneTimeToken('')
    try {
      const response = await fetch('/api/admin/identity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'CREATE_SCIM_DIRECTORY', organizationId, name: directoryName, defaultRole: directoryRole }) })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'Unable to create SCIM directory.')
      setOneTimeToken(payload.token ?? '')
      setMessage('SCIM directory created. Copy the token now. It will not be shown again.')
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create SCIM directory.') } finally { setBusy('') }
  }

  async function toggleDirectory(item: ScimDirectory) {
    setBusy(item.id); setError(''); setMessage(''); setOneTimeToken('')
    try {
      const response = await fetch('/api/admin/identity', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ organizationId, directoryId: item.id, enabled: !item.enabled, defaultRole: item.default_role }) })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'Unable to update SCIM directory.')
      setMessage(`SCIM directory ${item.enabled ? 'disabled' : 'enabled'}.`)
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update SCIM directory.') } finally { setBusy('') }
  }

  async function copyToken() {
    if (!oneTimeToken) return
    await navigator.clipboard.writeText(oneTimeToken)
    setMessage('SCIM token copied to clipboard. Store it in your identity provider secret configuration.')
  }

  return <div className="space-y-6">
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Enterprise identity</p><h2 className="mt-1 text-2xl font-black">SSO and directory provisioning</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Map approved SAML email domains to governed organizations and provision organization memberships through SCIM bearer-token directories.</p></div><label className="min-w-72 text-sm font-semibold">Organization<select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">{organizations.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.currentRole}</option>)}</select></label></div></section>

    <section className="grid gap-5 lg:grid-cols-2">
      <form onSubmit={(event) => void saveDomain(event)} className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-blue-600" /><h3 className="text-lg font-bold">SAML SSO domain mapping</h3></div><p className="mt-2 text-sm leading-6 text-slate-500">The SAML provider itself must be registered in Supabase Auth. This mapping controls tenant auto-join and default organization access after successful SSO.</p><div className="mt-5 grid gap-4"><label className="text-sm font-semibold">Work email domain<input required value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="company.com" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label><label className="text-sm font-semibold">Supabase SSO provider ID <span className="font-normal text-slate-400">optional for mapping</span><input value={providerId} onChange={(event) => setProviderId(event.target.value)} placeholder="Provider UUID" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-xs" /></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Default role<select value={defaultRole} onChange={(event) => setDefaultRole(event.target.value as 'MEMBER'|'ADMIN')} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"><option value="MEMBER">MEMBER</option><option value="ADMIN">ADMIN</option></select></label><label className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold"><input type="checkbox" checked={autoJoin} onChange={(event) => setAutoJoin(event.target.checked)} />Auto-join on SSO login</label></div><button disabled={busy === 'domain'} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy === 'domain' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save SSO mapping</button></div></form>

      <form onSubmit={(event) => void createDirectory(event)} className="rounded-3xl border border-violet-100 bg-white p-6 shadow-sm"><div className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-violet-600" /><h3 className="text-lg font-bold">SCIM 2.0 directory</h3></div><p className="mt-2 text-sm leading-6 text-slate-500">Create a directory-specific bearer token for automated user provisioning. Only its SHA-256 hash is stored. The plaintext token is returned once.</p><div className="mt-5 grid gap-4"><label className="text-sm font-semibold">Directory name<input required value={directoryName} onChange={(event) => setDirectoryName(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label><label className="text-sm font-semibold">Default organization role<select value={directoryRole} onChange={(event) => setDirectoryRole(event.target.value as 'MEMBER'|'ADMIN')} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"><option value="MEMBER">MEMBER</option><option value="ADMIN">ADMIN</option></select></label><button disabled={busy === 'scim'} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy === 'scim' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Create SCIM directory</button></div>{oneTimeToken ? <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-amber-800">One-time token</p><code className="mt-2 block break-all rounded-xl bg-white p-3 text-xs text-slate-800">{oneTimeToken}</code><button type="button" onClick={() => void copyToken()} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-300 px-3 py-2 text-xs font-bold text-amber-900"><Copy className="h-3.5 w-3.5" />Copy token</button></div> : null}</form>
    </section>

    {message ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p> : null}{error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

    <section className="grid gap-5 lg:grid-cols-2"><article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-lg font-bold">Configured SSO domains</h3><div className="mt-4 space-y-3">{domains.length ? domains.map((item) => <div key={item.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><span className="font-bold">{item.domain}</span><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{item.enabled ? 'ENABLED' : 'DISABLED'}</span></div><p className="mt-2 text-xs text-slate-500">Auto-join {item.auto_join ? 'enabled' : 'disabled'} · default {item.default_role} · provider {item.provider_id ? item.provider_id.slice(0, 8) : 'resolved by domain'}</p></div>) : <p className="text-sm text-slate-500">No SSO domain mappings configured.</p>}</div></article><article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-lg font-bold">SCIM directories</h3><div className="mt-4 space-y-3">{directories.length ? directories.map((item) => <div key={item.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-bold">{item.name}</p><p className="mt-1 text-xs text-slate-500">Default {item.default_role} · last used {item.last_used_at ? new Date(item.last_used_at).toLocaleString() : 'never'}</p></div><button type="button" disabled={busy === item.id} onClick={() => void toggleDirectory(item)} className={`rounded-lg px-3 py-2 text-xs font-bold ${item.enabled ? 'border border-red-200 text-red-600' : 'bg-emerald-600 text-white'}`}>{busy === item.id ? 'Saving…' : item.enabled ? 'Disable' : 'Enable'}</button></div></div>) : <p className="text-sm text-slate-500">No SCIM directories configured.</p>}</div></article></section>

    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="font-bold">Provisioning endpoints</h3><div className="mt-3 grid gap-2 font-mono text-xs text-slate-600"><code>/api/scim/v2/ServiceProviderConfig</code><code>/api/scim/v2/Users</code><code>/api/scim/v2/Users/&lt;user-id&gt;</code></div><p className="mt-3 text-xs leading-5 text-slate-500">SCIM deprovisioning removes organization membership rather than deleting the global authentication identity, protecting multi-tenant access and historical audit references.</p></section>
  </div>
}
