'use client'

import { useMemo, useState } from 'react'
import { Download, FileJson2, FileSpreadsheet, ShieldCheck } from 'lucide-react'

export type ReportProject={id:string;name:string;description:string|null;datasetCount:number;openIssues:number;openAlerts:number}

export function ReportManager({projects}:{projects:ReportProject[]}) {
  const [projectId,setProjectId]=useState(projects[0]?.id??'')
  const selected=useMemo(()=>projects.find((project)=>project.id===projectId),[projects,projectId])
  const csvUrl=projectId?`/api/reports/governance?projectId=${encodeURIComponent(projectId)}&format=csv`:'#'
  const jsonUrl=projectId?`/api/reports/governance?projectId=${encodeURIComponent(projectId)}&format=json`:'#'

  return <div className="space-y-6">
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Governance evidence export</p><h2 className="mt-1 text-2xl font-black">Project governance report</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Exports persisted catalog, certification, profiling, quality control, observability, classification, stewardship and remediation evidence. No synthetic metrics are added.</p></div>
        <label className="min-w-72 text-sm font-semibold text-slate-700">Project
          <select value={projectId} onChange={(event)=>setProjectId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            {projects.map((project)=><option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
      </div>
    </section>

    {selected?<section className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Governed datasets</p><p className="mt-2 text-3xl font-black text-blue-800">{selected.datasetCount}</p></div>
      <div className="rounded-2xl border border-red-100 bg-red-50 p-5"><p className="text-xs font-bold uppercase tracking-wider text-red-700">Open issues</p><p className="mt-2 text-3xl font-black text-red-800">{selected.openIssues}</p></div>
      <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5"><p className="text-xs font-bold uppercase tracking-wider text-amber-700">Open alerts</p><p className="mt-2 text-3xl font-black text-amber-800">{selected.openAlerts}</p></div>
    </section>:null}

    <section className="grid gap-5 md:grid-cols-2">
      <article className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm"><span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><FileSpreadsheet className="h-5 w-5"/></span><h3 className="mt-4 text-lg font-bold">CSV control register</h3><p className="mt-2 text-sm leading-6 text-slate-500">One row per governed dataset for audit packs, control evidence reviews and downstream analytics.</p><a href={csvUrl} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"><Download className="h-4 w-4"/>Download CSV</a></article>
      <article className="rounded-3xl border border-violet-100 bg-white p-6 shadow-sm"><span className="grid h-11 w-11 place-items-center rounded-xl bg-violet-50 text-violet-700"><FileJson2 className="h-5 w-5"/></span><h3 className="mt-4 text-lg font-bold">JSON evidence package</h3><p className="mt-2 text-sm leading-6 text-slate-500">Machine-readable summary and dataset evidence for governance APIs, archival and external reporting workflows.</p><a href={jsonUrl} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700"><Download className="h-4 w-4"/>Download JSON</a></article>
    </section>

    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-blue-600"/><h3 className="font-bold">Evidence included</h3></div><div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-4">{['Catalog lifecycle, criticality and certification','Latest profiling dimensions and quality score','Automated rule failures and observability alerts','Classifications, stewardship and remediation'].map((item)=><div key={item} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">{item}</div>)}</div></section>
  </div>
}
