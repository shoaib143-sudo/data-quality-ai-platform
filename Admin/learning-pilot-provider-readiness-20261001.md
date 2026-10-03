# Learning pilot provider readiness

Checked on 2026-10-01 for the authorized $0 preparation work. No inference calls, deployment, environment changes, secret values, or paid resources were used.

## Verified deployment metadata

| Item | Evidence |
| --- | --- |
| Team | DataNexus, slug `data-nexus3`, ID `team_qVinlzIY0FqhWavLWzBd8HhT` |
| Project | `data-quality-ai-platform`, ID `prj_Wg1fgyXWUN99I4zlWrtlU9si6yfR` |
| Latest deployment reported by project connector | `dpl_9Po83LqnLd7WgFAcVDzwBXNWiE3W`, `READY`, target `production` |
| Deployment source | CLI, branch `main`, commit `179589043709d47839a2909fd7ac36b0701ac9d7`, PR #1075 |
| Framework / runtime / region | Next.js, Node 24.x, `sin1` |
| Alias | `data-quality-ai-platform-data-nexus3.vercel.app` |

Sources were authenticated Vercel connector `list_teams`, `list_projects`, `get_project`, and `get_deployment`. The deployment metadata predates the experiment-budget implementation in PR #1099. A deployed database migration alone does not establish application-code parity. Live release parity remains on hold under the user's existing instruction; this audit did not deploy.

## Provider identity is unresolved

`lib/ai/reasoning-provider.ts` requires `AI_MODEL_API_KEY` before returning a provider. Its fallback defaults are `AI_REASONING_PROVIDER=openai_compatible`, `AI_MODEL_BASE_URL=https://api.openai.com/v1`, and `AI_MODEL_NAME=gpt-4.1-mini`. Governed routing can override provider/model selection. These defaults are source behavior, not proof of the deployed model or key availability.

Neither `get_project` nor `get_deployment` returned environment metadata or effective provider/model. The available Vercel connector tool inventory did not expose an environment-listing tool. No credential files, encrypted environment values, model invocations, or raw runtime logs were read to infer the configuration. The skill describes environment APIs, but the installed connector's actual capability set is authoritative.

The governed registry/pricing eligibility is a separate gate from environment configuration. A configured provider must still be approved for the selected project, executable under its routing policy, and associated with an effective reviewed pricing version. Prior registry observations must be refreshed by the database workstream; this Vercel audit does not independently establish those records.

## Trusted quote gate

At local source commit `bc7f684c0b1a4fa353336af5e4d9dc5951691bef`, `createGovernanceIntelligentRouter` accepts the server-owned `learningExperimentQuote` extension port. The copilot, investigation, and profile-readiness router callsites do not supply it. The guarded runtime requires this port and durable admission before dispatching an experiment invocation. Source availability does not mean a conservative quote adapter is installed or a paid experiment is authorized.

Provider setup and a quote adapter alone do not complete an evaluation runner. A real experiment also requires pinned replayable cases, candidate and policy bindings, authenticated independent evaluation, prospective held-out execution, and durable canonical result evidence. The dataset and reviewer readiness documents track those separate gaps. Synthetic contract fixtures exercise controls without proving an operational improvement loop or reviewer independence.

## Next actions and decision boundaries

1. Continue synthetic fixtures under the existing $0 instruction.
2. Obtain metadata-only effective environment configuration for `AI_REASONING_PROVIDER`, `AI_MODEL_NAME`, base endpoint identity, and key-presence booleans through an authorized capability. Do not disclose key values or credentials in endpoint URLs.
3. Refresh governed provider/model/pricing eligibility for the pilot project independently of environment defaults.
4. Implement and review a provider-specific conservative quote adapter once the actual executable backend and billing behavior are established. Keep missing quote behavior fail-closed.
5. Keep live deployment and paid pilot execution gated by the existing release hold and explicit USD spending approval.

No model or provider is certified as pilot-ready by this audit. The exact current access gap is the absent metadata-only environment capability, not a missing user-entered model guess. No ADR-007 agent classification, project authority, or learning approval boundary changes are proposed.
