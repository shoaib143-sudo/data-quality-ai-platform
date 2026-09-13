'use client'

import { useEffect, useState } from 'react'

type Credential = { persona:string; roleKey:string; email:string; password:string; userId:string }
type Payload = { warning?:string; count?:number; credentials?:Credential[]; error?:string }

export default function PersonaTestPrincipalsPage() {
  const [payload,setPayload]=useState<Payload|null>(null)
  const [loading,setLoading]=useState(true)

  useEffect(()=>{
    const projectId=new URLSearchParams(window.location.search).get('projectId')??''
    if(!projectId){setPayload({error:'projectId is required.'});setLoading(false);return}
    fetch(`/api/admin/persona-test-principals?projectId=${encodeURIComponent(projectId)}&execute=ROTATE_13_PERSONA_TEST_CREDENTIALS`,{cache:'no-store'})
      .then(async response=>({ok:response.ok,payload:await response.json()}))
      .then(({ok,payload})=>{setPayload(ok?payload:{error:payload?.error??'Provisioning failed.'})})
      .catch(error=>setPayload({error:error instanceof Error?error.message:'Provisioning failed.'}))
      .finally(()=>setLoading(false))
  },[])

  return <main className="min-h-screen bg-slate-50 p-6 text-slate-950"><div className="mx-auto max-w-7xl rounded-3xl border bg-white p-7 shadow-sm"><h1 className="text-2xl font-black">Persona test principals</h1><p className="mt-2 text-sm text-slate-600">Temporary OWNER-only provisioning surface. Credentials are returned once and are not stored by this page.</p>{loading?<p className="mt-6">Provisioning 13 principals…</p>:payload?.error?<p role="alert" className="mt-6 text-red-700">{payload.error}</p>:<><p className="mt-6 font-semibold">Provisioned {payload?.count??0} principals.</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead><tr className="border-b"><th className="p-2">Persona</th><th className="p-2">Role</th><th className="p-2">Email</th><th className="p-2">Password</th><th className="p-2">User ID</th></tr></thead><tbody>{payload?.credentials?.map(item=><tr key={item.userId} className="border-b"><td className="p-2">{item.persona}</td><td className="p-2">{item.roleKey}</td><td className="p-2">{item.email}</td><td className="p-2 font-mono">{item.password}</td><td className="p-2 font-mono text-xs">{item.userId}</td></tr>)}</tbody></table></div><p className="mt-5 text-xs text-amber-700">{payload?.warning}</p></>}</div></main>
}
