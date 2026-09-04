import { createHash } from 'node:crypto'
import { inflateRawSync, inflateSync } from 'node:zlib'
import type { SupabaseClient } from '@supabase/supabase-js'
import { extractWithOcrSpace } from '@/lib/profiling/ocr-space'
import { safeRemoteFileFetch } from '@/lib/profiling/safe-remote-file'

export type FileSourceConfig = {
  sourceUri?: string | null
  executionConfig?: Record<string, unknown> | null
}

export type FileSourceResult = {
  rows: Record<string, unknown>[]
  rowCount: number
  contentHash: string
  sourceUri: string
  contentType: string | null
  format: 'csv' | 'json' | 'jsonl' | 'text' | 'binary'
  metadata: Record<string, unknown>
  warnings: string[]
}

const DEFAULT_MAX_ROWS = 1000
const TEXT_EXTENSIONS = new Set(['txt','md','markdown','log','html','htm','xml','yaml','yml','sql','ini','cfg','conf'])
const BINARY_EXTENSIONS = new Set(['pdf','doc','docx','xls','xlsx','ppt','pptx','png','jpg','jpeg','gif','webp','bmp','tif','tiff','zip','gz','parquet','avro'])
const OFFICE_ZIP_EXTENSIONS = new Set(['docx','pptx','xlsx'])
const OCR_EXTENSIONS = new Set(['pdf','png','jpg','jpeg','gif','webp','bmp','tif','tiff'])
const MAX_EXTRACTED_ENTRY_BYTES = 50 * 1024 * 1024
const MAX_EXTRACTED_TOTAL_BYTES = 250 * 1024 * 1024

function environmentInt(name:string,fallback:number,min:number,max:number){
  const parsed=Number(process.env[name])
  return Number.isFinite(parsed)?Math.min(max,Math.max(min,Math.floor(parsed))):fallback
}

