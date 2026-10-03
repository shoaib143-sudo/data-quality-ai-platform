import type { SourceArtifactKind } from '@/lib/connectors/source-artifact-scanner'

const MAX_FILES=100
const MAX_FILE_BYTES=512_000
const MAX_TOTAL_BYTES=5_000_000

function safeRef(value:string){return /^[A-Za-z0-9._\/-]{1,200}$/.test(value)&&!value.includes('..')}

export function parseGitHubRepositoryUrl(value:string){
  let url:URL
  try{url=new URL(value)}catch{throw new Error('A valid GitHub repository URL is required.')}
  if(url.protocol!=='https:'||url.hostname.toLowerCase()!=='github.com')throw new Error('Only HTTPS github.com repository URLs are supported.')
  const parts=url.pathname.split('/').filter(Boolean)
  if(parts.length<2)throw new Error('GitHub repository URL must contain owner and repository.')
  const owner=parts[0],repo=parts[1].replace(/\.git$/i,'')
  if(!/^[A-Za-z0-9_.-]{1,100}$/.test(owner)||!/^[A-Za-z0-9_.-]{1,100}$/.test(repo))throw new Error('GitHub owner or repository name is invalid.')
  return {owner,repo}
}

export function sourceArtifactKindForPath(path:string):SourceArtifactKind|null{
  const lower=path.toLowerCase()
  if(/\.(cs|csx|fs|fsx|vb|config|csproj|fsproj|vbproj)$/.test(lower))return 'DOTNET'
  if(/\.(js|jsx|mjs|cjs|ts|tsx|json|node)$/.test(lower))return 'NODEJS'
  if(/\.(vba|bas|cls|frm)$/.test(lower))return 'VBA'
  if(/\.(xlsm|xlam|docm|pptm)$/.test(lower))return 'MACRO'
  if(/\.(sh|bash|zsh|ps1|py|pl|rb|sql|cmd|bat)$/.test(lower))return 'SCRIPT'
  if(/\.(log|out|trace|txt)$/.test(lower))return 'LOG'
  return null
}

function headers(){
  const token=process.env.GITHUB_SOURCE_SCAN_TOKEN?.trim()
  return {
    accept:'application/vnd.github+json',
    'user-agent':'DataNexus-source-artifact-scanner',
    ...(token?{authorization:`Bearer ${token}`}:{}),
  }
}

async function githubJson(url:string){
  const response=await fetch(url,{headers:headers(),cache:'no-store'})
  if(!response.ok)throw new Error(`GitHub source acquisition failed with HTTP ${response.status}.`)
  return response.json()
}

export async function acquireGitHubSourceArtifacts(input:{repositoryUrl:string;ref?:string|null}){
  const {owner,repo}=parseGitHubRepositoryUrl(input.repositoryUrl)
  let ref=input.ref?.trim()||''
  if(!ref){
    const metadata=await githubJson(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`) as {default_branch?:string}
    ref=typeof metadata.default_branch==='string'&&metadata.default_branch.trim()?metadata.default_branch.trim():'main'
  }
  if(!safeRef(ref))throw new Error('GitHub ref contains unsupported characters.')
  const encodedRef=encodeURIComponent(ref)
  const rawRef=ref.split('/').map(encodeURIComponent).join('/')
  const tree=await githubJson(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodedRef}?recursive=1`) as {tree?:Array<{path?:string;type?:string;size?:number}>;truncated?:boolean}
  if(tree.truncated)throw new Error('GitHub repository tree is truncated. Narrow the repository/ref before scanning.')

  const candidates=(tree.tree??[])
    .flatMap(item=>{
      const path=typeof item.path==='string'?item.path:''
      const kind=sourceArtifactKindForPath(path)
      const size=Number(item.size??0)
      if(item.type!=='blob'||!kind||!path||size<=0||size>MAX_FILE_BYTES)return []
      return [{path,kind,size}]
    })
    .slice(0,MAX_FILES)

  const artifacts:Array<{path:string;kind:SourceArtifactKind;content:string;size:number}>=[]
  let totalBytes=0
  for(const item of candidates){
    if(totalBytes+item.size>MAX_TOTAL_BYTES)break
    const rawUrl=`https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${rawRef}/${item.path.split('/').map(encodeURIComponent).join('/')}`
    const response=await fetch(rawUrl,{headers:headers(),cache:'no-store'})
    if(!response.ok)continue
    const content=await response.text()
    const bytes=new TextEncoder().encode(content).length
    if(bytes>MAX_FILE_BYTES||totalBytes+bytes>MAX_TOTAL_BYTES)continue
    if(content.includes('\u0000'))continue
    totalBytes+=bytes
    artifacts.push({path:item.path,kind:item.kind,content,size:bytes})
  }
  return {
    repository:{owner,repo,ref},
    artifacts,
    limits:{maxFiles:MAX_FILES,maxFileBytes:MAX_FILE_BYTES,maxTotalBytes:MAX_TOTAL_BYTES},
    totalBytes,
  }
}
