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
  const occurrences=new Map<string,number>()
  return rawHeaders.map((rawHeader,index)=>{
    const base=rawHeader.trim().replace(/^\uFEFF/,'')||`column_${index+1}`
    const occurrence=(occurrences.get(base)??0)+1
    occurrences.set(base,occurrence)
    return occurrence===1?base:`${base}__${occurrence}`
  })
}

export function parseCsvRecords(input:string){
  const records:string[][]=[];let record:string[]=[];let field='';let quoted=false
  for(let index=0;index<input.length;index+=1){
    const char=input[index],next=input[index+1]
    if(quoted){
      if(char==='"'&&next==='"'){field+='"';index+=1;continue}
      if(char==='"'){quoted=false;continue}
      field+=char;continue
    }
    if(char==='"'&&field.length===0){quoted=true;continue}
    if(char===','){record.push(field);field='';continue}
    if(char==='\n'){record.push(field.replace(/\r$/,''));records.push(record);record=[];field='';continue}
    field+=char
  }
  if(quoted)throw new Error('Invalid CSV source: unterminated quoted field')
  if(field.length||record.length){record.push(field.replace(/\r$/,''));records.push(record)}
  return records.filter(row=>row.some(value=>value.trim()!==''))
}

export function parseCsv(input:string,maxRows:number):ParsedCsvSource{
  const records=parseCsvRecords(input),warnings:string[]=[]
  if(!records.length)return{rows:[],rowCount:0,warnings}
  const headers=normalizeCsvHeaders(records[0])
  const rows=records.slice(1).map(record=>Object.fromEntries(headers.map((header,index)=>[header,coerceCsvScalar(header,record[index]??null)])))
  if(rows.length>maxRows)warnings.push(`FILE source contains ${rows.length} data rows; ${maxRows} were selected for profiling.`)
  return{rows:rows.slice(0,maxRows),rowCount:rows.length,warnings}
}