export async function loadFileSource(
  supabase: SupabaseClient,
  config: FileSourceConfig,
  options: { maxRows?: number; maxBytes?: number } = {},
): Promise<FileSourceResult> {
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS
  const maxBytes = options.maxBytes ?? environmentInt('FILE_TECHNICAL_MAX_BYTES',250*1024*1024,1024*1024,1024*1024*1024)
  const executionConfig = config.executionConfig ?? {}
  const sourceUri = config.sourceUri?.trim() || null
  const url = getString(executionConfig,['url','source_url','sourceUrl']) ?? (sourceUri && /^https?:\/\//i.test(sourceUri) ? sourceUri : null)

  let bytes: Uint8Array
  let resolvedSourceUri: string
  let contentType: string | null = null
  if(url){
    const response=await safeRemoteFileFetch(url,{headers:{accept:'text/csv,text/plain,application/json,application/pdf,application/octet-stream;q=0.9,*/*;q=0.8'},cache:'no-store'})
    if(!response.ok)throw new Error(`Unable to load FILE source: HTTP ${response.status} ${response.statusText}`)
    const declaredLength=Number(response.headers.get('content-length'))
    if(Number.isFinite(declaredLength)&&declaredLength>maxBytes)throw new Error(`FILE source exceeds the execution engine technical safety ceiling of ${maxBytes} bytes.`)
    bytes=new Uint8Array(await response.arrayBuffer())
    resolvedSourceUri=url
    contentType=response.headers.get('content-type')
  }else{
    const bucket=getString(executionConfig,['bucket','bucket_id','bucketId','storage_bucket','storageBucket'])
    const path=getString(executionConfig,['path','storage_path','storagePath','object_path','objectPath'])??sourceUri
    if(!bucket||!path)throw new Error(`FILE source "${sourceUri??'(missing source_uri)'}" has no executable location. Provide execution_config.url or execution_config.bucket + execution_config.path.`)
    const {data,error}=await supabase.storage.from(bucket).download(path)
    if(error)throw new Error(`Unable to download FILE source ${bucket}/${path}: ${error.message}`)
    bytes=new Uint8Array(await data.arrayBuffer())
    resolvedSourceUri=`storage://${bucket}/${path}`
    contentType=data.type||null
  }
  if(bytes.byteLength>maxBytes)throw new Error(`FILE source exceeds the execution engine technical safety ceiling of ${maxBytes} bytes.`)

  const contentHash=createHash('sha256').update(bytes).digest('hex')
  const fileName=sourceName(resolvedSourceUri)
  const extension=fileName.includes('.')?fileName.split('.').pop()!.toLowerCase():''
  const decoded=new TextDecoder('utf-8',{fatal:false}).decode(bytes)
  const format=detectFormat(decoded,contentType,extension)
  const metadata:Record<string,unknown>={file_name:fileName,extension:extension||null,content_type:contentType,byte_size:bytes.byteLength,sha256:contentHash,source_uri:resolvedSourceUri}

  if(format==='csv')return parsedResult(parseCsv(decoded,maxRows),contentHash,resolvedSourceUri,contentType,format,metadata)
  if(format==='json')return parsedResult(parseJson(decoded,maxRows),contentHash,resolvedSourceUri,contentType,format,metadata)
  if(format==='jsonl')return parsedResult(parseJsonLines(decoded,maxRows),contentHash,resolvedSourceUri,contentType,format,metadata)
  if(format==='text')return parsedResult(parseTextDocument(decoded,maxRows,metadata),contentHash,resolvedSourceUri,contentType,format,metadata)

  const extracted=extractUnstructuredDocumentText(bytes,extension)
  if(extracted.text.trim()){
    const extractedMetadata={...metadata,text_extraction_supported:true,text_extraction_method:extracted.method,extracted_character_count:extracted.text.length}
    const parsed=parseTextDocument(extracted.text,maxRows,extractedMetadata)
    return {rows:parsed.rows,rowCount:parsed.rowCount,contentHash,sourceUri:resolvedSourceUri,contentType,format:'text',metadata:extractedMetadata,warnings:[...extracted.warnings,...parsed.warnings]}
  }

  if(OCR_EXTENSIONS.has(extension)){
    try{
      const ocr=await extractWithOcrSpace({bytes,fileName,contentType})
      if(ocr.text.trim()){
        const ocrMetadata={...metadata,text_extraction_supported:true,text_extraction_method:'ocr_space',ocr_provider:ocr.provider,ocr_pages:ocr.pages,extracted_character_count:ocr.text.length}
        const parsed=parseTextDocument(ocr.text,maxRows,ocrMetadata)
        return {rows:parsed.rows,rowCount:parsed.rowCount,contentHash,sourceUri:resolvedSourceUri,contentType,format:'text',metadata:ocrMetadata,warnings:[...extracted.warnings,...ocr.warnings,...parsed.warnings]}
      }
      metadata.ocr_provider=ocr.provider
      metadata.ocr_configured=ocr.configured
      metadata.ocr_pages=ocr.pages
      extracted.warnings.push(...ocr.warnings)
    }catch(error){
      metadata.ocr_provider='OCR_SPACE'
      metadata.ocr_failed=true
      extracted.warnings.push(`OCR fallback could not complete: ${error instanceof Error?error.message:'unknown OCR error'}`)
    }
  }

  return {
    rows:[{document_index:1,file_name:fileName,extension:extension||null,content_type:contentType,byte_size:bytes.byteLength,sha256:contentHash,text_extraction_supported:false}],
    rowCount:1,contentHash,sourceUri:resolvedSourceUri,contentType,format:'binary',metadata,
    warnings:[...extracted.warnings,'Binary file metadata was scanned successfully. No readable text content was available from the native extractor or configured OCR provider.'],
  }
}

function parsedResult(parsed:{rows:Record<string,unknown>[];rowCount:number;warnings:string[]},contentHash:string,sourceUri:string,contentType:string|null,format:FileSourceResult['format'],metadata:Record<string,unknown>):FileSourceResult{
  return {rows:parsed.rows,rowCount:parsed.rowCount,contentHash,sourceUri,contentType,format,metadata,warnings:parsed.warnings}
}

function detectFormat(content:string,contentType:string|null,extension:string):FileSourceResult['format']{
  const mediaType=contentType?.split(';')[0]?.trim().toLowerCase()??''
  if(extension==='csv'||mediaType==='text/csv')return'csv'
  if(extension==='json'||mediaType==='application/json')return'json'
  if(['jsonl','ndjson'].includes(extension)||mediaType==='application/x-ndjson')return'jsonl'
  if(TEXT_EXTENSIONS.has(extension)||mediaType.startsWith('text/')||['application/xml','application/yaml','application/x-yaml'].includes(mediaType))return'text'
  if(BINARY_EXTENSIONS.has(extension)||mediaType.startsWith('image/')||mediaType.startsWith('audio/')||mediaType.startsWith('video/')||mediaType==='application/pdf')return'binary'
  const trimmed=content.trim()
  if(trimmed.startsWith('{')||trimmed.startsWith('[')){try{JSON.parse(trimmed);return'json'}catch{}}
  if(trimmed&&!trimmed.includes('\u0000'))return'text'
  return'binary'
}

function sourceName(uri:string){const clean=uri.split('?')[0].replace(/\/$/,'');return clean.split('/').pop()||'file'}
function getString(record:Record<string,unknown>,fields:string[]){for(const field of fields){const value=record[field];if(typeof value==='string'&&value.trim())return value.trim()}return null}

function parseJson(input:string,maxRows:number){
  let value:unknown
  try{value=JSON.parse(input)}catch(error){throw new Error(`Invalid JSON source: ${error instanceof Error?error.message:'parse failed'}`)}
  const rawRows=Array.isArray(value)?value:[value]
  const rows=rawRows.map((item,index)=>normalizeJsonRow(item,index))
  const warnings:string[]=[]
  if(rows.length>maxRows)warnings.push(`JSON source contains ${rows.length} records; ${maxRows} were selected for profiling.`)
  return{rows:rows.slice(0,maxRows),rowCount:rows.length,warnings}
}

function parseJsonLines(input:string,maxRows:number){
  const lines=input.split(/\r?\n/).filter(line=>line.trim())
  const rows=lines.map((line,index)=>{try{return normalizeJsonRow(JSON.parse(line),index)}catch(error){throw new Error(`Invalid JSONL source at line ${index+1}: ${error instanceof Error?error.message:'parse failed'}`)}})
  const warnings:string[]=[]
  if(rows.length>maxRows)warnings.push(`JSONL source contains ${rows.length} records; ${maxRows} were selected for profiling.`)
  return{rows:rows.slice(0,maxRows),rowCount:rows.length,warnings}
}
function normalizeJsonRow(value:unknown,index:number):Record<string,unknown>{return value&&typeof value==='object'&&!Array.isArray(value)?{record_index:index+1,...value as Record<string,unknown>}:{record_index:index+1,value}}

function parseTextDocument(input:string,maxRows:number,metadata:Record<string,unknown>){
  const normalized=input.replace(/\r\n/g,'\n')
  const paragraphs=normalized.split(/\n\s*\n+/).map(value=>value.trim()).filter(Boolean)
  const chunks=paragraphs.length?paragraphs:normalized.split('\n').map(value=>value.trim()).filter(Boolean)
  const rows=chunks.map((text,index)=>({chunk_index:index+1,text,character_count:text.length,word_count:text.split(/\s+/).filter(Boolean).length,line_count:text.split('\n').length,file_name:metadata.file_name,content_type:metadata.content_type,text_extraction_method:metadata.text_extraction_method??'native_text'}))
  const warnings:string[]=[]
  if(rows.length>maxRows)warnings.push(`Text source contains ${rows.length} chunks; ${maxRows} were selected for profiling.`)
  return{rows:rows.slice(0,maxRows),rowCount:rows.length,warnings}
}

function csvTextIdentifierColumn(header:string){
  const name=header.trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')
  return name==='id'||name.endsWith('_id')||/(^|_)(code|phone|mobile|zip|postal|postcode|ssn|national_id|account|card|routing|iban|swift)(_|$)/.test(name)
}
function strictCsvNumber(value:string){
  const normalized=value.trim()
  if(!/^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(normalized))return null
  const parsed=Number(normalized)
  return Number.isFinite(parsed)?parsed:null
}
function coerceCsvScalar(header:string,value:string|null):unknown{
  if(value===null)return null
  if(value===''||value.trim()==='')return value
  if(csvTextIdentifierColumn(header))return value
  const trimmed=value.trim()
  if(/^(true|false)$/i.test(trimmed))return trimmed.toLowerCase()==='true'
  const numeric=strictCsvNumber(trimmed)
  return numeric===null?value:numeric
}

function parseCsv(input:string,maxRows:number):{rows:Record<string,unknown>[];rowCount:number;warnings:string[]}{
  const records=parseCsvRecords(input),warnings:string[]=[]
  if(!records.length)return{rows:[],rowCount:0,warnings}
  const headers=records[0].map((header,index)=>header.trim().replace(/^\uFEFF/,'')||`column_${index+1}`)
  const rows=records.slice(1).map(record=>Object.fromEntries(headers.map((header,index)=>[header,coerceCsvScalar(header,record[index]??null)])))
  if(rows.length>maxRows)warnings.push(`FILE source contains ${rows.length} data rows; ${maxRows} were selected for profiling.`)
  return{rows:rows.slice(0,maxRows),rowCount:rows.length,warnings}
}
function parseCsvRecords(input:string){
  const records:string[][]=[];let record:string[]=[];let field='';let quoted=false
  for(let index=0;index<input.length;index+=1){const char=input[index],next=input[index+1];if(quoted){if(char==='"'&&next==='"'){field+='"';index+=1;continue}if(char==='"'){quoted=false;continue}field+=char;continue}if(char==='"'&&field.length===0){quoted=true;continue}if(char===','){record.push(field);field='';continue}if(char==='\n'){record.push(field.replace(/\r$/,''));records.push(record);record=[];field='';continue}field+=char}
  if(quoted)throw new Error('Invalid CSV source: unterminated quoted field')
  if(field.length||record.length){record.push(field.replace(/\r$/,''));records.push(record)}
  return records.filter(row=>row.some(value=>value.trim()!==''))
}

function extractUnstructuredDocumentText(bytes:Uint8Array,extension:string){
  if(extension==='pdf')return extractPdfText(bytes)
  if(OFFICE_ZIP_EXTENSIONS.has(extension))return extractOfficeZipText(bytes,extension)
  if(['doc','ppt','xls'].includes(extension))return{text:'',method:'legacy_office_metadata_only',warnings:['Legacy binary Microsoft Office formats are metadata-only. Convert to DOCX, PPTX or XLSX for governed content extraction.']}
  return{text:'',method:'metadata_only',warnings:[] as string[]}
}

function extractOfficeZipText(bytes:Uint8Array,extension:string){
  try{
    const entries=readZipEntries(bytes)
    if(extension==='xlsx')return extractXlsxText(entries)
    const selected=entries.filter(entry=>extension==='docx'?/^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/i.test(entry.name):/^ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+)\.xml$/i.test(entry.name))
    const parts=selected.map(entry=>xmlVisibleText(entry.data.toString('utf8'))).filter(Boolean)
    return{text:parts.join('\n\n'),method:`${extension}_openxml`,warnings:parts.length?[`Extracted governed text from ${parts.length} Open XML document part${parts.length===1?'':'s'}.`]:[`No readable Open XML text parts were found in the ${extension.toUpperCase()} package.`]}
  }catch(error){return{text:'',method:`${extension}_openxml`,warnings:[`Open XML extraction could not complete: ${error instanceof Error?error.message:'unknown error'}`]}}
}

