import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {documentModel} from './documents/model.mjs';
import {currency,dateLabel,stateName} from './documents/format.mjs';
import {minor} from './money.mjs';
const exec=promisify(execFile),renderer=fileURLToPath(new URL('./documents/render.py',import.meta.url));
export function pythonPath(){
 const bundled=path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
 return process.env.PDF_PYTHON||process.env.CODEX_PRIMARY_RUNTIME_PYTHON||(existsSync(bundled)?bundled:process.platform==='win32'?'python':'python3');
}
export function pdfModel(doc,logo=null){
 const m=documentModel(doc,logo),v=m.value;
 m.business={...m.business,stateLabel:stateName(m.business.state)};
 m.customer={...m.customer,stateLabel:stateName(m.customer.state)};
 m.shipTo={...m.shipTo,stateLabel:stateName(m.shipTo.state)};
 m.logoData=logo?Buffer.from(logo.original).toString('base64'):null;
 delete m.logo;
 const totals=[['Subtotal'+(v.pricing==='inclusive'?' (incl. GST)':''),m.subtotal==null?'Not recorded':currency(m.subtotal),''],['Total discount',m.discount==null?'Included in taxable values':currency(m.discount),''],['Taxable value',currency(v.subtotal),''],['CGST',currency(v.cgst),''],['SGST',currency(v.sgst),''],['IGST',currency(v.igst),'']];
 if(m.cess)totals.push(['Cess',currency(m.cess),'']);
 totals.push(['Round-off',currency(v.roundOff),''],[m.cancelled?'Original invoice total':'Grand total',currency(v.total),'grand']);
 if(m.kind==='invoice')totals.push(['Payments received',currency(m.paid),''],['Balance due',currency(m.balance),'balance']);
 m.formatted={date:dateLabel(v.date),dueDate:dateLabel(v.dueDate),placeOfSupply:stateName(v.placeOfSupply),totals,
 lines:v.lines.map(l=>({rate:currency(minor(l.rate),{symbol:false}),discount:String(l.discount||'0')+'%'+(l.discountAmount!=null?'\n'+currency(l.discountAmount,{symbol:false}):''),taxable:currency(l.taxable,{symbol:false}),taxRate:l.taxRate===''?'Unset':l.taxRate+'%',total:currency(l.total,{symbol:false})})),
 payments:m.payments.map(p=>({date:dateLabel(p.date),method:p.method,reference:p.reference||'—',amount:currency(p.amount,{symbol:false})}))};
 return m;
}
let queue=Promise.resolve();
export function invoicePDF(doc,logo=null){
 const model=pdfModel(doc,logo);
 const job=queue.then(async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'billing-document-'));
  try{
   const source=path.join(dir,'model.json'),output=path.join(dir,'document.pdf');
   await fs.writeFile(source,JSON.stringify(model),'utf8');
   await exec(pythonPath(),[renderer,source,output],{timeout:45000,maxBuffer:1024*1024,windowsHide:true});
   const bytes=await fs.readFile(output);if(bytes.subarray(0,5).toString()!=='%PDF-')throw Error('Invalid PDF output');return bytes;
  }catch(error){console.error('PDF renderer failed:',error.stderr||error.message);throw Error('PDF generation failed. Check the PDF runtime and configured fonts on the server.');}
  finally{await fs.rm(dir,{recursive:true,force:true,maxRetries:3});}
 });queue=job.catch(()=>{});return job;
}

export async function combinePDFs(buffers){
 if(buffers.length===1)return buffers[0];
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'billing-print-'));
 try{const files=[];for(const [i,bytes]of buffers.entries()){const file=path.join(dir,i+'.pdf');await fs.writeFile(file,bytes);files.push(file);}const output=path.join(dir,'combined.pdf');await exec(pythonPath(),[fileURLToPath(new URL('./documents/merge.py',import.meta.url)),output,...files],{timeout:45000,maxBuffer:1024*1024,windowsHide:true});return await fs.readFile(output);}
 finally{await fs.rm(dir,{recursive:true,force:true,maxRetries:3});}
}
