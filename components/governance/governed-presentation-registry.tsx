import Link from 'next/link'
import type { ReactNode } from 'react'

const surface='rounded-[22px] border border-white/10 bg-[#0a1d33] shadow-[10px_10px_28px_rgba(0,0,0,.24),-7px_-7px_22px_rgba(30,74,114,.08)]'
const inset='rounded-2xl border border-white/[0.07] bg-[#08182b]'
const focus='focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061426]'
const interactive=`${focus} transition hover:-translate-y-0.5 hover:border-cyan-400/30 active:translate-y-0`

export function GovernedMetricCard({href,icon,value,label,detail}:{href?:string;icon:ReactNode;value:string;label:string;detail:string}){
  const content=<><span className="text-cyan-300">{icon}</span><p className="mt-3 text-3xl font-black text-white">{value}</p><p className="text-sm font-bold text-slate-200">{label}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></>
  return href?<Link href={href} className={`${surface} ${interactive} block p-5`}>{content}</Link>:<div className={`${surface} p-5`}>{content}</div>
}

export function GovernedEvidenceTile({href,label,value,detail}:{href?:string;label:string;value:string;detail:string}){
  const content=<><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-white">{value}</p><p className="mt-1 text-[11px] text-slate-600">{detail}</p></>
  return href?<Link href={href} className={`${inset} ${interactive} block p-4`}>{content}</Link>:<div className={`${inset} p-4`}>{content}</div>
}

export function GovernedSection({title,eyebrow,action,children}:{title:string;eyebrow?:string;action?:ReactNode;children:ReactNode}){
  return <section className={`${surface} p-5`}><div className="flex flex-wrap items-start justify-between gap-3"><div>{eyebrow?<p className="text-xs font-black uppercase tracking-[.15em] text-cyan-300">{eyebrow}</p>:null}<h2 className={eyebrow?'mt-1 text-xl font-black text-white':'text-xl font-black text-white'}>{title}</h2></div>{action}</div><div className="mt-4">{children}</div></section>
}

export function GovernedEmptyState({children}:{children:ReactNode}){
  return <div className={`${inset} p-5 text-sm leading-6 text-slate-500`}>{children}</div>
}

export const governedPresentationClasses={surface,inset,focus,interactive}
