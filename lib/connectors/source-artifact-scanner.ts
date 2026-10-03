import { createHash } from 'node:crypto'

export type SourceArtifactKind='DOTNET'|'NODEJS'|'VBA'|'MACRO'|'SCRIPT'|'LOG'
export type ArtifactReference={kind:'READ'|'WRITE'|'FILE'|'ENDPOINT';target:string;line:number|null;evidence:string}
export type ArtifactScanResult={
  artifactKind:SourceArtifactKind
  path:string
  contentHash:string
  lineCount:number
  references:ArtifactReference[]
  transformations:Array<{operation:string;source:string|null;target:string|null;expression:string|null;line:number|null}>
  warnings:string[]
}

const SECRET_PATTERN=/(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key)\s*[:=]\s*["']?[^\s"',;]+/ig
function cleanEvidence(value:string){return value.replace(SECRET_PATTERN,'$1=[REDACTED]').slice(0,240)}
function relation(value:string){return value.replace(/[\[\]"]/g,'').replace(/[;,)]+$/,'').trim()}
function lineOf(content:string,index:number){return content.slice(0,index).split(/\r?\n/).length}
function addRef(target:ArtifactReference[],seen:Set<string>,item:ArtifactReference){
  const key=item.kind+':'+item.target.toLowerCase()+':'+String(item.line??0)
  if(!item.target||seen.has(key))return
  seen.add(key);target.push(item)
}

export function scanSourceArtifact(input:{kind:SourceArtifactKind;path:string;content:string}):ArtifactScanResult{
  const content=String(input.content??'')
  const references:ArtifactReference[]=[]
  const transformations:ArtifactScanResult['transformations']=[]
  const seen=new Set<string>()
  const sqlPatterns:Array<{kind:'READ'|'WRITE';operation:string;regex:RegExp}>=[
    {kind:'READ',operation:'SELECT',regex:/\b(?:from|join)\s+([A-Za-z0-9_.$\[\]"-]+)/ig},
    {kind:'WRITE',operation:'INSERT',regex:/\binsert\s+into\s+([A-Za-z0-9_.$\[\]"-]+)/ig},
    {kind:'WRITE',operation:'MERGE',regex:/\bmerge\s+into\s+([A-Za-z0-9_.$\[\]"-]+)/ig},
    {kind:'WRITE',operation:'UPDATE',regex:/\bupdate\s+([A-Za-z0-9_.$\[\]"-]+)\s+set\b/ig},
    {kind:'WRITE',operation:'CREATE_TABLE',regex:/\bcreate\s+(?:or\s+replace\s+)?(?:table|view)\s+([A-Za-z0-9_.$\[\]"-]+)/ig},
  ]
  const reads:Array<{target:string;line:number}>=[]
  const writes:Array<{target:string;line:number;operation:string}>=[]
  for(const pattern of sqlPatterns){
    for(const match of content.matchAll(pattern.regex)){
      const target=relation(match[1]??'')
      const line=lineOf(content,match.index??0)
      addRef(references,seen,{kind:pattern.kind,target,line,evidence:cleanEvidence(match[0])})
      if(pattern.kind==='READ')reads.push({target,line});else writes.push({target,line,operation:pattern.operation})
    }
  }

  const fileRegex=/(?:https?:\/\/[^\s"'<>]+|(?:[A-Za-z]:\\|\/)[^\r\n"'<>]+\.(?:csv|jsonl?|parquet|xlsx?|txt|log))/ig
  for(const match of content.matchAll(fileRegex)){
    addRef(references,seen,{kind:match[0].startsWith('http')?'ENDPOINT':'FILE',target:match[0],line:lineOf(content,match.index??0),evidence:cleanEvidence(match[0])})
  }

  const callPatterns:RegExp[]=[]
  if(input.kind==='DOTNET')callPatterns.push(/\b(?:File\.(?:ReadAllText|ReadAllLines|OpenRead|OpenText|WriteAllText)|Directory\.EnumerateFiles)\s*\(\s*["']([^"']+)["']/ig)
  if(input.kind==='NODEJS')callPatterns.push(/\b(?:readFile|readFileSync|writeFile|writeFileSync|createReadStream|createWriteStream)\s*\(\s*["'`]([^"'`]+)["'`]/ig)
  if(input.kind==='VBA'||input.kind==='MACRO')callPatterns.push(/\b(?:Workbooks\.Open|Open)\s+(?:Filename\s*:=\s*)?["']([^"']+)["']/ig)
  if(input.kind==='SCRIPT')callPatterns.push(/\b(?:cat|source|load|read|write)\s+["']?([^\s"']+\.(?:csv|jsonl?|parquet|xlsx?|txt|log))["']?/ig)
  for(const pattern of callPatterns){
    for(const match of content.matchAll(pattern)){
      addRef(references,seen,{kind:'FILE',target:match[1]??'',line:lineOf(content,match.index??0),evidence:cleanEvidence(match[0])})
    }
  }

  for(const write of writes){
    const nearest=[...reads].reverse().find(read=>read.line<=write.line)||reads[0]||null
    transformations.push({operation:write.operation,source:nearest?.target??null,target:write.target,expression:null,line:write.line})
  }
  if(!writes.length&&reads.length>1)transformations.push({operation:'READ_DEPENDENCY',source:reads[0].target,target:null,expression:null,line:reads[0].line})

  const warnings:string[]=[]
  if(!references.length)warnings.push('No deterministic database, file, or endpoint references were detected.')
  if(['DOTNET','NODEJS','VBA','MACRO'].includes(input.kind)&&!writes.length)warnings.push('No deterministic write target was detected; framework object names are not promoted to authoritative lineage without explicit source-to-target evidence.')
  if(content.length>2_000_000)warnings.push('Artifact exceeded 2 MB; callers should chunk very large artifacts before scanning.')

  return {
    artifactKind:input.kind,
    path:input.path.trim()||'unnamed-artifact',
    contentHash:createHash('sha256').update(content).digest('hex'),
    lineCount:content?content.split(/\r?\n/).length:0,
    references,
    transformations,
    warnings,
  }
}
