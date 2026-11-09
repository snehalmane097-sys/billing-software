import {get,run,transaction,audit} from './db.mjs';
import {amount} from './money.mjs';
import {invoicePDF,combinePDFs} from './pdf.mjs';
import {logoForPDF} from './logo.mjs';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
const manager=u=>{if(u.role!=='manager')fail(403,'Manager access required');};
export function registerInvoiceActions(route,{scope,version,docView,printableDocument,recordPaymentEntry}){
 function selected(u,b,max=100){
  if(!Array.isArray(b.items)||!b.items.length||b.items.length>max)fail(400,`Select between 1 and ${max} invoices`);
  const ids=b.items.map(x=>x.id);if(new Set(ids).size!==ids.length)fail(400,'Duplicate invoice selection');
  return b.items.map(item=>{if(typeof item.id!=='string')fail(400,'Invalid invoice selection');const row=scope(u,get('SELECT * FROM documents WHERE id=?',item.id));if(row.kind!=='invoice')fail(400,'Select GST invoices only');return {row,item,document:docView(row)};});
 }
 route('POST','/api/invoices/selected.csv',({u,b,res})=>{
  manager(u);const records=selected(u,b),cell=v=>'"'+String(v??'').replace(/"/g,'""').replace(/^[=+@-]/,"'$&")+'"';
  const rows=[['Invoice number','Date','Customer','GSTIN','Contact','Document status','Payment status','Original amount INR','Invoice amount INR','Collected INR','Outstanding INR'],...records.map(({document:d})=>{const c=d.snapshot?.customer||JSON.parse(get('SELECT body FROM customers WHERE id=?',d.customer_id).body);return [d.number||'Draft',d.body.date,c.name,c.gstin,c.phone,d.status,d.paymentStatus,amount(d.body.total),amount(d.status==='issued'?d.body.total:0),amount(d.paid),amount(d.status==='issued'?d.balance:0)];})];
  audit(u,'invoices.selected-exported','',JSON.stringify(records.map(r=>r.row.id)));res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="selected-invoices.csv"');res.end('\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n'));
 });
 route('POST','/api/invoices/selected.pdf',async({u,b,res})=>{
  const records=selected(u,b,25),documents=records.map(({row})=>printableDocument(u,row.id)),buffers=[];
  for(const d of documents)buffers.push(await invoicePDF(d,logoForPDF(d.snapshot?.business.logoId)));
  const bytes=await combinePDFs(buffers);audit(u,'invoices.selected-printed','',JSON.stringify(records.map(r=>r.row.id)));res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition','inline; filename="selected-invoices.pdf"');res.end(bytes);
 });
 route('POST','/api/invoices/record-payments',({u,b})=>{
  if(u.role!=='manager'&&!u.payments)fail(403,'Payment recording is disabled for your account');
  if(typeof b.submissionId!=='string'||!/^[a-zA-Z0-9-]{10,80}$/.test(b.submissionId))fail(400,'Invalid payment submission ID');
  return transaction(()=>{
   const rows=selected(u,b,25);
   for(const {document:d,item}of rows){const prior=get('SELECT id FROM payments WHERE idempotency=?',b.submissionId+':'+d.id);if(!prior&&d.balance!==item.expectedBalance)fail(409,'An invoice balance changed. Reload the payment review.');}
   return {payments:rows.map(({document:d,item})=>recordPaymentEntry(u,{documentId:d.id,amount:item.amount,date:b.date,method:b.method,reference:b.reference,idempotency:b.submissionId+':'+d.id}))};
  });
 });
 route('POST','/api/invoices/archive',({u,b})=>{manager(u);return transaction(()=>{
  const rows=selected(u,b),restore=b.restore===true,reason=String(b.reason||'').trim();if(!reason||reason.length>1000)fail(400,'Enter an archive / restore reason (maximum 1000 characters)');
  for(const {row,item}of rows){version(row,item);if(row.status!=='draft')fail(409,'Only draft invoices may be archived. Issued financial records must be retained.');const a=get('SELECT document_id FROM document_archives WHERE document_id=?',row.id);if(restore?!a:!!a)fail(409,'The archive state changed. Reload the selection.');}
  for(const {row}of rows){if(restore)run('DELETE FROM document_archives WHERE document_id=?',row.id);else run('INSERT INTO document_archives VALUES(?,?,?,?)',row.id,new Date().toISOString(),u.name,reason);run('UPDATE documents SET version=version+1 WHERE id=?',row.id);audit(u,restore?'invoice.draft-restored':'invoice.draft-archived',row.id,reason);}return {count:rows.length};
 });});
 route('POST','/api/documents/([a-zA-Z0-9-]+)/cancel',({u,p,b})=>{manager(u);return transaction(()=>{
  const row=scope(u,get('SELECT * FROM documents WHERE id=?',p[1]));if(row.status==='cancelled')return docView(row);version(row,b);
  const d=docView(row);if(row.kind!=='invoice'||row.status!=='issued')fail(409,'Only an issued GST invoice can be cancelled');
  if(d.paid!==0)fail(409,'Resolve recorded payments before cancellation. Use the correction workflow.');
  if(d.body.date.slice(0,7)!==today().slice(0,7))fail(409,'Prior-period invoices require a reviewed correction / credit-note workflow');
  if(b.noSupply!==true||b.noExternalReporting!==true||b.managerReviewed!==true)fail(400,'Confirm that supply did not occur, no external reporting exists, and cancellation has been reviewed');
  if(d.body.irn||d.body.ewayBill||d.snapshot?.irn||d.snapshot?.ewayBill)fail(409,'External reporting requires the appropriate GST portal correction process');
  const reason=String(b.reason||'').trim();if(!reason||reason.length>1000)fail(400,'Enter a cancellation reason (maximum 1000 characters)');
  run('INSERT INTO invoice_cancellations VALUES(?,?,?,?,1,1)',row.id,new Date().toISOString(),u.name,reason);run("UPDATE documents SET status='cancelled',version=version+1 WHERE id=?",row.id);audit(u,'invoice.cancelled',row.id,reason);return docView(get('SELECT * FROM documents WHERE id=?',row.id));
 });});
}
