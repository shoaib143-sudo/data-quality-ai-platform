import type { ReactNode } from 'react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { canAccessWorkspace, requireWorkspaceAccess } from '@/lib/governance/workspace-access'
import { BoundedLineageNavigator } from './bounded-lineage-navigator'
import { BoundedFieldLineageNavigator } from './bounded-field-lineage-navigator'

export default async function LineageLayout({children}:{children:ReactNode}){
  await requireUser()
  const context=await requireWorkspaceAccess('lineage')
  const canManageLineage=canAccessWorkspace(context.persona,'lineage-manage',context.organizationRole)
  const supabase=await createClient()
  const {data,error}=await supabase.schema('app').from('projects').select('id,name').order('name')
  if(error)throw new Error(error.message)

  const projects=(data??[]).map(project=>({id:String(project.id),name:String(project.name)}))
  return <>
    {!canManageLineage?<style>{'a[href="/lineage/ingest"],a[href="/lineage/suggestions"]{display:none!important}'}</style>:null}
    {children}
    <BoundedFieldLineageNavigator projects={projects}/>
    <BoundedLineageNavigator projects={projects}/>
  </>
}
