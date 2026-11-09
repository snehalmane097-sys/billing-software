import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'invoice-manager-'));process.env.DATA_DIR=path.join(root,'records');process.env.BACKUP_DIR=path.join(root,'backups');process.env.BACKUP_KEY=crypto.randomBytes(32).toString('hex');
const {server}=await import('../server/index.mjs'),store=await import('../server/db.mjs'),{pythonPath}=await import('../server/pdf.mjs');
const manager={cookie:'',csrf:''},staff={cookie:'',csrf:''},handler=server.listeners('request')[0];
async function request(url,method='GET',body,s=manager){const headers=new Map();let bytes;const req={url:'/api'+url,method,headers:{host:'localhost:3001','content-type':'application/json',cookie:s.cookie,'x-csrf-token':s.csrf},socket:{remoteAddress:'127.0.0.1'},async *[Symbol.asyncIterator](){if(body!==undefined)yield Buffer.from(JSON.stringify(body));}};const res={statusCode:200,writableEnded:false,setHeader(k,v){headers.set(k.toLowerCase(),v);},end(b){bytes=Buffer.from(b||'');this.writableEnded=true;}};await handler(req,res);if(headers.get('set-cookie'))s.cookie=headers.get('set-cookie').split(';')[0];const value=(headers.get('content-type')||'').includes('json')?JSON.parse(bytes):bytes;if(value.csrf)s.csrf=value.csrf;return {status:res.statusCode,value,headers};}
const ok=async(...args)=>{const r=await request(...args);assert.equal(r.status,200,JSON.stringify(r.value));return r.value;};
function inspectPDF(bytes){const file=path.join(root,'assert.pdf');fs.writeFileSync(file,bytes);return JSON.parse(execFileSync(pythonPath(),['-X','utf8','-c',"from pypdf import PdfReader;import sys,json;d=PdfReader(sys.argv[1]);print(json.dumps({'pages':len(d.pages),'text':' '.join(p.extract_text() for p in d.pages)}))",file],{encoding:'utf8',windowsHide:true}));}
test('filtered financial summary and invoice selection workflows use persistent scoped records',async t=>{
 t.after(()=>{store.db.close();fs.rmSync(root,{recursive:true,force:true});});
 await ok('/setup','POST',{name:'Test Manager',email:'manager@example.test',password:'test-password-12345'});await ok('/settings','PUT',{name:'Test Business',address:'Test supplier address',state:'27',gstin:'27ABCDE1234F1Z5',confirmed:true});
 await ok('/users','POST',{name:'Staff',email:'staff@example.test',password:'staff-password-12345'});await ok('/login','POST',{email:'staff@example.test',password:'staff-password-12345'},staff);
 const customer=await ok('/customers','POST',{name:'SANLAN Controls',address:'Test billing address',phone:'9899999999',state:'27',gstin:'27ABCDE1234F1Z5'}),other=await ok('/customers','POST',{name:'Other Company',address:'Other address',state:'29'});
 const base={kind:'invoice',customerId:customer.id,date:'2026-01-10',dueDate:'2026-01-20',placeOfSupply:'27',pricing:'exclusive',lines:[{description:'Test item',itemType:'product',unit:'NOS',quantity:'1',rate:'100',discount:'0',taxRate:'0'}]};
 const issue=async(b,s=manager)=>{const d=await ok('/documents','POST',b,s);return ok('/documents/'+d.id+'/issue','POST',{version:d.version},s);},docs=[];
 for(let i=0;i<12;i++)docs.push(await issue({...base,dueDate:i<10?base.dueDate:'2099-01-01'}));
 await issue({...base,customerId:other.id,placeOfSupply:'29'});const draft=await ok('/documents','POST',base);
 for(let i=0;i<5;i++)await ok('/payments','POST',{documentId:docs[i].id,amount:i<3?'100':'25',date:'2026-01-10',method:'UPI',idempotency:'initial-'+i});
 await t.test('summary aggregates all matches rather than the current page',async()=>{
  const first=await ok('/documents?kind=invoice&q=SANLAN&page=1'),second=await ok('/documents?kind=invoice&q=SANLAN&page=2');assert.equal(first.items.length,10);assert.equal(second.items.length,3);assert.deepEqual(first.summary,second.summary);
  assert.deepEqual({...first.summary},{records:13,invoiceAmount:120000,collected:35000,outstanding:85000,paidCount:3,unpaidCount:7,partialCount:2,overdueCount:7,draftCount:1,cancelledCount:0});assert.equal(first.items[0].customerPhone,'9899999999');
  const expected={paid:[3,30000,30000,0],unpaid:[7,70000,0,70000],partial:[2,20000,5000,15000],overdue:[7,70000,5000,65000]};for(const [filter,[records,invoiceAmount,collected,outstanding]]of Object.entries(expected)){const {summary:s}=await ok('/documents?kind=invoice&q=SANLAN&filter='+filter);assert.deepEqual([s.records,s.invoiceAmount,s.collected,s.outstanding],[records,invoiceAmount,collected,outstanding]);}
  assert.equal((await ok('/documents?q=27ABCDE1234F1Z5')).summary.invoiceAmount,120000);const empty=await ok('/documents?q=SANLAN&from=2026-02-01&to=2026-02-28');assert.ok(Object.values(empty.summary).every(v=>v===0));
 });
 await t.test('reviewed batch payments are idempotent and atomic, with stale balance checks',async()=>{
  const body={submissionId:'bulk-payments-test-01',date:'2026-01-10',method:'Bank transfer',reference:'TEST BATCH',items:[3,4].map(i=>({id:docs[i].id,expectedBalance:7500,amount:'75'}))};const first=await ok('/invoices/record-payments','POST',body);assert.deepEqual((await ok('/invoices/record-payments','POST',body)).payments.map(p=>p.id),first.payments.map(p=>p.id));
  let s=(await ok('/documents?q=SANLAN')).summary;assert.equal(s.collected,50000);assert.equal(s.paidCount,5);assert.equal(s.partialCount,0);
  assert.equal((await request('/invoices/record-payments','POST',{...body,submissionId:'changed-balances-01'})).status,409);
  const count=store.get('SELECT COUNT(*) n FROM payments').n;assert.equal((await request('/invoices/record-payments','POST',{...body,submissionId:'rollback-batch-test-01',items:[{id:docs[5].id,expectedBalance:10000,amount:'50'},{id:docs[6].id,expectedBalance:10000,amount:'150'}]})).status,400);assert.equal(store.get('SELECT COUNT(*) n FROM payments').n,count);
 });
 await t.test('draft archival is reversible, scoped, versioned and never archives issued rows',async()=>{
  assert.equal((await request('/invoices/archive','POST',{reason:'Bad batch',items:[draft,docs[0]]})).status,409);assert.equal(store.get('SELECT COUNT(*) n FROM document_archives').n,0);
  await ok('/invoices/archive','POST',{reason:'Unused draft',items:[draft]});const archived=await ok('/documents/'+draft.id);assert.equal(archived.archived,true);assert.equal((await ok('/documents?archive=archived')).total,1);
  assert.equal((await request('/documents/'+draft.id+'/issue','POST',{version:archived.version})).status,409);assert.equal((await request('/documents/'+draft.id,'PUT',{...base,version:archived.version})).status,409);
  await ok('/invoices/archive','POST',{restore:true,reason:'Needed again',items:[archived]});assert.equal((await ok('/documents/'+draft.id)).archived,false);
 });
 await t.test('selected CSV and merged PDFs contain the selected saved invoices',async()=>{
  const items=docs.slice(0,2).map(d=>({id:d.id}));const csv=await request('/invoices/selected.csv','POST',{items});assert.equal(csv.status,200);assert.match(csv.value.toString(),/SANLAN Controls/);for(const d of docs.slice(0,2))assert.ok(csv.value.toString().includes(d.number));
  const pdf=await request('/invoices/selected.pdf','POST',{items});assert.equal(pdf.status,200);const parsed=inspectPDF(pdf.value);assert.equal(parsed.pages,2);for(const d of docs.slice(0,2))assert.ok(parsed.text.includes(d.number));assert.doesNotMatch(parsed.text,/SHIP TO/);
 });
 await t.test('staff cannot bypass scope or manager-only bulk actions',async()=>{
  for(const route of ['selected.csv','archive','record-payments'])assert.equal((await request('/invoices/'+route,'POST',{items:[docs[0]],reason:'Test',submissionId:'staff-forbidden-test'},staff)).status,403);
  assert.equal((await request('/invoices/selected.pdf','POST',{items:[docs[0]]},staff)).status,403);assert.equal((await request('/documents/'+docs[0].id+'/cancel','POST',{},staff)).status,403);
  const staffCustomer=await ok('/customers','POST',{name:'Staff Company',address:'Test address',state:'27'},staff);const own=await issue({...base,customerId:staffCustomer.id},staff);assert.equal((await ok('/documents?kind=invoice', 'GET',undefined,staff)).total,1);
  assert.equal((await request('/invoices/selected.pdf','POST',{items:[own]},staff)).status,200);
  const uid=store.get("SELECT id FROM users WHERE email='staff@example.test'").id;await ok('/users/'+uid,'PUT',{active:true,payments:true});await ok('/login','POST',{email:'staff@example.test',password:'staff-password-12345'},staff);
  const payment={submissionId:'enabled-staff-pay-test',date:base.date,method:'UPI',items:[{id:own.id,expectedBalance:10000,amount:'20'}]};await ok('/invoices/record-payments','POST',payment,staff);assert.equal((await request('/invoices/record-payments','POST',{...payment,submissionId:'staff-foreign-pay-test',items:[{id:docs[5].id,expectedBalance:10000,amount:'20'}]},staff)).status,403);
 });
 await t.test('manager cancellation retains the original, reconciles accounts and blocks reissue',async()=>{
  const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}),d=await issue({...base,date:today,dueDate:today});const before=store.get('SELECT body,snapshot,number FROM documents WHERE id=?',d.id),accountBefore=await ok('/accounts/'+customer.id);
  const body={version:d.version,reason:'Duplicate invoice, supply did not occur',noSupply:true,noExternalReporting:true,managerReviewed:true};assert.equal((await request('/documents/'+d.id+'/cancel','POST',{...body,noSupply:false})).status,400);
  assert.equal((await request('/documents/'+docs[5].id+'/cancel','POST',{...body,version:docs[5].version})).status,409);
  const cancelled=await ok('/documents/'+d.id+'/cancel','POST',body);assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.balance,0);assert.deepEqual({...store.get('SELECT body,snapshot,number FROM documents WHERE id=?',d.id)},{...before});
  assert.equal((await ok('/documents/'+d.id+'/cancel','POST',body)).version,cancelled.version);assert.equal((await request('/documents/'+d.id+'/issue','POST',{version:cancelled.version})).status,409);
  const after=await ok('/accounts/'+customer.id);assert.equal(accountBefore.summary.outstanding-after.summary.outstanding,10000);const ledger=await ok('/accounts/'+customer.id+'/ledger');assert.ok(ledger.entries.some(e=>e.type==='Invoice cancellation'&&e.credit===10000));
  const pdf=await request('/invoices/selected.pdf','POST',{items:[{id:d.id}]});assert.equal(pdf.status,200);const text=inspectPDF(pdf.value).text;assert.match(text,/CANCELLED/);assert.match(text,/Original invoice\s+total/);
  const summary=(await ok('/documents?q=SANLAN')).summary;assert.equal(summary.cancelledCount,1);assert.equal(summary.invoiceAmount,120000);
 });
 await t.test('archive and cancellation state persist after reopening the database',async()=>{
  const d=await ok('/documents/'+draft.id);await ok('/invoices/archive','POST',{reason:'Persistence check',items:[d]});store.db.close();store.openDB();assert.equal((await ok('/documents/'+draft.id)).archived,true);assert.equal(store.get('SELECT COUNT(*) n FROM invoice_cancellations').n,1);
 });
 await t.test('encrypted recovery restores archive and cancellation records and balances',async()=>{
  const summary=(await ok('/documents?q=SANLAN')).summary,count=store.get('SELECT COUNT(*) n FROM invoice_cancellations').n;
  const backup=await ok('/backups','POST',{});await ok('/backups/test','POST',{file:backup.file});store.run('DELETE FROM document_archives');store.run('DELETE FROM invoice_cancellations');
  await ok('/backups/restore','POST',{file:backup.file,confirmation:'RESTORE '+backup.file,password:'test-password-12345'});await ok('/login','POST',{email:'manager@example.test',password:'test-password-12345'});
  assert.equal(store.get('SELECT COUNT(*) n FROM invoice_cancellations').n,count);assert.equal((await ok('/documents/'+draft.id)).archived,true);assert.deepEqual((await ok('/documents?q=SANLAN')).summary,summary);
 });

});
