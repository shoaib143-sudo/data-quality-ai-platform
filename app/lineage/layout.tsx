import type { ReactNode } from 'react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { BoundedLineageNavigator } from './bounded-lineage-navigator'

export default async function LineageLayout({children}:{children:ReactNode}){
  await requireUser()
  const supabase=await createClient()
  const {data,error}=await supabase.schema('app').from('projects').select('id,name').order('name')
  if(error)throw new Error(error.message)

  const projects=(data??[]).map(project=>({id:String(project.id),name:String(project.name)}))
  return <>
    {children}
    <BoundedLineageNavigator projects={projects}/>
  </>
}
