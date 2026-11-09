import {all,get,run,transaction,audit} from './db.mjs';
import {amount} from './money.mjs';
const reject=(status,message)=>{throw Object.assign(new Error(message),{status});};
const manager=u=>{if(u.role!=='manager')reject(403,'Manager access required');};
const currentDay=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
const iso=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)reject(400,'Enter a valid date');return value;};
function paging(params){const page=Number(params.get('page')||1),size=Number(params.get('pageSize')||10);if(!Number.isInteger(page)||page<1||page>100000||![10,25,50].includes(size))reject(400,'Invalid page');return {page,pageSize:size,offset:(page-1)*size};}
function range(params){const from=params.get('from')?iso(params.get('from')):'0001-01-01',to=params.get('to')?iso(params.get('to')):'9999-12-31';if(from>to)reject(400,'Start date must not follow end date');return {from,to};}
const paidSQL='COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.document_id=d.id AND p.reversed_at IS NULL),0)';
const totalSQL="json_extract(d.body,'$.total')",dateSQL="json_extract(d.body,'$.date')",dueSQL="json_extract(d.body,'$.dueDate')";
const base=`SELECT d.*,${paidSQL} allocated,COALESCE(json_extract(d.snapshot,'$.customer.name'),json_extract(c.body,'$.name')) customerName,COALESCE(json_extract(d.snapshot,'$.customer.phone'),json_extract(c.body,'$.phone')) customerPhone FROM documents d JOIN customers c ON c.id=d.customer_id`;
export function documentQuery(u,params,customerId=null){
 const kind=params.get('kind')||'invoice';if(!['invoice','quote','proforma'].includes(kind))reject(400,'Invalid document type');
 const {from,to}=range(params),pagingData=paging(params),args=[kind,from,to],where=['d.kind=?',`${dateSQL}>=?`,`${dateSQL}<=?`];
 if(u.role!=='manager'){where.push('d.created_by=?');args.push(u.id);}
 if(customerId){where.push('d.customer_id=?');args.push(customerId);}
 const q=(params.get('q')||'').trim().slice(0,250).toLowerCase();
 if(q){where.push(`instr(lower(COALESCE(d.number,'Draft')||' '||COALESCE(json_extract(d.snapshot,'$.customer.name'),'')||' '||COALESCE(json_extract(c.body,'$.name'),'')||' '||COALESCE(json_extract(c.body,'$.gstin'),'')||' '||COALESCE(json_extract(d.snapshot,'$.customer.gstin'),'')),?)>0`);args.push(q);}
 const archive=params.get('archive')||'active';if(!['active','archived','all'].includes(archive))reject(400,'Invalid archive filter');if(archive!=='all')where.push((archive==='active'?'NOT ':'')+'EXISTS (SELECT 1 FROM document_archives a WHERE a.document_id=d.id)');
 const filter=params.get('filter')||'all',status=params.get('status')||'all',payment=params.get('payment')||'all';
 if(!['all','draft','issued','outstanding','overdue','paid','unpaid','partial','converted','unconverted'].includes(filter)||!['all','draft','issued','cancelled','account'].includes(status)||!['all','paid','unpaid','partial'].includes(payment))reject(400,'Invalid document filter');
 for(const flag of [filter,status,payment]){
  if(flag==='account')where.push("d.status IN ('issued','cancelled')");
  if(flag==='draft'||flag==='issued'||flag==='cancelled'){where.push('d.status=?');args.push(flag);}
  if(['outstanding','overdue','paid','unpaid','partial'].includes(flag)){
   if(kind!=='invoice')reject(400,'Payment filters apply to GST invoices');
   where.push("d.status='issued'");
   if(flag==='paid')where.push(`${paidSQL}>=${totalSQL}`);
   if(flag==='unpaid')where.push(`${paidSQL}=0 AND ${totalSQL}>0`);
   if(flag==='partial')where.push(`${paidSQL}>0 AND ${paidSQL}<${totalSQL}`);
   if(flag==='outstanding'||flag==='overdue')where.push(`${paidSQL}<${totalSQL}`);
   if(flag==='overdue'){where.push(`${dueSQL}<?`);args.push(currentDay());}
  }
  if(flag==='converted')where.push('d.converted_id IS NOT NULL');
  if(flag==='unconverted')where.push("d.converted_id IS NULL AND d.status='issued'");
 }
 const sort={date:dateSQL,dueDate:dueSQL,amount:totalSQL,balance:`CASE WHEN d.status='issued' THEN (${totalSQL}-${paidSQL}) ELSE 0 END`,number:'d.number',customer:"COALESCE(json_extract(d.snapshot,'$.customer.name'),json_extract(c.body,'$.name'))"}[params.get('sort')||'date'];if(!sort)reject(400,'Invalid sort');
 const direction=params.get('direction')==='asc'?'ASC':'DESC',condition=where.join(' AND ');
 return {kind,args,condition,sort,direction,...pagingData};
}
export function listDocuments(u,params,view,customerId=null){
 const q=documentQuery(u,params,customerId),{args,condition,sort,direction}=q;
 const stats=get(`SELECT COUNT(*) records,COALESCE(SUM(CASE WHEN d.kind='invoice' AND d.status='issued' THEN ${totalSQL} ELSE 0 END),0) invoiceAmount,
 COALESCE(SUM(CASE WHEN d.kind='invoice' AND d.status='issued' THEN ${paidSQL} ELSE 0 END),0) collected,
 COALESCE(SUM(CASE WHEN d.kind='invoice' AND d.status='issued' THEN ${totalSQL}-${paidSQL} ELSE 0 END),0) outstanding,
 SUM(CASE WHEN d.kind='invoice' AND d.status='issued' AND ${paidSQL}>=${totalSQL} THEN 1 ELSE 0 END) paidCount,
 SUM(CASE WHEN d.kind='invoice' AND d.status='issued' AND ${paidSQL}=0 AND ${totalSQL}>0 THEN 1 ELSE 0 END) unpaidCount,
 SUM(CASE WHEN d.kind='invoice' AND d.status='issued' AND ${paidSQL}>0 AND ${paidSQL}<${totalSQL} THEN 1 ELSE 0 END) partialCount,
 SUM(CASE WHEN d.kind='invoice' AND d.status='issued' AND ${paidSQL}<${totalSQL} AND ${dueSQL}<? THEN 1 ELSE 0 END) overdueCount,
 SUM(CASE WHEN d.status='draft' THEN 1 ELSE 0 END) draftCount,SUM(CASE WHEN d.status='cancelled' THEN 1 ELSE 0 END) cancelledCount
 FROM documents d JOIN customers c ON c.id=d.customer_id WHERE ${condition}`,currentDay(),...args);
 const summary=Object.fromEntries(Object.entries(stats).map(([k,v])=>[k,v??0]));
 const items=all(`${base} WHERE ${condition} ORDER BY ${sort} ${direction},d.rowid DESC LIMIT ? OFFSET ?`,...args,q.pageSize,q.offset).map(r=>({...view(r),customerName:r.customerName,customerPhone:r.customerPhone||''}));
 return {page:q.page,pageSize:q.pageSize,offset:q.offset,items,total:summary.records,summary};
}

