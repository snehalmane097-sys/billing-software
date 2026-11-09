import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {execFileSync} from 'node:child_process';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'billing-tests-'));
process.env.DATA_DIR=path.join(root,'records');process.env.BACKUP_DIR=path.join(root,'backup');process.env.BACKUP_KEY=crypto.randomBytes(32).toString('hex');

const {pythonPath}=await import('../server/pdf.mjs');
const poppler=path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin');
function pdfText(bytes){const file=path.join(root,'assert.pdf');fs.writeFileSync(file,bytes);return execFileSync(pythonPath(),['-X','utf8','-c',"import sys;from pypdf import PdfReader;print('\\n'.join(p.extract_text(extraction_mode='layout') for p in PdfReader(sys.argv[1]).pages))",file],{encoding:'utf8',windowsHide:true});}
const {server}=await import('../server/index.mjs');
const store=await import('../server/db.mjs');
// Exercise the actual HTTP request handler without opening sockets. The managed
// Windows execution environment denies loopback client connections.
const handler=server.listeners('request')[0];
const manager={cookie:'',csrf:''},staff={cookie:'',csrf:''};
async function request(url,method='GET',body,session=manager,key){
 const headers=new Map();let bytes;
 const req={url:'/api'+url,method,headers:{host:'localhost:3001','content-type':'application/json',cookie:session.cookie,'x-csrf-token':session.csrf,...(key?{'idempotency-key':key}:{})},socket:{remoteAddress:'127.0.0.1'},async *[Symbol.asyncIterator](){if(body!==undefined)yield Buffer.from(JSON.stringify(body));}};
 const res={statusCode:200,writableEnded:false,setHeader(k,v){headers.set(k.toLowerCase(),v);},end(b){bytes=Buffer.from(b||'');this.writableEnded=true;}};
 await handler(req,res);
 if(headers.get('set-cookie'))session.cookie=headers.get('set-cookie').split(';')[0];
 const binary=headers.get('content-type')==='application/pdf'||headers.get('content-type')?.startsWith('image/'),value=binary?bytes:JSON.parse(bytes.toString());if(value.csrf)session.csrf=value.csrf;
 return {status:res.statusCode,value};
}
const ok=async(...args)=>{const r=await request(...args);assert.equal(r.status,200,JSON.stringify(r.value));return r.value;};
test('connected financial workflows, permissions, persistence, PDFs and actual backup restore',async t=>{
 t.after(()=>{store.db.close();fs.rmSync(root,{recursive:true,force:true});});
 assert.equal((await ok('/session')).needsSetup,true);
 await ok('/setup','POST',{name:'Test Manager',email:'manager@example.test',password:'test-only-password-123'});
 await ok('/settings','PUT',{name:'Test business only',address:'Pune test address',state:'27',gstin:'27ABCDE1234F1Z5',confirmed:true,bankName:'Snapshot Bank',accountNumber:'TEST ACCOUNT',terms:'Payment due as agreed',signatoryName:'Test Manager'});
 const protection=await ok('/backups');assert.equal(protection.configured,true);assert.ok(protection.storageError,'Unavailable backup destination is reported without hiding status');
 const customer=await ok('/customers','POST',{name:'Test customer',address:'Test address',state:'27'});
 const service=await ok('/services','POST',{name:'Test consulting',sac:'998311',rate:'100.00',taxRate:'18'});
 const input={kind:'invoice',customerId:customer.id,date:'2026-01-10',dueDate:'2026-01-20',placeOfSupply:'27',pricing:'exclusive',lines:[{description:service.name,sac:service.sac,quantity:'2',rate:'100.00',discount:'0',taxRate:'18'}]};
 const draft=await ok('/documents','POST',input,manager,'create-one');
 const duplicate=await ok('/documents','POST',input,manager,'create-one');assert.equal(duplicate.id,draft.id);
 assert.equal((await request('/documents','POST',{...input,notes:'changed'},manager,'create-one')).status,409);
 assert.equal((await request('/documents/'+draft.id,'PUT',{...input,version:0})).status,409);
 const issue=()=>ok('/documents/'+draft.id+'/issue','POST',{version:draft.version});
 const issued=await Promise.all([issue(),issue()]);assert.equal(issued[0].number,issued[1].number);assert.equal(issued[0].body.total,23600);
 assert.equal((await request('/documents/'+draft.id,'PUT',{...input,version:issued[0].version})).status,409);
 await ok('/customers/'+customer.id,'PUT',{...customer,name:'Changed later',address:'New address',version:customer.version});
 const frozen=await ok('/documents/'+draft.id);assert.equal(frozen.snapshot.customer.name,'Test customer');assert.equal(frozen.snapshot.business.bankName,'Snapshot Bank');assert.equal(frozen.snapshot.document.terms,'Payment due as agreed');
 const payment={documentId:draft.id,amount:'100.00',date:'2026-01-10',method:'UPI',idempotency:'payment-one'};
 const receipt=await ok('/payments','POST',payment);assert.equal((await ok('/payments','POST',payment)).id,receipt.id);
 assert.equal((await request('/payments','POST',{...payment,amount:'101.00'})).status,409);
 assert.equal((await ok('/documents/'+draft.id)).paymentStatus,'Part paid');assert.equal((await ok('/documents/'+draft.id)).balance,13600);
 assert.equal((await request('/payments','POST',{...payment,amount:'200.00',idempotency:'overpayment'})).status,400);
 await ok('/users','POST',{name:'Test staff',email:'staff@example.test',password:'test-staff-password-123',payments:false});
 await ok('/login','POST',{email:'staff@example.test',password:'test-staff-password-123'},staff);
 for(const url of ['/users','/reports','/expenses','/audit','/backups','/export',`/documents/${draft.id}/pdf`,`/customers/${customer.id}/statement`])assert.equal((await request(url,'GET',undefined,staff)).status,403,url);
 assert.equal((await request('/payments','POST',payment,staff)).status,403);
 assert.equal((await request('/settings','PUT',{},staff)).status,403);
 assert.equal((await request('/customers','POST',{name:'Bad',state:'27'}, {...manager,csrf:'wrong'})).status,403);
 await ok('/payments/'+receipt.id+'/reverse','POST',{reason:'Recorded against wrong invoice'});await ok('/payments/'+receipt.id+'/reverse','POST',{reason:'repeat'});
 assert.equal((await ok('/documents/'+draft.id)).paymentStatus,'Unpaid');
 await ok('/payments','POST',{...payment,amount:'236.00',idempotency:'payment-full'});assert.equal((await ok('/documents/'+draft.id)).paymentStatus,'Paid');
 const second=await ok('/documents','POST',input);const secondIssued=await ok('/documents/'+second.id+'/issue','POST',{version:second.version});assert.notEqual(secondIssued.number,issued[0].number);
 const quote=await ok('/documents','POST',{...input,kind:'quote'});await ok('/documents/'+quote.id+'/issue','POST',{version:quote.version});
 const converted=await ok('/documents/'+quote.id+'/convert','POST',{});assert.equal((await ok('/documents/'+quote.id+'/convert','POST',{})).id,converted.id);
 const pdf=await request('/documents/'+draft.id+'/pdf');assert.equal(pdf.status,200);const text=pdfText(pdf.value);assert.match(pdf.value.toString('ascii',0,8),/%PDF-1.4/);assert.match(text,/Grand total\s+₹\s*236.00/);assert.match(text,/Test customer/);assert.doesNotMatch(text,/Changed later/);
 const statement=await ok('/customers/'+customer.id+'/statement');assert.equal(statement.balance,23600);
 // Close and reopen the real SQLite connection to verify persistence, not just API state.
 store.db.close();store.openDB();assert.equal((await ok('/documents/'+draft.id)).body.total,23600);
 // Save product details, then use them alongside an existing service in a bill.
 const productInput={itemType:'product',name:'Test printer cartridge',details:'Black cartridge, test model',sku:'INK-001',hsn:'8443',unit:'NOS',rate:'250.00',taxRate:'18'};
 assert.equal((await request('/services','POST',{...productInput,hsn:'12345'})).status,400);
 assert.equal((await request('/services','POST',productInput,staff)).status,403,'Staff cannot alter the shared catalogue');
 const product=await ok('/services','POST',productInput);
 assert.equal((await ok('/services')).find(r=>r.id===product.id).sku,'INK-001');
 const productLine={...product,description:product.name,quantity:'2',discount:'0'};
 const mixed=await ok('/documents','POST',{...input,lines:[productLine,...input.lines]});
 assert.equal(mixed.body.total,82600);assert.equal(mixed.body.lines[0].unit,'NOS');
 assert.equal(mixed.body.lines[0].hsn,'8443');assert.equal(mixed.body.lines[0].sac,'');
 assert.equal((await request('/documents/'+mixed.id,'PUT',{...input,version:mixed.version,lines:[{...productLine,itemType:'other'}]})).status,400);
 await ok('/documents/'+mixed.id+'/issue','POST',{version:mixed.version});
 await ok('/services/'+product.id,'PUT',{...productInput,name:'Changed product',rate:'999.00',version:product.version});
 const mixedFrozen=await ok('/documents/'+mixed.id);
 assert.equal(mixedFrozen.snapshot.document.lines[0].description,productInput.name);
 assert.equal(mixedFrozen.snapshot.document.lines[0].rate,'250.00');
 const productPDF=pdfText((await request('/documents/'+mixed.id+'/pdf')).value);
 assert.match(productPDF,/8443/);assert.match(productPDF,/2\s+NOS/);assert.match(productPDF,/Item code: INK-001/);assert.match(productPDF,/Black cartridge/);assert.match(productPDF,/Grand total\s+₹\s*826.00/);
 store.db.close();store.openDB();assert.equal((await ok('/services')).find(r=>r.id===product.id).hsn,'8443');
 const backup=await ok('/backups','POST',{});assert.ok(fs.existsSync(path.join(process.env.BACKUP_DIR,backup.file)));
 const test=await ok('/backups/test','POST',{file:backup.file});assert.equal(test.counts.documents,5);
 await ok('/expenses','POST',{description:'After backup only',category:'Test',date:'2026-01-10',amount:'10.00'});
 await ok('/backups/restore','POST',{file:backup.file,confirmation:'RESTORE '+backup.file,password:'test-only-password-123'});
 assert.equal((await request('/expenses')).status,401,'restore invalidates sessions');
 await ok('/login','POST',{email:'manager@example.test',password:'test-only-password-123'});
 assert.equal((await ok('/expenses')).length,0,'restored state excludes post-backup expense');
 assert.equal((await ok('/documents/'+draft.id)).balance,0);
 assert.ok((await ok('/audit')).some(r=>r.action==='backup.restored'));
 const safety=fs.readdirSync(process.env.BACKUP_DIR).find(f=>f.includes('pre-restore'));assert.ok(safety);
 const savedKey=process.env.BACKUP_KEY; // Authenticated encryption corruption is also rejected.
 const file=path.join(process.env.BACKUP_DIR,backup.file),bytes=fs.readFileSync(file);bytes[bytes.length-1]^=1;fs.writeFileSync(file,bytes);
 assert.equal((await request('/backups/test','POST',{file:backup.file})).status,400);
 assert.ok(savedKey);
 // HSN is optional for products throughout catalogue, draft and issuing.
 const noHSN=await ok('/services','POST',{...productInput,name:'Product without HSN',hsn:''});
 const optionalDraft=await ok('/documents','POST',{...input,lines:[{...noHSN,description:noHSN.name,quantity:'2',discount:'0'}]});
 const optionalIssued=await ok('/documents/'+optionalDraft.id+'/issue','POST',{version:optionalDraft.version});
 assert.equal(optionalIssued.snapshot.document.lines[0].hsn,'');
 assert.equal(optionalIssued.body.total,59000);
 await ok('/login','POST',{email:'staff@example.test',password:'test-staff-password-123'},staff);
 const basicProduct=await ok('/services','POST',{itemType:'product',name:'Shell Pipe Ring',unit:'NOS',rate:'102'});
 assert.equal(basicProduct.hsn,'');assert.equal(basicProduct.sac,'');assert.equal(basicProduct.taxRate,'');
 const basicService=await ok('/services','POST',{itemType:'service',name:'Installation',unit:'hour',rate:'500'});
 assert.equal(basicService.sac,'');assert.equal(basicService.taxRate,'');
 for(const r of [basicProduct,basicService]){
  const edited=await ok('/services/'+r.id,'PUT',{...r,rate:r.itemType==='product'?'103':'510',category:'Test category'});
  assert.equal((await ok('/services')).find(v=>v.id===r.id).category,'Test category');
  const d=await ok('/documents','POST',{...input,lines:[{...edited,description:edited.name,quantity:'1',discount:'0'}]});
  assert.equal((await request('/documents/'+d.id+'/issue','POST',{version:d.version})).status,400,'Unset GST is distinct from a zero rate on issued invoices');
  const updated=await ok('/documents/'+d.id,'PUT',{...d.body,version:d.version,lines:d.body.lines.map(l=>({...l,taxRate:'0'}))});
  await ok('/documents/'+d.id+'/issue','POST',{version:updated.version});
 }
 const optional=await ok('/services/'+basicProduct.id,'PUT',{...basicProduct,version:2,brand:'Example brand',category:'Rings',purchasePrice:'80.25',openingStock:'10.5',minimumStock:'2'});
 assert.equal(optional.purchasePrice,'80.25');assert.equal(optional.openingStock,'10.5');
 assert.equal((await ok('/services','GET',undefined,staff)).find(r=>r.id===basicProduct.id).purchasePrice,undefined,'Staff cannot see purchase costs');
 assert.equal((await request('/services','POST',{itemType:'product',name:'Missing rate',unit:'NOS'})).status,400);
 assert.equal((await request('/services','POST',{itemType:'product',name:'Empty unit',unit:'',rate:'102'})).status,400);

 // Every accepted format is decoded and persisted byte-for-byte. Actual PDF
 // rasterization checks visible image pixels and aspect ratio, not just tags.
 const evidence=path.resolve('tmp/logo-qa');fs.mkdirSync(evidence,{recursive:true});
 async function raster(pdf,name,colour){
  const file=path.join(evidence,name+'.pdf'),prefix=path.join(evidence,name);fs.writeFileSync(file,pdf);
  execFileSync(process.env.PDFTOPPM||path.join(poppler,'pdftoppm.exe'),['-r','72','-f','1','-singlefile','-png',file,prefix],{timeout:20000,windowsHide:true});
  const {data,info}=await sharp(prefix+'.png').removeAlpha().raw().toBuffer({resolveWithObject:true});
  let minX=Infinity,minY=Infinity,maxX=-1,maxY=-1;
  for(let y=0;y<Math.min(info.height,200);y++)for(let x=0;x<Math.min(info.width,300);x++){
   const i=(y*info.width+x)*3,[r,g,b]=data.subarray(i,i+3);
   if(colour==='red'?r>180&&g<100&&b<100:b>150&&r<100&&g<100){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  }
  assert.ok(maxX>minX&&maxY>minY,'Logo must be visible in rendered pixels');return (maxX-minX+1)/(maxY-minY+1);
 }
 let brandedInvoice,brandedQuote,brandedProforma,pngId;
 for(const [format,mime]of [['png','image/png'],['jpeg','image/jpeg'],['webp','image/webp']]){
  const image=await sharp({create:{width:800,height:200,channels:4,background:{r:220,g:30,b:40,alpha:1}}}).toFormat(format).toBuffer();
  const current=await ok('/branding');
  const logo=await ok('/branding/logo','POST',{mime,data:image.toString('base64'),version:current.version});
  assert.deepEqual(await ok('/logos/'+logo.logoId),image);
  assert.deepEqual(await ok('/logos/'+logo.logoId,'GET',undefined,staff),image);
  store.db.close();store.openDB();assert.equal((await ok('/branding')).logoId,logo.logoId);
  assert.equal((await ok('/session')).branding.logoId,logo.logoId);
  for(const kind of ['invoice','quote','proforma']){
   const d=await ok('/documents','POST',{...input,kind});const issued=await ok('/documents/'+d.id+'/issue','POST',{version:d.version});
   assert.equal(issued.snapshot.business.logoId,logo.logoId);
   const pdf=(await request('/documents/'+d.id+'/pdf')).value;
   assert.ok(Math.abs(await raster(pdf,format+'-'+kind,'red')-4)<.2,'Wide logo must keep its 4:1 aspect ratio');
   if(kind==='proforma'){assert.match(pdfText(pdf),/PROFORMA INVOICE/);assert.equal((await request('/payments','POST',{...payment,documentId:d.id,idempotency:'proforma-'+format})).status,400);}
   if(format==='png'){pngId=logo.logoId;if(kind==='invoice')brandedInvoice=issued;if(kind==='quote')brandedQuote=issued;if(kind==='proforma')brandedProforma=issued;}
  }
 }
 const currentBrand=await ok('/branding');
 const mismatch=await sharp({create:{width:20,height:20,channels:3,background:'red'}}).png().toBuffer();
 assert.equal((await request('/branding/logo','POST',{mime:'image/jpeg',data:mismatch.toString('base64'),version:currentBrand.version})).status,400);
 assert.equal((await request('/branding/logo','POST',{mime:'image/svg+xml',data:'PHN2Zz4=',version:currentBrand.version})).status,400);
 assert.equal((await request('/branding/logo','POST',{mime:'image/png',data:Buffer.from('not an image').toString('base64'),version:currentBrand.version})).status,400);
 assert.equal((await request('/branding/logo','POST',{mime:'image/png',data:Buffer.alloc(2*1024*1024+1).toString('base64'),version:currentBrand.version})).status,400);
 assert.equal((await request('/branding/logo','POST',{},staff)).status,403);
 assert.equal((await request('/branding/logo','DELETE',{version:currentBrand.version},staff)).status,403);
 const blue=await sharp({create:{width:300,height:300,channels:4,background:{r:20,g:40,b:220,alpha:1}}}).png().toBuffer();
 const replaced=await ok('/branding/logo','POST',{mime:'image/png',data:blue.toString('base64'),version:currentBrand.version});
 assert.notEqual(replaced.logoId,currentBrand.logoId);
 assert.equal((await request('/branding/logo','DELETE',{version:currentBrand.version})).status,409,'Stale edits cannot remove a newer logo');
 await ok('/settings','PUT',{...(await ok('/settings')),phone:'12345',bankName:'Replacement Bank'});assert.equal((await ok('/settings')).logoId,replaced.logoId,'Business save preserves logo');
 assert.equal((await ok('/documents/'+draft.id)).snapshot.business.bankName,'Snapshot Bank');
 const shipping={name:'Test shipping destination',address:'Warehouse test address',state:'29',phone:'12345'};
 const newDraft=await ok('/documents','POST',{...input,shipping,terms:'Custom test terms'});assert.equal(newDraft.body.shipping.name,shipping.name);assert.equal(newDraft.body.terms,'Custom test terms');await ok('/documents/'+newDraft.id+'/issue','POST',{version:newDraft.version});
 assert.ok(Math.abs(await raster((await request('/documents/'+newDraft.id+'/pdf')).value,'replacement-invoice','blue')-1)<.01);
 const protectedBackup=await ok('/backups','POST',{});
 await ok('/branding/logo','DELETE',{version:replaced.version});store.db.close();store.openDB();assert.equal((await ok('/branding')).logoId,null);
 for(const d of [brandedInvoice,brandedQuote,brandedProforma]){
  assert.equal((await ok('/documents/'+d.id)).snapshot.business.logoId,pngId);
  await raster((await request('/documents/'+d.id+'/pdf')).value,'historical-'+d.kind,'red');
 }
 const noLogo=await ok('/documents','POST',input);
 assert.match(pdfText((await request('/documents/'+noLogo.id+'/pdf')).value),/Test business/,'No-logo fallback keeps business identity');
 await ok('/backups/restore','POST',{file:protectedBackup.file,confirmation:'RESTORE '+protectedBackup.file,password:'test-only-password-123'});
 await ok('/login','POST',{email:'manager@example.test',password:'test-only-password-123'});
 assert.equal((await ok('/branding')).logoId,replaced.logoId);assert.deepEqual(await ok('/logos/'+replaced.logoId),blue,'Restore includes the logo bytes');
});
