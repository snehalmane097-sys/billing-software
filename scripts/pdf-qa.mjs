// Read-only verification/export of an existing saved document. Never seeds or edits records.
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {execFileSync} from 'node:child_process';
import {invoicePDF,pythonPath,pdfModel} from '../server/pdf.mjs';
import {calculate} from '../server/money.mjs';
import sharp from 'sharp';
const output=path.resolve('output/pdf');fs.mkdirSync(output,{recursive:true});
if(process.argv[2]){
 const db=new DatabaseSync(path.join(process.env.DATA_DIR||'data','billing.sqlite'),{readOnly:true});
 try{
  const row=db.prepare('SELECT * FROM documents WHERE id=?').get(process.argv[2]);if(!row?.snapshot)throw Error('Choose an issued document with a saved snapshot');
  const d={...row,body:JSON.parse(row.body),snapshot:JSON.parse(row.snapshot),payments:db.prepare('SELECT * FROM payments WHERE document_id=? ORDER BY date,id').all(row.id)};
  d.paid=d.payments.filter(p=>!p.reversed_at).reduce((s,p)=>s+p.amount,0);d.balance=d.body.total-d.paid;
  const logo=d.snapshot.business.logoId?db.prepare('SELECT * FROM logos WHERE id=?').get(d.snapshot.business.logoId):null;
  const filename=path.join(output,'Invoice_'+d.number.replace(/[^a-zA-Z0-9_-]/g,'_')+'.pdf');
  fs.writeFileSync(filename,await invoicePDF(d,logo));
  const result=JSON.parse(execFileSync(pythonPath(),['-X','utf8','-c',`import json,sys,pdfplumber
with pdfplumber.open(sys.argv[1]) as d: print(json.dumps({'pages':len(d.pages),'text':' '.join(p.extract_text() or '' for p in d.pages)}))`,filename],{encoding:'utf8',windowsHide:true}));
  const text=result.text.replace(/\s/g,' '),model=pdfModel(d,logo);
  for(const [,value]of model.formatted.totals)if(!text.includes(value.replace(/\s/g,' ')))throw Error('Saved total missing from PDF');
  for(const l of model.formatted.lines)for(const k of ['rate','taxable','total'])if(!text.includes(l[k]))throw Error('Saved item value missing from PDF');
  console.log(JSON.stringify({file:filename,pages:result.pages,verified:'Every saved line rate/taxable/total and document total/taxes/payment/balance reproduced. Source database opened read-only.',historicalLogo:!!logo}));
 }finally{db.close();}
}
// Clearly synthetic sample, independent of the database and never saved as a business record.
const lines=Array.from({length:32},(_,i)=>({itemType:'product',description:`Sample precision component ${i+1}`,details:'Sample specification. Machined component, packed and inspected before delivery. '+(i===3?'Extended description: '+('Finish and dimensions to approved sample. '.repeat(8)):''),hsn:i%3?'7307':'',unit:'NOS',quantity:String(i+1),rate:'102.25',discount:i%2?'5':'0',taxRate:'18'}));
const input={date:'2026-11-04',dueDate:'2026-12-04',placeOfSupply:'29',pricing:'exclusive',rounding:true,lines,notes:'SYNTHETIC SAMPLE — For layout review only. Not a real invoice.',terms:'Sample terms: payment within 30 days. Inspect the goods upon receipt.',shipping:{name:'Sample delivery location',address:'Sample warehouse\nIndustrial Estate, Bengaluru 560001',state:'29'}};
const value={...input,...calculate(input,'27')};
const d={kind:'invoice',status:'issued',number:'SAMPLE/2026/001',body:value,paid:250000,balance:value.total-250000,payments:[{date:'2026-11-04',method:'UPI',reference:'SAMPLE-TXN-001',amount:250000}],snapshot:{business:{name:'Example Business — Test Only',address:'Sample industrial address\nPune, Maharashtra 411001',state:'27',phone:'0000000000',email:'sample@example.test',bankName:'Sample Bank',accountName:'Example Business — Test Only',accountNumber:'SAMPLE ACCOUNT',ifsc:'TEST0000001',signatoryName:'Sample Signatory'},customer:{name:'Sample Customer — Layout Review',address:'A long sample address for wrapping verification\nIndustrial Complex, Outer Ring Road\nBengaluru, Karnataka 560001',state:'29',phone:'0000000000'},document:value}};
const image=await sharp(Buffer.from('<svg width="600" height="180" xmlns="http://www.w3.org/2000/svg"><rect width="600" height="180" rx="10" fill="#6B4A2E"/><text x="300" y="115" text-anchor="middle" font-family="Arial" font-size="75" fill="#FFFFFF">SAMPLE</text></svg>')).png().toBuffer();
fs.writeFileSync(path.join(output,'Invoice_Multipage_Sample.pdf'),await invoicePDF(d,{original:image,mime:'image/png'}));
console.log('Synthetic multi-page PDF generated with a sample logo, IGST, discounts and partial payment.');
