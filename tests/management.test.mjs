import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'billing-management-'));
process.env.DATA_DIR=path.join(root,'records');process.env.BACKUP_DIR=path.join(root,'backups');process.env.BACKUP_KEY=crypto.randomBytes(32).toString('hex');
const {server}=await import('../server/index.mjs');
const store=await import('../server/db.mjs');
const {pythonPath}=await import('../server/pdf.mjs');
const handler=server.listeners('request')[0],manager={cookie:'',csrf:''},staff={cookie:'',csrf:''};
async function request(url,method='GET',body,s=manager){
 const headers=new Map();let bytes;
 const req={url:'/api'+url,method,headers:{host:'localhost:3001','content-type':'application/json',cookie:s.cookie,'x-csrf-token':s.csrf},socket:{remoteAddress:'127.0.0.1'},async *[Symbol.asyncIterator](){if(body!==undefined)yield Buffer.from(JSON.stringify(body));}};
 const res={statusCode:200,writableEnded:false,setHeader(k,v){headers.set(k.toLowerCase(),v);},end(b){bytes=Buffer.from(b||'');this.writableEnded=true;}};
 await handler(req,res);if(headers.get('set-cookie'))s.cookie=headers.get('set-cookie').split(';')[0];
 const type=headers.get('content-type')||'',value=type.includes('json')?JSON.parse(bytes.toString()):bytes;if(value.csrf)s.csrf=value.csrf;return {status:res.statusCode,value,headers};
}
const ok=async(...args)=>{const r=await request(...args);assert.equal(r.status,200,JSON.stringify(r.value));return r.value;};
function text(bytes){const filename=path.join(root,'check.pdf');fs.writeFileSync(filename,bytes);return execFileSync(pythonPath(),['-X','utf8','-c',"from pypdf import PdfReader;import sys;print(' '.join(p.extract_text() for p in PdfReader(sys.argv[1]).pages))",filename],{windowsHide:true,encoding:'utf8'}).replace(/\s+/g,' ');}
test('persistent management workflows, company financials, proforma revisions and permissions',async t=>{
 t.after(()=>{store.db.close();fs.rmSync(root,{recursive:true,force:true});});
 await ok('/setup','POST',{name:'Test Manager',email:'manager@example.test',password:'test-password-12345'});
 await ok('/settings','PUT',{name:'Test Business',address:'Test supplier address',state:'27',gstin:'27ABCDE1234F1Z5',confirmed:true});
 await ok('/users','POST',{name:'Test Staff',email:'staff@example.test',password:'staff-password-12345'});
 await ok('/login','POST',{email:'staff@example.test',password:'staff-password-12345'},staff);
 const company=await ok('/customers','POST',{name:'Test Company Alpha',gstin:'27ABCDE1234F1Z5',address:'Actual billing address must remain',state:'27',contactName:'Test purchasing contact'});
 const other=await ok('/customers','POST',{name:'Test Company Beta',address:'Second test address',state:'29'});
 const base={kind:'invoice',customerId:company.id,date:'2026-01-10',dueDate:'2026-01-20',placeOfSupply:'27',pricing:'exclusive',notes:'Test notes',terms:'Test terms',lines:[{description:'Test product',itemType:'product',hsn:'',sac:'',unit:'NOS',quantity:'1',rate:'100',discount:'0',taxRate:'18'}]};
 const issue=async input=>{const d=await ok('/documents','POST',input);return ok('/documents/'+d.id+'/issue','POST',{version:d.version});};
 let product,service;
 await t.test('simple product and service masters persist, edit, deactivate, reactivate and retain history',async()=>{
  product=await ok('/services','POST',{itemType:'product',name:'Shell Pipe Ring',unit:'NOS',rate:'102'});service=await ok('/services','POST',{itemType:'service',name:'Installation',unit:'hour',rate:'500'});
  assert.equal(product.hsn,'');assert.equal(service.sac,'');assert.equal(product.taxRate,'');
  assert.equal((await ok('/catalogue?type=product')).total,1);assert.equal((await ok('/catalogue?type=service')).total,1);
  product=await ok('/services/'+product.id,'PUT',{...product,rate:'105',purchasePrice:'50'});
  assert.equal((await ok('/catalogue/'+product.id)).history.length,2);
  assert.equal((await ok('/catalogue?type=product','GET',undefined,staff)).items[0].purchasePrice,undefined);assert.equal((await ok('/catalogue?type=product&q=50','GET',undefined,staff)).total,0,'Search must not disclose hidden purchase prices');
  assert.equal((await request('/services/'+product.id+'/activation','POST',{version:product.version,active:false},staff)).status,403);
  await ok('/services/'+product.id+'/activation','POST',{version:product.version,active:false});
  assert.equal((await ok('/services')).some(r=>r.id===product.id),false);
  const inactive=(await ok('/catalogue?type=product&status=inactive')).items[0];assert.equal(inactive.id,product.id);
  assert.equal((await request('/catalogue?type=product&status=inactive','GET',undefined,staff)).status,403);
  assert.equal((await request('/catalogue/'+product.id,'GET',undefined,staff)).status,403);
  assert.equal((await request('/services/'+product.id+'/activation','POST',{version:product.version,active:true})).status,409);
  await ok('/services/'+product.id+'/activation','POST',{version:inactive.version,active:true});
  service=await ok('/services/'+service.id,'PUT',{...service,name:'Installation edited',rate:'550'});assert.equal(service.sac,'');
  store.db.close();store.openDB();assert.equal((await ok('/catalogue/'+service.id)).name,'Installation edited');
 });
 let unpaid,partial,paid,future,draft;
 await t.test('all company payment filters, dates, search, sorting, pagination and DB-derived totals',async()=>{
  unpaid=await issue(base);partial=await issue({...base,date:'2026-02-10',dueDate:'2026-02-20'});paid=await issue({...base,date:'2026-03-10',dueDate:'2026-03-20'});future=await issue({...base,dueDate:'2099-01-01'});draft=await ok('/documents','POST',base);
  await issue({...base,customerId:other.id,placeOfSupply:'29'});
  await ok('/payments','POST',{documentId:partial.id,amount:'50',date:'2026-02-10',method:'UPI',reference:'TEST-PARTIAL',idempotency:'partial'});
  await ok('/payments','POST',{documentId:paid.id,amount:'118',date:'2026-03-10',method:'Cash',idempotency:'full'});
  const account=await ok('/accounts/'+company.id);assert.equal(account.invoices.total,4);assert.deepEqual({...account.summary},{billed:47200,received:16800,outstanding:30400,overdue:18600,invoiceCount:4});
  const dbTotals=store.get("SELECT SUM(json_extract(body,'$.total')) n FROM documents WHERE customer_id=? AND kind='invoice' AND status='issued'",company.id);assert.equal(account.summary.billed,dbTotals.n);
  for(const [filter,count]of [['all',4],['paid',1],['unpaid',2],['partial',1],['overdue',2],['outstanding',3]])assert.equal((await ok('/accounts/'+company.id+'?filter='+filter)).invoices.total,count,filter);
  assert.equal((await ok('/accounts?q=purchasing')).items[0].id,company.id);assert.equal((await ok('/accounts?q=27ABCDE')).items[0].id,company.id);
  assert.equal((await ok('/accounts/'+company.id+'?from=2026-02-01&to=2026-02-28')).invoices.total,1);
  assert.equal((await ok('/accounts/'+company.id+'?q='+encodeURIComponent(paid.number))).invoices.items[0].id,paid.id);
  assert.equal((await ok('/accounts/'+company.id+'?page=2')).invoices.items.length,0);
  assert.equal((await ok('/documents?kind=invoice&status=draft')).items.some(d=>d.id===draft.id),true);
  assert.equal((await ok('/accounts/'+company.id+'?sort=date&direction=asc')).invoices.items.at(-1).id,paid.id);
  assert.equal((await request('/accounts/'+company.id+'?from=bad')).status,400);
  assert.equal((await request('/documents?sort=bad')).status,400);
  assert.equal((await request('/documents?filter=overdue&kind=proforma')).status,400);
 });
 await t.test('company ledger retains reversals, reconciles balances and exports a real statement',async()=>{
  let ledger=await ok('/accounts/'+company.id+'/ledger');assert.equal(ledger.closing,30400);
  const period=await ok('/accounts/'+company.id+'/ledger?from=2026-02-01&to=2026-02-28');assert.equal(period.opening,23600);assert.equal(period.closing,30400);
  const payment=await ok('/payments','POST',{documentId:unpaid.id,amount:'10',date:'2026-01-11',method:'Bank transfer',reference:'TEST-REVERSED',idempotency:'reversal'});
  await ok('/payments/'+payment.id+'/reverse','POST',{reason:'Test reversal reason'});
  ledger=await ok('/accounts/'+company.id+'/ledger');assert.equal(ledger.closing,30400);assert.ok(ledger.entries.some(e=>e.type==='Payment reversal'&&e.detail==='Test reversal reason'));
  assert.equal((await ok('/accounts/'+company.id)).summary.received,16800);
  const csv=await request('/accounts/'+company.id+'/statement.csv');assert.equal(csv.status,200);assert.match(csv.value.toString(),/Closing balance/);assert.match(csv.value.toString(),/304.00/);assert.match(csv.value.toString(),/Test reversal reason/);
  assert.ok((await ok('/documents/'+unpaid.id+'/history')).some(e=>e.action==='payment.reversed'));
 });
 await t.test('proforma draft editing, distinct numbering, revisions and idempotent validated conversion',async()=>{
  let p=await ok('/documents','POST',{...base,kind:'proforma'});
  p=await ok('/documents/'+p.id,'PUT',{...p.body,version:p.version,lines:[{...base.lines[0],rate:'200'}]});assert.equal(p.body.total,23600);
  p=await ok('/documents/'+p.id+'/issue','POST',{version:p.version});assert.equal(p.overdue,false,'A proforma is not an overdue receivable');assert.match(p.number,/^P/);assert.notEqual(p.number,unpaid.number);
  const original=structuredClone(p),before=(await ok('/reports?from=2026-01-01&to=2099-01-01')).billed;
  assert.equal((await request('/payments','POST',{documentId:p.id,amount:'1',date:'2026-01-10',method:'Cash',idempotency:'proforma-rejected'})).status,400);
  assert.equal((await request('/documents/'+p.id+'/revise','POST',{...p.body,version:p.version,revisionReason:'Unauthorised'},staff)).status,403);
  p=await ok('/documents/'+p.id+'/revise','POST',{...p.body,version:p.version,revisionReason:'Agreed rate changed',lines:[{...base.lines[0],rate:'300'}]});assert.equal(p.body.total,35400);assert.equal(p.number,original.number);
  assert.equal((await ok('/documents/'+p.id+'/revisions'))[0].version,original.version);
  const oldPDF=text(await ok('/documents/'+p.id+'/pdf?revision='+original.version));assert.match(oldPDF,/236.00/);assert.match(oldPDF,/Archived version/);
  const currentPDF=text(await ok('/documents/'+p.id+'/pdf'));assert.match(currentPDF,/354.00/);assert.match(currentPDF,/PROFORMA INVOICE/);
  const [first,second]=await Promise.all([ok('/documents/'+p.id+'/convert','POST',{}),ok('/documents/'+p.id+'/convert','POST',{})]);assert.equal(first.id,second.id);assert.equal(first.status,'draft');assert.equal(first.number,null);assert.equal(first.body.total,35400);assert.equal(first.body.sourceDocumentNumber,p.number);
  const retained=await ok('/documents/'+p.id);assert.deepEqual(retained.snapshot,p.snapshot);assert.equal(retained.number,p.number);
  assert.equal((await request('/documents/'+p.id+'/revise','POST',{...p.body,version:retained.version,revisionReason:'Too late'})).status,409);
  assert.equal((await ok('/reports?from=2026-01-01&to=2099-01-01')).billed,before,'Proformas and converted drafts are not sales');
  const inv=await ok('/documents/'+first.id+'/issue','POST',{version:first.version});assert.match(inv.number,/^I/);assert.notEqual(inv.number,p.number);
  assert.equal((await ok('/accounts/'+company.id)).summary.billed,47200+35400);
  assert.equal((await request('/documents/'+inv.id,'PUT',{...inv.body,version:inv.version})).status,409);
  const pdf=await request('/documents/'+inv.id+'/pdf?download=1');assert.match(pdf.headers.get('content-disposition'),/^attachment/);const output=text(pdf.value);assert.match(output,/BILL TO/);assert.doesNotMatch(output,/SHIP TO/);assert.match(output,/Actual billing address must remain/);
 });
 await t.test('staff cannot access manager accounts, master modifications, other records or saved revision PDFs',async()=>{
  for(const url of ['/accounts','/accounts/'+company.id,'/accounts/'+company.id+'/ledger','/accounts/'+company.id+'/statement.csv','/documents/'+unpaid.id+'/history','/documents/'+unpaid.id+'/revisions','/documents/'+unpaid.id+'/pdf?revision=2'])assert.equal((await request(url,'GET',undefined,staff)).status,403,url);
  assert.equal((await request('/services/'+service.id,'PUT',{...service,rate:'1'},staff)).status,403);
  const ownCustomer=await ok('/customers','POST',{name:'Staff test company',address:'Staff billing address',state:'27'},staff);
  let own=await ok('/documents','POST',{...base,kind:'proforma',customerId:ownCustomer.id},staff);own=await ok('/documents/'+own.id+'/issue','POST',{version:own.version},staff);
  assert.equal((await request('/documents/'+own.id+'/revise','POST',{...own.body,version:own.version,revisionReason:'Staff attempt'},staff)).status,403);
  const converted=await ok('/documents/'+own.id+'/convert','POST',{},manager);assert.equal((await ok('/documents/'+converted.id,'GET',undefined,staff)).created_by,own.created_by);
  assert.ok((await ok('/documents/'+own.id+'/history','GET',undefined,staff)).some(e=>e.action==='proforma.converted'));
 });
 await t.test('server pagination returns distinct persisted invoice and catalogue pages',async()=>{
  for(let i=0;i<12;i++){await ok('/documents','POST',{...base,notes:'Pagination draft '+i});await ok('/services','POST',{itemType:'product',name:'Pagination product '+i,unit:'NOS',rate:String(i+1)});}
  const first=await ok('/documents?status=draft&page=1'),second=await ok('/documents?status=draft&page=2');assert.equal(first.items.length,10);assert.ok(second.items.length>0);assert.ok(!second.items.some(d=>first.items.some(a=>a.id===d.id)));
  const one=await ok('/catalogue?type=product&page=1'),two=await ok('/catalogue?type=product&page=2');assert.equal(one.items.length,10);assert.equal(two.items.length,3);assert.ok(!two.items.some(d=>one.items.some(a=>a.id===d.id)));
 });
 await t.test('encrypted backup and actual restore preserve archived proforma versions and company balances',async()=>{
  const versions=store.get('SELECT COUNT(*) n FROM document_revisions').n;assert.ok(versions>0);const balance=(await ok('/accounts/'+company.id)).summary.outstanding;
  const backup=await ok('/backups','POST',{});await ok('/backups/test','POST',{file:backup.file});store.run('DELETE FROM document_revisions');assert.equal(store.get('SELECT COUNT(*) n FROM document_revisions').n,0);
  await ok('/backups/restore','POST',{file:backup.file,confirmation:'RESTORE '+backup.file,password:'test-password-12345'});await ok('/login','POST',{email:'manager@example.test',password:'test-password-12345'});
  assert.equal(store.get('SELECT COUNT(*) n FROM document_revisions').n,versions);assert.equal((await ok('/accounts/'+company.id)).summary.outstanding,balance);
 });

});
