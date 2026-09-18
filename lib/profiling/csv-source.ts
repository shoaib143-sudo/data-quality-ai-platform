export type ParsedCsvSource = {
  rows: Record<string, unknown>[]
  rowCount: number
  warnings: string[]
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

export function normalizeCsvHeaders(rawHeaders:string[]){
  const used=new Set<string>()
  return rawHeaders.map((rawHeader,index)=>{
    const base=rawHeader.trim().replace(/^\uFEFF/,'')||`column_${index+1}`
    let candidate=base
    let suffix=2
    while(used.has(candidate)){
      candidate=`${base}__${suffix}`
      suffix+=1
    }
    used.add(candidate)
    return candidate
  })
}

type CsvRecordEntry={record:string[];sourceLine:number}

function parseCsvRecordEntries(input:string):CsvRecordEntry[]{
  const entries:CsvRecordEntry[]=[];let record:string[]=[];let field='';let quoted=false;let line=1;let recordStartLine=1
  for(let index=0;index<input.length;index+=1){
    const char=input[index],next=input[index+1]
    if(quoted){
      if(char==='"'&&next==='"'){field+='"';index+=1;continue}
      if(char==='"'){quoted=false;continue}
      if(char==='\n'){field+=char;line+=1;continue}
      field+=char;continue
    }
    if(char==='"'&&field.length===0){quoted=true;continue}
    if(char===','){record.push(field);field='';continue}
    if(char==='\n'){
      record.push(field.replace(/\r$/,''))
      entries.push({record,sourceLine:recordStartLine})
      record=[];field='';line+=1;recordStartLine=line
      continue
    }
    field+=char
  }
  if(quoted)throw new Error('Invalid CSV source: unterminated quoted field')
  if(field.length||record.length){
    record.push(field.replace(/\r$/,''))
    entries.push({record,sourceLine:recordStartLine})
  }
  return entries.filter(entry=>entry.record.some(value=>value.trim()!==''))
}

export function parseCsvRecords(input:string){
  return parseCsvRecordEntries(input).map(entry=>entry.record)
}

export function parseCsv(input:string,maxRows:number):ParsedCsvSource{
  const entries=parseCsvRecordEntries(input),warnings:string[]=[]
  if(!entries.length)return{rows:[],rowCount:0,warnings}
  const records=entries.map(entry=>entry.record)
  const headers=normalizeCsvHeaders(records[0])
  const overwideEntry=entries.slice(1).find(entry=>entry.record.length>headers.length)
  if(overwideEntry){
    throw new Error(`Invalid CSV source at line ${overwideEntry.sourceLine}: expected at most ${headers.length} fields from the header but found ${overwideEntry.record.length}`)
  }
  const rows=records.slice(1).map(record=>Object.fromEntries(headers.map((header,index)=>[header,coerceCsvScalar(header,record[index]??null)])))
  if(rows.length>maxRows)warnings.push(`FILE source contains ${rows.length} data rows; ${maxRows} were selected for profiling.`)
  return{rows:rows.slice(0,maxRows),rowCount:rows.length,warnings}
}