function extractXlsxText(entries:Array<{name:string;data:Buffer}>){
  const sharedXml=entries.find(entry=>/^xl\/sharedStrings\.xml$/i.test(entry.name))?.data.toString('utf8')??''
  const sharedStrings=[...sharedXml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/gi)].map(match=>xmlVisibleText(match[1]))
  const sheets=entries.filter(entry=>/^xl\/worksheets\/sheet\d+\.xml$/i.test(entry.name)).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}))
  const sheetTexts:string[]=[]
  for(const sheet of sheets){
    const xml=sheet.data.toString('utf8'),rows:string[]=[]
    for(const rowMatch of xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/gi)){
      const cells:string[]=[]
      for(const cellMatch of rowMatch[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/gi)){
        const attrs=cellMatch[1],body=cellMatch[2],type=attrs.match(/\bt="([^"]+)"/i)?.[1]
        const inline=body.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/i)?.[1]
        const raw=body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/i)?.[1]
        let value=inline?decodeXmlEntities(inline):raw?decodeXmlEntities(raw):''
        if(type==='s'&&raw){const index=Number(raw);if(Number.isInteger(index)&&sharedStrings[index]!==undefined)value=sharedStrings[index]}
        cells.push(value)
      }
      if(cells.some(Boolean))rows.push(cells.join('\t'))
    }
    if(rows.length)sheetTexts.push(`${sheet.name}\n${rows.join('\n')}`)
  }
  return{text:sheetTexts.join('\n\n'),method:'xlsx_openxml',warnings:sheetTexts.length?[`Extracted governed cell content from ${sheetTexts.length} XLSX worksheet${sheetTexts.length===1?'':'s'}.`]:['No readable worksheet cell content was found in the XLSX package.']}
}