function company(id){const row=get('SELECT * FROM customers WHERE id=?',id);if(!row)reject(404,'Company not found');return {...JSON.parse(row.body),id:row.id,version:row.version,archived:!!row.archived};}
function metrics(id){return get(`SELECT COALESCE(SUM(${totalSQL}),0) billed,COALESCE(SUM(${paidSQL}),0) received,COALESCE(SUM(${totalSQL}-${paidSQL}),0) outstanding,COALESCE(SUM(CASE WHEN ${dueSQL}<? AND ${totalSQL}>${paidSQL} THEN ${totalSQL}-${paidSQL} ELSE 0 END),0) overdue,COUNT(*) invoiceCount FROM documents d WHERE customer_id=? AND kind='invoice' AND status='issued'`,currentDay(),id);}
export function ledgerFor(id,params){
 const customer=company(id),{from,to}=range(params),events=[];
 const docs=all("SELECT * FROM documents WHERE customer_id=? AND kind='invoice' AND status IN ('issued','cancelled')",id);
 const byId=new Map(docs.map(d=>[d.id,d]));
 for(const d of docs)if(d.status==='cancelled'){const c=get('SELECT * FROM invoice_cancellations WHERE document_id=?',d.id);if(c)events.push({id:d.id+'-cancel',date:new Date(c.at).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}),type:'Invoice cancellation',number:d.number,debit:0,credit:JSON.parse(d.body).total,detail:c.reason});}
 for(const d of docs)events.push({id:d.id,date:JSON.parse(d.body).date,type:'Invoice',number:d.number,debit:JSON.parse(d.body).total,credit:0,detail:''});
 for(const p of all('SELECT * FROM payments WHERE customer_id=?',id)){
  if(!byId.has(p.document_id))continue;
  events.push({id:p.id,date:p.date,type:'Payment',number:byId.get(p.document_id).number,debit:0,credit:p.amount,detail:[p.method,p.reference].filter(Boolean).join(' · '),reversed:!!p.reversed_at});
  if(p.reversed_at)events.push({id:p.id+'-reverse',date:new Date(p.reversed_at).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}),type:'Payment reversal',number:byId.get(p.document_id).number,debit:p.amount,credit:0,detail:p.reason});
 }
 events.sort((a,b)=>a.date.localeCompare(b.date)||({Invoice:0,Payment:1,'Payment reversal':2,'Invoice cancellation':3}[a.type]-{Invoice:0,Payment:1,'Payment reversal':2,'Invoice cancellation':3}[b.type])||a.id.localeCompare(b.id));
 const opening=events.filter(e=>e.date<from).reduce((s,e)=>s+e.debit-e.credit,0);let running=opening;
 const entries=events.filter(e=>e.date>=from&&e.date<=to).map(e=>({...e,balance:running+=e.debit-e.credit}));
 return {customer,from,to,opening,closing:running,entries};
}
function recordAudit(record){return all('SELECT * FROM audit WHERE record=? ORDER BY id DESC',record);}
export function registerManagement(route,{scope,version,docView}){
 route('GET','/api/catalogue',({u,url})=>{
  const type=url.searchParams.get('type')||'product',status=url.searchParams.get('status')||'active',q=(url.searchParams.get('q')||'').trim().toLowerCase().slice(0,250),p=paging(url.searchParams);
  if(!['product','service'].includes(type)||!['active','inactive','all'].includes(status))reject(400,'Invalid catalogue filter');if(u.role!=='manager'&&status!=='active')reject(403,'Manager access required');
  const where=["COALESCE(json_extract(body,'$.itemType'),'service')=?"],args=[type];if(status!=='all'){where.push('archived=?');args.push(status==='inactive'?1:0);}
  if(q){where.push("instr(lower("+['name','sku','hsn','sac','brand','category','details'].map(k=>"COALESCE(json_extract(body,'$."+k+"'),'')").join("||' '||")+"),?)>0");args.push(q);}
  const sort={name:"lower(json_extract(body,'$.name'))",rate:"CAST(json_extract(body,'$.rate') AS REAL)",category:"lower(COALESCE(json_extract(body,'$.category'),''))"}[url.searchParams.get('sort')||'name'];if(!sort)reject(400,'Invalid sort');
  const condition=where.join(' AND '),direction=url.searchParams.get('direction')==='desc'?'DESC':'ASC',total=get(`SELECT COUNT(*) n FROM services WHERE ${condition}`,...args).n;
  const items=all(`SELECT * FROM services WHERE ${condition} ORDER BY ${sort} ${direction},id LIMIT ? OFFSET ?`,...args,p.pageSize,p.offset).map(r=>({...JSON.parse(r.body),...(u.role!=='manager'?{purchasePrice:undefined}:{}),id:r.id,version:r.version,active:!r.archived}));return {...p,total,items};
 });
 route('GET','/api/catalogue/([a-zA-Z0-9-]+)',({u,p})=>{const r=get('SELECT * FROM services WHERE id=?',p[1]);if(!r)reject(404,'Item not found');if(r.archived&&u.role!=='manager')reject(403,'Manager access required');return {...JSON.parse(r.body),...(u.role!=='manager'?{purchasePrice:undefined}:{}),id:r.id,version:r.version,active:!r.archived,history:u.role==='manager'?recordAudit(r.id):[]};});
 route('POST','/api/services/([a-zA-Z0-9-]+)/activation',({u,p,b})=>{manager(u);return transaction(()=>{const r=get('SELECT * FROM services WHERE id=?',p[1]);if(!r)reject(404,'Item not found');version(r,b);if(typeof b.active!=='boolean')reject(400,'Choose active or inactive');run('UPDATE services SET archived=?,version=version+1 WHERE id=?',b.active?0:1,r.id);audit(u,b.active?'services.activated':'services.deactivated',r.id);return {ok:true};});});
 route('GET','/api/documents/([a-zA-Z0-9-]+)/history',({u,p})=>{scope(u,get('SELECT * FROM documents WHERE id=?',p[1]));return all(`SELECT * FROM audit WHERE record=? OR record IN (SELECT id FROM payments WHERE document_id=?) OR record IN (SELECT id FROM corrections WHERE document_id=?) ORDER BY id DESC`,p[1],p[1],p[1]);});
 route('GET','/api/accounts',({u,url})=>{
  manager(u);const q=(url.searchParams.get('q')||'').toLowerCase().slice(0,250),p=paging(url.searchParams),condition="instr(lower(COALESCE(json_extract(body,'$.name'),'')||' '||COALESCE(json_extract(body,'$.gstin'),'')||' '||COALESCE(json_extract(body,'$.contactName'),'')),?)>0";
  const total=get(`SELECT COUNT(*) n FROM customers WHERE ${condition}`,q).n;
  const items=all(`SELECT * FROM customers WHERE ${condition} ORDER BY lower(json_extract(body,'$.name')),id LIMIT ? OFFSET ?`,q,p.pageSize,p.offset).map(r=>({...JSON.parse(r.body),id:r.id,archived:!!r.archived,...metrics(r.id)}));return {...p,total,items};
 });
 route('GET','/api/accounts/([a-zA-Z0-9-]+)',({u,p,url})=>{manager(u);const customer=company(p[1]),params=new URLSearchParams(url.searchParams);params.set('kind','invoice');params.set('status','account');return {customer,summary:metrics(p[1]),invoices:listDocuments(u,params,docView,p[1]),payments:all("SELECT p.*,d.number FROM payments p JOIN documents d ON p.document_id=d.id WHERE p.customer_id=? AND d.kind='invoice' AND d.status='issued' ORDER BY p.date DESC,p.rowid DESC",p[1])};});
 route('GET','/api/accounts/([a-zA-Z0-9-]+)/ledger',({u,p,url})=>{manager(u);return ledgerFor(p[1],url.searchParams);});
 route('GET','/api/accounts/([a-zA-Z0-9-]+)/statement.csv',({u,p,url,res})=>{
  manager(u);const l=ledgerFor(p[1],url.searchParams),cell=v=>'"'+String(v??'').replace(/"/g,'""').replace(/^[=+@-]/,"'$&")+'"';
  const rows=[['Customer',l.customer.name],['GSTIN',l.customer.gstin||''],['Billing address',l.customer.address||''],['Contact',[l.customer.contactName,l.customer.phone,l.customer.email].filter(Boolean).join(' · ')],['State',l.customer.state],['Date range',l.from,l.to],['Date','Type','Invoice','Reference / reason','Debit INR','Credit INR','Balance INR'],['','Opening balance','','','','',amount(l.opening)],...l.entries.map(e=>[e.date,e.type,e.number,e.detail,amount(e.debit),amount(e.credit),amount(e.balance)]),['','Closing balance','','','','',amount(l.closing)]];
  audit(u,'customer.statement-exported',p[1]);res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="customer-statement.csv"');res.end('\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n'));
 });
}
