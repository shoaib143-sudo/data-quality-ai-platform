'use client'

import { useMemo, useState } from 'react'

type Credential = { persona:string; roleKey:string; email:string; password:string; userId:string }
type Payload = { warning?:string; count?:number; credentials?:Credential[]; error?:string }

export default function PersonaTestPrincipalsPage() {
  const projectId=useMemo(()=>typeof window==='undefined'?'':new URLSearchParams(window.location.search).get('projectId')??'',[])
  const [payload,setPayload]=useState<Payload|null>(null)
  const [loading,setLoading]=useState(false)

  async function provision(){
    if(!projectId){setPayload({error:'projectId is required.'});return}
    setLoading(true);setPayload(null)
    try{
      const response=await fetch('/api/admin/persona-test-principals',{
        method:'POST',
        cache:'no-store',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({projectId,execute:'ROTATE_13_PERSONA_TEST_CREDENTIALS'}),
      })
      const nextPayload=await response.json()
      setPayload(response.ok?nextPayload:{error:nextPayload?.error??'Provisioning failed.'})
    }catch(error){
      setPayload({error:error instanceof Error?error.message:'Provisioning failed.'})
    }finally{
      setLoading(false)
    }
  }

  return <main className="min-h-screen bg-slate-50 p-6 text-slate-950"><div className="mx-auto max-w-7xl rounded-3xl border bg-white p-7 shadow-sm"><h1 className="text-2xl font-black">Persona test principals</h1><p className="mt-2 text-sm text-slate-600">Temporary OWNER-only provisioning surface. Credential rotation is explicit and credentials are returned once without being stored by this page.</p><button type="button" onClick={provision} disabled={loading||!projectId} className="mt-6 rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{loading?'Provisioning 13 principals…':'Rotate 13 persona test credentials'}</button>{!projectId?<p role="alert" className="mt-4 text-red-700">projectId is required.</p>:payload?.error?<p role="alert" className="mt-4 text-red-700">{payload.error}</p>:payload?<><p className="mt-6 font-semibold">Provisioned {payload.count??0} principals.</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead><tr className="border-b"><th className="p-2">Persona</th><th className="p-2">Role</th><th className="p-2">Email</th><th className="p-2">Password</th><th className="p-2">User ID</th></tr></thead><tbody>{payload.credentials?.map(item=><tr key={item.userId} className="border-b"><td className="p-2">{item.persona}</td><td className="p-2">{item.roleKey}</td><td className="p-2">{item.email}</td><td className="p-2 font-mono">{item.password}</td><td className="p-2 font-mono text-xs">{item.userId}</td></tr>)}</tbody></table></div><p className="mt-5 text-xs text-amber-700">{payload.warning}</p></>:<p className="mt-4 text-sm text-slate-600">No credentials are rotated until the OWNER explicitly activates the control above.</p>}</div></main>
}