function readZipEntries(bytes:Uint8Array){
  const buffer=Buffer.from(bytes);let eocd=-1;const floor=Math.max(0,buffer.length-65557)
  for(let index=buffer.length-22;index>=floor;index-=1){if(buffer.readUInt32LE(index)===0x06054b50){eocd=index;break}}
  if(eocd<0)throw new Error('ZIP central directory was not found')
  const entryCount=buffer.readUInt16LE(eocd+10);let offset=buffer.readUInt32LE(eocd+16);const entries:Array<{name:string;data:Buffer}>=[];let totalExpanded=0
  for(let entryIndex=0;entryIndex<entryCount;entryIndex+=1){
    if(buffer.readUInt32LE(offset)!==0x02014b50)throw new Error('ZIP central directory entry is invalid')
    const method=buffer.readUInt16LE(offset+10),compressedSize=buffer.readUInt32LE(offset+20),uncompressedSize=buffer.readUInt32LE(offset+24),nameLength=buffer.readUInt16LE(offset+28),extraLength=buffer.readUInt16LE(offset+30),commentLength=buffer.readUInt16LE(offset+32),localOffset=buffer.readUInt32LE(offset+42)
    const name=buffer.subarray(offset+46,offset+46+nameLength).toString('utf8');offset+=46+nameLength+extraLength+commentLength
    if(!/\.(xml|rels)$/i.test(name)||uncompressedSize>MAX_EXTRACTED_ENTRY_BYTES)continue
    if(buffer.readUInt32LE(localOffset)!==0x04034b50)continue
    const localNameLength=buffer.readUInt16LE(localOffset+26),localExtraLength=buffer.readUInt16LE(localOffset+28),dataStart=localOffset+30+localNameLength+localExtraLength,compressed=buffer.subarray(dataStart,dataStart+compressedSize)
    let data:Buffer;if(method===0)data=Buffer.from(compressed);else if(method===8)data=Buffer.from(inflateRawSync(compressed));else continue
    totalExpanded+=data.byteLength;if(totalExpanded>MAX_EXTRACTED_TOTAL_BYTES)throw new Error('Expanded Office document content exceeds the execution engine technical safety ceiling')
    entries.push({name,data})
  }
  return entries
}

