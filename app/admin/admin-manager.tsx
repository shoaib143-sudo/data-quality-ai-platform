'use client'

import { FormEvent, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react'

export type AdminOrganization = { id:string; name:string; currentRole:'OWNER'|'ADMIN' }
export type AdminMember = { organizationId:string; userId:string; email:string; role:'OWNER'|'ADMIN'|'MEMBER'; createdAt:string }
export type AdminProject = { id:string; organizationId:string; name:string; description:string|null }

export function AdminManager({ organizations, members, projects, currentUserId }:{
  organizations:AdminOrganization[]
  members:AdminMember[]
  projects:AdminProject[]
  currentUserId:string
}) {
  const router=useRouter()
  const [organizationId,setOrganizationId]=useState(organizations[0]?.id??'')
  const [email,setEmail]=useState('')
  const [inviteRole,setInviteRole]=useState<'OWNER'|'ADMIN'|'MEMBER'>('MEMBER')
  const [busy,setBusy]=useState('')
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')

  const organization=organizations.find((item)=>item.id===organizationId)
  const visibleMembers=useMemo(()=>members.filter((member)=>member.organizationId===organizationId),[members,organizationId])
  const visibleProjects=useMemo(()=>projects.filter((project)=>project.organizationId===organizationId),[projects,organizationId])

  async function call(method:string, body:Record<string,unknown>, key:string) {
    setBusy(key);setError('');setMessage('')
    try {
      const response=await fetch('/api/admin/members',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      const payload=await response.json().catch(()=>({}))
      if(!response.ok) throw new Error(payload.error??'Membership operation failed.')
      setMessage(method==='POST'?(payload.invitationSent?'Invitation sent and membership created.':'Membership created.'):'Organization membership updated.')
      if(method==='POST') setEmail('')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error?e.message:'Membership operation failed.')
    } finally { setBusy('') }
  }

  async function invite(event:FormEvent) {
    event.preventDefault()
    if(!organizationId||!email.trim()) return
    await call('POST',{organizationId,email:email.trim(),role:inviteRole},'invite')
  }

  return <div className="space-y-6">
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Organization administration</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">Membership and access</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Organization roles govern access to the current project portfolio. OWNER can manage all roles; ADMIN can manage non-owner membership.</p>
        </div>
        <label className="min-w-64 text-sm font-semibold text-slate-700">Organization
          <select value={organizationId} onChange={(event)=>setOrganizationId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            {organizations.map((item)=><option key={item.id} value={item.id}>{item.name} · {item.currentRole}</option>)}
          </select>
        </label>
      </div>
    </section>

    <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <form onSubmit={(event)=>void invite(event)} className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-blue-600"/><h3 className="text-lg font-bold">Invite or add member</h3></div>
        <p className="mt-1 text-sm text-slate-500">Existing users are added immediately. New users receive a Supabase invitation and are added with the selected role.</p>
        <label className="mt-5 block text-sm font-semibold">Email
          <input type="email" required value={email} onChange={(event)=>setEmail(event.target.value)} placeholder="steward@company.com" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"/>
        </label>
        <label className="mt-4 block text-sm font-semibold">Role
          <select value={inviteRole} onChange={(event)=>setInviteRole(event.target.value as typeof inviteRole)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            <option value="MEMBER">Member</option>
            <option value="ADMIN">Admin</option>
            {organization?.currentRole==='OWNER'?<option value="OWNER">Owner</option>:null}
          </select>
        </label>
        <button disabled={busy==='invite'} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
          {busy==='invite'?<Loader2 className="h-4 w-4 animate-spin"/>:<UserPlus className="h-4 w-4"/>}Add member
        </button>
        {message?<p className="mt-3 text-sm font-medium text-emerald-700">{message}</p>:null}
        {error?<p className="mt-3 text-sm font-medium text-red-600">{error}</p>:null}
      </form>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2"><Users className="h-5 w-5 text-violet-600"/><h3 className="text-lg font-bold">Project access inherited from organization</h3></div>
        <div className="mt-4 grid gap-2">
          {visibleProjects.length?visibleProjects.map((project)=><div key={project.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="font-semibold">{project.name}</div><div className="mt-1 text-xs text-slate-500">{project.description??'No project description.'}</div></div>):<p className="text-sm text-slate-500">No projects are registered for this organization.</p>}
        </div>
      </div>
    </section>

    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-600"/><h3 className="text-lg font-bold">Members</h3></div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead><tr className="border-b text-xs uppercase tracking-wider text-slate-400"><th className="px-3 py-2">User</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Added</th><th className="px-3 py-2 text-right">Action</th></tr></thead>
          <tbody>{visibleMembers.map((member)=>{
            const canChangeOwner=organization?.currentRole==='OWNER'
            const lockedOwner=member.role==='OWNER'&&!canChangeOwner
            return <tr key={member.userId} className="border-b border-slate-100">
              <td className="px-3 py-3"><div className="font-semibold">{member.email||member.userId}</div>{member.userId===currentUserId?<div className="text-xs text-blue-600">You</div>:null}</td>
              <td className="px-3 py-3"><select disabled={Boolean(busy)||lockedOwner} value={member.role} onChange={(event)=>void call('PATCH',{organizationId,userId:member.userId,role:event.target.value},member.userId)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold">
                <option value="MEMBER">MEMBER</option><option value="ADMIN">ADMIN</option>{canChangeOwner||member.role==='OWNER'?<option value="OWNER">OWNER</option>:null}
              </select></td>
              <td className="px-3 py-3 text-slate-500">{new Date(member.createdAt).toLocaleDateString()}</td>
              <td className="px-3 py-3 text-right"><button type="button" disabled={Boolean(busy)||lockedOwner} onClick={()=>void call('DELETE',{organizationId,userId:member.userId},`delete:${member.userId}`)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-40">{busy===`delete:${member.userId}`?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<Trash2 className="h-3.5 w-3.5"/>}Remove</button></td>
            </tr>
          })}</tbody>
        </table>
      </div>
    </section>
  </div>
}
