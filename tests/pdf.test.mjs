import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {calculate} from '../server/money.mjs';
import {invoicePDF,pdfModel,pythonPath} from '../server/pdf.mjs';
import {currency,amountInWords} from '../server/documents/format.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'billing-pdf-tests-'));
const line={description:'Shell Pipe Ring — café',itemType:'product',hsn:'',unit:'NOS',quantity:'1',rate:'102',discount:'0',taxRate:'18'};
const input={date:'2026-11-04',dueDate:'2026-12-04',placeOfSupply:'27',pricing:'exclusive',rounding:false,lines:[line]};
export function fixture(changes={},extra={}){
 const v={...input,...changes};const body={...v,...calculate(v,'27')};
 return {kind:'invoice',number:'TEST/2026/001',status:'issued',body,snapshot:{business:{name:'SAMPLE BUSINESS — TEST ONLY',address:'Sample business address\nPune 411001',phone:'0000000000',email:'sample@example.test',state:'27',gstin:'27ABCDE1234F1Z5',bankName:'Sample Bank',accountName:'Sample business',accountNumber:'TEST ACCOUNT',ifsc:'TEST0000001',upi:'sample@example',terms:'Sample terms for testing only.',signatoryName:'Test Manager'},customer:{name:'Sample customer — café',address:'Sample customer address',state:v.placeOfSupply,phone:'0000000000'},document:body},...extra};
}
function inspect(bytes,name){
 const file=path.join(root,name+'.pdf');fs.writeFileSync(file,bytes);fs.mkdirSync('tmp/pdf-qa',{recursive:true});fs.writeFileSync('tmp/pdf-qa/'+name+'.pdf',bytes);
 return JSON.parse(execFileSync(pythonPath(),['-X','utf8','-c',`import json,sys,pdfplumber
with pdfplumber.open(sys.argv[1]) as doc:
 print(json.dumps([{'text':p.extract_text() or '', 'width':p.width,'height':p.height,'chars':len(p.chars),'outside':[c['text'] for c in p.chars if c['x0']<40 or c['x1']>556 or c['top']<20 or c['bottom']>820]} for p in doc.pages]))`,file],{encoding:'utf8',windowsHide:true,maxBuffer:2*1024*1024}));
}
function assertFinancials(doc,pages){
 const model=pdfModel(doc),text=pages.map(p=>p.text).join('\n').replace(/\s/g,' ');
 for(const [label,value]of model.formatted.totals){assert.ok(text.includes(label),'Missing '+label);assert.ok(text.includes(value.replace(/\s/g,' ')),'Missing saved value '+value);}
 for(const l of model.formatted.lines)for(const key of ['rate','taxable','total'])assert.ok(text.includes(l[key]),'Missing saved line '+key+' '+l[key]);
 assert.equal(model.value,doc.snapshot.document);
 for(const p of pages){assert.equal(Math.round(p.width),595);assert.equal(Math.round(p.height),842);assert.ok(p.chars>100,'No blank pages');assert.deepEqual(p.outside,[],'No clipped text');}
}
test('PDF money formatting and persisted discount breakdown use exact paise',()=>{
 assert.equal(currency(123456789),'₹\u00a012,34,567.89');assert.equal(currency(-1),'−₹\u00a00.01');
 assert.equal(amountInWords(10250),'Indian Rupees One Hundred Two and Fifty Paise Only');
 const d=fixture({lines:[{...line,quantity:'2',discount:'10'}]});assert.equal(d.body.grossAmount,20400);assert.equal(d.body.discountTotal,2040);assert.equal(d.body.lines[0].discountAmount,2040);
 const copy=structuredClone(d);delete copy.snapshot.document.discountTotal;delete copy.snapshot.document.grossAmount;
 assert.equal(pdfModel(copy).discount,null);assert.equal(pdfModel(copy).subtotal,null);
 const invalid=structuredClone(d);invalid.snapshot.document.total++;assert.throws(()=>pdfModel(invalid),/inconsistent/);
});
test('A4 single item, missing HSN, Unicode currency, discount, GST and partial payments match snapshots',async()=>{
 const cases=[fixture(),fixture({placeOfSupply:'29',lines:[{...line,quantity:'2.125',rate:'199.99',discount:'12.5'}],rounding:true}),fixture({pricing:'inclusive',lines:[{...line,rate:'118',discount:'10'}]})];
 for(const [i,d]of cases.entries()){
  if(i===1){d.paid=1000;d.balance=d.body.total-1000;d.payments=[{date:'2026-11-04',method:'UPI',reference:'TEST-TXN-123',amount:1000},{date:'2026-11-04',method:'Cash',reference:'REVERSED-TEST',amount:100,reversed_at:'2026-11-04'}];}
  const pages=inspect(await invoicePDF(d),'single-'+i);assertFinancials(d,pages);assert.equal(pages.length,1);const text=pages[0].text;
  for(const label of ['TAX INVOICE','BILL TO','AMOUNT IN WORDS','BANK & PAYMENT DETAILS','Authorised','Shell Pipe Ring','café','—'])assert.ok(text.includes(label),label);
  assert.ok(!text.includes('996311'),'No invented classification');assert.ok(!text.includes('SHIP TO'),'Standard invoices have a single Bill To section');
  if(i===1){assert.ok(text.includes('TEST-TXN-123'));assert.ok(!text.includes('REVERSED-TEST'));assert.equal(d.body.cgst,0);assert.ok(d.body.igst>0);}
 }
});
test('multiple pages repeat table headers; long descriptions and addresses are not clipped',async()=>{
 const lines=Array.from({length:65},(_,i)=>({...line,description:`Item ${String(i+1).padStart(3,'0')} — precision product`,details:'Long specification: '+('Carefully inspect and package each component. '.repeat(i===4?10:3)),quantity:String(i+1),rate:'102.25',discount:i%2?'5':'0',hsn:i%3?'7307':''}));
 const d=fixture({lines,notes:'Final note marker — preserved.',shipping:{name:'Different delivery customer',address:'Long delivery address, '.repeat(25),state:'29',phone:'0000000000'}});
 d.snapshot.customer.address='Long billing address, '.repeat(25);
 const bytes=await invoicePDF(d),pages=inspect(bytes,'multipage');assertFinancials(d,pages);assert.ok(pages.length>2);
 const text=pages.map(p=>p.text).join('\n');assert.ok(text.includes('Item 065'));assert.ok(text.includes('Final note marker'));
 for(const [i,page]of pages.entries()){
  assert.ok(page.text.includes(`Page ${i+1} of ${pages.length}`));
  if(page.text.includes('precision product'))assert.ok(page.text.includes('Item description'),'Header repeats on item continuation pages');
 }
 fs.mkdirSync('tmp/pdf-qa',{recursive:true});fs.writeFileSync('tmp/pdf-qa/multipage.pdf',bytes);
});
test('all shared document headings and configured cess are rendered from saved values',async()=>{
 for(const [kind,title]of [['quote','QUOTATION'],['proforma','PROFORMA INVOICE'],['credit_note','CREDIT NOTE'],['debit_note','DEBIT NOTE'],['delivery_note','DELIVERY NOTE']]){
  const d=fixture({}, {kind});d.snapshot.document.referenceNumber='TEST/ORIGINAL/001';
  const pages=inspect(await invoicePDF(d),kind),text=pages.map(p=>p.text).join('\n');assert.ok(text.includes(title));assert.ok(text.includes('TEST/ORIGINAL/001'));
  if(kind==='delivery_note')assert.ok(!text.includes('Grand total'));else assertFinancials(d,pages);
 }
 const d=fixture();d.snapshot.document.cess=100;d.snapshot.document.total+=100;const text=inspect(await invoicePDF(d),'cess').map(p=>p.text).join('\n');assert.ok(text.includes('Cess'));assert.ok(text.replace(/\s/g,' ').includes(currency(100).replace(/\s/g,' ')));
});
test('long notes and terms flow across pages without dropping the signatory or last text',async()=>{
 const d=fixture({notes:'Customer note. '.repeat(130)+'END CUSTOMER NOTE',terms:'Terms condition for this sample. '.repeat(120)+'END TERMS'});
 const pages=inspect(await invoicePDF(d),'long-terms');assertFinancials(d,pages);const text=pages.map(p=>p.text).join(' ').replace(/\s+/g,' ');assert.ok(text.includes('END CUSTOMER NOTE'));assert.ok(text.includes('END TERMS'));assert.ok(text.includes('Authorised signatory'));
});
test.after(()=>fs.rmSync(root,{recursive:true,force:true}));