function xmlVisibleText(xml:string){
  const normalized=xml.replace(/<w:tab\s*\/>/gi,'\t').replace(/<(?:w:br|a:br)\s*\/>/gi,'\n').replace(/<\/w:p>/gi,'\n').replace(/<\/a:p>/gi,'\n')
  const values:string[]=[];const regex=/<(?:w:t|a:t|t)(?:\s[^>]*)?>([\s\S]*?)<\/(?:w:t|a:t|t)>/gi;let match:RegExpExecArray|null
  while((match=regex.exec(normalized)))values.push(decodeXmlEntities(match[1]))
  return values.join(' ').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').replace(/[ \t]{2,}/g,' ').trim()
}
function decodeXmlEntities(value:string){return value.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&').replace(/&#(\d+);/g,(_m,code)=>String.fromCodePoint(Number(code))).replace(/&#x([0-9a-f]+);/gi,(_m,code)=>String.fromCodePoint(Number.parseInt(code,16)))}

function extractPdfText(bytes:Uint8Array){
  const buffer=Buffer.from(bytes),binary=buffer.toString('latin1'),parts:string[]=[];let cursor=0,processedStreams=0
  while(cursor<binary.length&&processedStreams<1000){const marker=binary.indexOf('stream',cursor);if(marker<0)break;const end=binary.indexOf('endstream',marker+6);if(end<0)break;const dictionary=binary.slice(Math.max(0,marker-2000),marker);let start=marker+6;if(binary[start]==='\r'&&binary[start+1]==='\n')start+=2;else if(binary[start]==='\n'||binary[start]==='\r')start+=1;let raw=buffer.subarray(start,end);while(raw.length&&(raw[raw.length-1]===10||raw[raw.length-1]===13))raw=raw.subarray(0,raw.length-1);try{if(/\/FlateDecode/.test(dictionary))raw=Buffer.from(inflateSync(raw));const stream=raw.toString('latin1');for(const block of stream.match(/BT[\s\S]*?ET/g)??[]){const text=extractPdfTextOperators(block);if(text)parts.push(text)}}catch{}processedStreams+=1;cursor=end+9}
  const text=parts.join('\n').replace(/[ \t]{2,}/g,' ').replace(/\n{3,}/g,'\n\n').trim()
  return{text,method:'pdf_content_streams',warnings:text?['Extracted text from the PDF text layer. OCR is used only when no readable text layer is available.']:['No readable PDF text layer was found; OCR fallback will be attempted when configured.']}
}
function extractPdfTextOperators(block:string){const parts:string[]=[];const regex=/\((?:\\.|[^\\)])*\)|<([0-9A-Fa-f\s]{2,})>/g;let match:RegExpExecArray|null;while((match=regex.exec(block))){if(match[0].startsWith('('))parts.push(decodePdfLiteral(match[0].slice(1,-1)));else if(match[1]){const hex=match[1].replace(/\s+/g,'');if(hex.length%2===0){try{parts.push(Buffer.from(hex,'hex').toString('utf8').replace(/\u0000/g,''))}catch{}}}}return parts.join(' ').trim()}
function decodePdfLiteral(value:string){return value.replace(/\\([0-7]{1,3})/g,(_m,octal)=>String.fromCharCode(Number.parseInt(octal,8))).replace(/\\n/g,'\n').replace(/\\r/g,'\r').replace(/\\t/g,'\t').replace(/\\b/g,'\b').replace(/\\f/g,'\f').replace(/\\\(/g,'(').replace(/\\\)/g,')').replace(/\\\\/g,'\\')}
