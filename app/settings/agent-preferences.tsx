'use client'

import { useState } from 'react'
import type { PersonaConversationDefault } from '@/lib/governance/persona-conversation-defaults'

export function AgentPreferences({
  initial,
  agents,
}: {
  initial: PersonaConversationDefault
  agents: { key: string; name: string }[]
}) {
  const [responseDepth, setResponseDepth] = useState(initial.responseDepth)
  const [evidenceDepth, setEvidenceDepth] = useState(initial.evidenceDepth)
  const [recommendationStyle, setRecommendationStyle] = useState(initial.recommendationStyle)
  const [defaultScope, setDefaultScope] = useState(initial.defaultScope)
  const [prompts, setPrompts] = useState(initial.suggestedPrompts.join('\n'))
  const [preferredAgentKeys, setPreferredAgentKeys] = useState<string[]>([...initial.preferredAgentKeys])
  const [status, setStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    setStatus(null)
    try {
      const suggestedPrompts = prompts.split('\n').map(value => value.trim()).filter(Boolean).slice(0, 12)
      const response = await fetch('/api/agent-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responseDepth, evidenceDepth, recommendationStyle, defaultScope, suggestedPrompts, preferredAgentKeys }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Unable to save AI preferences.')
      setStatus('AI preferences saved.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to save AI preferences.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
      <div>
        <p className="font-semibold text-white">AI conversation preferences</p>
        <p className="mt-1 text-sm leading-6 text-slate-400">
          These settings change presentation defaults only. They never change your data access, approval authority, or execution permissions.
        </p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span className="font-semibold text-slate-200">Response depth</span>
          <select value={responseDepth} onChange={e => setResponseDepth(e.target.value as typeof responseDepth)} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
            <option value="CONCISE">Concise</option>
            <option value="BALANCED">Balanced</option>
            <option value="DETAILED">Detailed</option>
          </select>
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-semibold text-slate-200">Evidence depth</span>
          <select value={evidenceDepth} onChange={e => setEvidenceDepth(e.target.value as typeof evidenceDepth)} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
            <option value="SUMMARY">Summary</option>
            <option value="EVIDENCE_FIRST">Evidence first</option>
            <option value="FULL_TRACE">Full trace</option>
          </select>
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-semibold text-slate-200">Recommendation style</span>
          <select value={recommendationStyle} onChange={e => setRecommendationStyle(e.target.value as typeof recommendationStyle)} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
            <option value="ADVISORY">Advisory</option>
            <option value="DECISION">Decision oriented</option>
            <option value="OPERATIONAL">Operational</option>
          </select>
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-semibold text-slate-200">Default scope</span>
          <select value={defaultScope} onChange={e => setDefaultScope(e.target.value as typeof defaultScope)} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
            <option value="ENTERPRISE">Enterprise</option>
            <option value="DOMAIN">Domain</option>
            <option value="PROJECT">Project</option>
            <option value="RESOURCE">Resource</option>
          </select>
        </label>
      </div>

      <fieldset className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
        <legend className="px-1 text-sm font-semibold text-slate-200">Preferred agents</legend>
        <p className="mt-1 text-xs leading-5 text-slate-500">These influence suggestions and ordering only. They never grant access to an agent or tool.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {agents.map(agent => {
            const checked = preferredAgentKeys.includes(agent.key)
            return (
              <label key={agent.key} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={event => setPreferredAgentKeys(current => event.target.checked
                    ? [...new Set([...current, agent.key])].slice(0, 12)
                    : current.filter(key => key !== agent.key))}
                />
                <span>{agent.name}</span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <label className="mt-4 block space-y-2 text-sm">
        <span className="font-semibold text-slate-200">Suggested prompts</span>
        <textarea value={prompts} onChange={e => setPrompts(e.target.value)} rows={5} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2" placeholder="One prompt per line" />
      </label>

      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          {saving ? 'Saving…' : 'Save AI preferences'}
        </button>
        {status ? <span role="status" className="text-sm text-slate-400">{status}</span> : null}
      </div>
    </section>
  )
}
