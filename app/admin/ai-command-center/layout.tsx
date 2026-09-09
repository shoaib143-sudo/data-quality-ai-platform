import Link from 'next/link'

const links = [
  { href: '/admin/ai-command-center', label: 'Overview' },
  { href: '/admin/ai-command-center/explorer', label: 'Explorer' },
  { href: '/admin/ai-command-center/traces', label: 'Trace timeline' },
  { href: '/admin/ai-command-center/resource-controls', label: 'Resource controls' },
  { href: '/admin/ai-command-center/audit', label: 'Audit evidence' },
]

export default function AICommandCenterLayout({ children }: { children: React.ReactNode }) {
  return <>
    <div className="border-b border-slate-800 bg-slate-950 text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-5 py-3 sm:px-8">
        <span className="mr-2 text-xs font-black uppercase tracking-[0.16em] text-violet-300">AI Command Center</span>
        {links.map((link) => <Link key={link.href} href={link.href} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-violet-400 hover:text-white">{link.label}</Link>)}
      </div>
    </div>
    {children}
  </>
}
