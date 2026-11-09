import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { db, get, all, run, transaction, settings, audit } from './db.mjs';
import { calculate, minor, amount, fixed } from './money.mjs';
import { itemMetadata } from './catalogue.mjs';
import { branding, saveLogo, removeLogo, logoForPDF } from './logo.mjs';
import { invoicePDF } from './pdf.mjs';
import {registerInvoiceActions} from './invoice-actions.mjs';
import {listDocuments,registerManagement} from './management.mjs';
import { backupStatus, createBackup, testRestore, restoreBackup, scheduleBackups } from './backup.mjs';
const scrypt = promisify(crypto.scrypt), id = () => crypto.randomUUID(), token = () => crypto.randomBytes(32).toString('hex');
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const fail = (code, message) => { const e = new Error(message); e.status = code; throw e; };
function text(v, label, max = 250) { if (typeof v !== 'string' || !v.trim() || v.length > max)
    fail(400, `${label} is required (maximum ${max} characters)`); return v.trim(); }
function date(v) { if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || new Date(v).toISOString().slice(0, 10) !== v)
    fail(400, 'Enter a valid date'); return v; }
function state(v) { if (!/^\d{2}$/.test(v) || !['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '97'].includes(v))
    fail(400, 'Enter a valid two-digit Indian state code'); return v; }
function gstin(v, s) { if (v && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v))
    fail(400, 'GSTIN format is invalid'); if (v && v.slice(0, 2) !== s)
    fail(400, 'GSTIN and state code differ'); return v || ''; }
async function hashPassword(p) { if (typeof p !== 'string' || p.length < 12 || p.length > 128)
    fail(400, 'Use a password of 12–128 characters'); const salt = token(); return salt + ':' + (await scrypt(p, salt, 64)).toString('hex'); }
async function passwordOK(p, hash) { if (typeof p !== 'string' || p.length > 128)
    return false; const [salt, hex] = hash.split(':'); const actual = await scrypt(p, salt, 64); return crypto.timingSafeEqual(actual, Buffer.from(hex, 'hex')); }
const publicUser = u => ({ id: u.id, name: u.name, email: u.email, role: u.role, payments: !!u.payments });
const manager = u => { if (u.role !== 'manager')
    fail(403, 'Manager access required'); };
function scope(u, row) { if (!row)
    fail(404, 'Record not found'); if (u.role !== 'manager' && row.created_by !== u.id)
    fail(403, 'This record belongs to another user'); return row; }
function docView(row){
 if(!row)return null;const body=JSON.parse(row.body),snapshot=row.snapshot?JSON.parse(row.snapshot):null,paid=row.allocated??get('SELECT COALESCE(SUM(amount),0) n FROM payments WHERE document_id=? AND reversed_at IS NULL',row.id).n;
 const cancellation=row.status==='cancelled'?get('SELECT * FROM invoice_cancellations WHERE document_id=?',row.id):null,archived=!!get('SELECT document_id FROM document_archives WHERE document_id=?',row.id);
 return {...row,body,snapshot,paid,balance:row.status==='cancelled'?0:body.total-paid,paymentStatus:row.status==='cancelled'?'Cancelled':paid>=body.total?'Paid':paid===0?'Unpaid':'Part paid',overdue:row.kind==='invoice'&&row.status==='issued'&&body.dueDate<today()&&body.total>paid,cancellation,archived};
}
function validateDoc(b, u) { const business = settings(); if (!business)
    fail(400, 'Configure business settings first'); const customer = scope(u, get('SELECT * FROM customers WHERE id=? AND archived=0', b.customerId)); const d = { customerId: customer.id, date: date(b.date), dueDate: date(b.dueDate), placeOfSupply: state(b.placeOfSupply), pricing: b.pricing, rounding: !!b.rounding, notes: String(b.notes || '').slice(0, 2000), terms: b.terms == null ? business.terms || '' : String(b.terms).slice(0,4000), shipping: b.shipping ? {name:text(b.shipping.name,'Shipping name'),address:text(b.shipping.address,'Shipping address',1000),phone:String(b.shipping.phone||'').slice(0,30),gstin:gstin(String(b.shipping.gstin||'').toUpperCase(),state(b.shipping.state)),state:state(b.shipping.state)} : null }; if (d.dueDate < d.date)
    fail(400, 'Due date must not precede document date'); return { ...d, ...calculate({ ...b, ...d }, business.state) }; }
function version(row, b) { if (row.version !== b.version)
    fail(409, 'This record changed in another session. Reload before saving.'); }
const routes = [];
const route = (method, pattern, fn) => routes.push({ method, pattern: new RegExp('^' + pattern + '$'), fn });
const attempts = new Map();
async function session(res, u) { const raw = token(), csrf = token(); run('INSERT INTO sessions VALUES(?,?,?,?)', crypto.createHash('sha256').update(raw).digest('hex'), u.id, Date.now() + 8 * 3600000, csrf); res.setHeader('Set-Cookie', `billing_session=${raw}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.COOKIE_SECURE === '1' ? '; Secure' : ''}`); return { user: publicUser(u), csrf }; }
route('GET', '/api/session', ({ u, s }) => ({ user: u ? publicUser(u) : null, csrf: s?.csrf, needsSetup: !get('SELECT id FROM users LIMIT 1'), business: u ? settings() : null, branding: u ? branding() : null }));
route('POST', '/api/setup', async ({ b, res }) => {
    if (get('SELECT id FROM users LIMIT 1'))
        fail(409, 'Setup already completed');
    const name = text(b.name, 'Name'), email = text(b.email, 'Email').toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        fail(400, 'Enter a valid email');
    const password = await hashPassword(b.password);
    const u = transaction(() => { if (get('SELECT id FROM users LIMIT 1'))
        fail(409, 'Setup already completed'); const u = { id: id(), name, email, password, role: 'manager', payments: 1 }; run('INSERT INTO users(id,name,email,password,role,payments) VALUES(?,?,?,?,?,?)', u.id, name, email, password, 'manager', 1); audit(u, 'setup.completed'); return u; });
    return session(res, u);
});
route('POST', '/api/login', async ({ b, res, req }) => { const key = req.socket.remoteAddress; const limit = attempts.get(key) || { n: 0, at: Date.now() }; if (Date.now() - limit.at > 900000) {
    limit.n = 0;
    limit.at = Date.now();
} if (++limit.n > 12)
    fail(429, 'Too many attempts. Try again in 15 minutes'); attempts.set(key, limit); const u = get('SELECT * FROM users WHERE email=? AND active=1', String(b.email || '').toLowerCase()); if (!u || !await passwordOK(b.password, u.password))
    fail(401, 'Email or password is incorrect'); attempts.delete(key); audit(u, 'session.login'); return session(res, u); });
route('POST', '/api/logout', ({ s, res }) => { run('DELETE FROM sessions WHERE token=?', s.token); res.setHeader('Set-Cookie', 'billing_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); return { ok: true }; });
route('GET', '/api/settings', () => settings());
route('GET', '/api/branding', () => branding());
route('POST', '/api/branding/logo', async ({b,u}) => {manager(u);return saveLogo(b,u);});
route('DELETE', '/api/branding/logo', ({b,u}) => {manager(u);return removeLogo(b.version,u);});
route('GET', '/api/logos/([a-f0-9]{64})', ({u,p,res}) => {
    if(u.role!=='manager' && branding().logoId!==p[1] && !get("SELECT id FROM documents WHERE created_by=? AND json_extract(snapshot,'$.business.logoId')=? LIMIT 1",u.id,p[1]))fail(403,'Logo is not available to this account');
    const logo=logoForPDF(p[1]);if(!logo)fail(404,'Logo not found');res.setHeader('Content-Type',logo.mime);res.end(Buffer.from(logo.original));
});
route('PUT', '/api/settings', ({ b, u }) => { manager(u); return transaction(() => { const old = settings(); if (old)
    version(old, b); const st = state(b.state), v = { name: text(b.name, 'Business name'), address: text(b.address, 'Address', 1000), gstin: gstin(String(b.gstin || '').toUpperCase(), st), state: st, email: String(b.email || '').slice(0, 150), phone: String(b.phone || '').slice(0, 30), confirmed: !!b.confirmed, ...Object.fromEntries(['bankName','accountName','accountNumber','ifsc','upi','signatoryName','terms'].map(k=>[k,String(b[k]||'').trim().slice(0,k==='terms'?4000:150)])) }; run('INSERT INTO settings VALUES(1,?,1) ON CONFLICT(id) DO UPDATE SET body=excluded.body,version=version+1', JSON.stringify(v)); audit(u, 'settings.updated'); return settings(); }); });
route('GET', '/api/users', ({ u }) => { manager(u); return all('SELECT id,name,email,role,payments,active FROM users'); });
route('POST', '/api/users', async ({ b, u }) => { manager(u); const name = text(b.name, 'Name'), email = text(b.email, 'Email').toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    fail(400, 'Enter a valid email'); const password = await hashPassword(b.password); return transaction(() => { if (get("SELECT COUNT(*) n FROM users WHERE role='staff' AND active=1").n >= 2)
    fail(400, 'The initial workspace supports two active staff accounts'); const uid = id(); run('INSERT INTO users(id,name,email,password,role,payments) VALUES(?,?,?,?,?,?)', uid, name, email, password, 'staff', b.payments ? 1 : 0); audit(u, 'team.created', uid); return { id: uid }; }); });
route('PUT', '/api/users/([a-zA-Z0-9-]+)', async ({ b, u, p }) => { manager(u); const target = get('SELECT * FROM users WHERE id=?', p[1]); if (!target || target.role === 'manager')
    fail(400, 'Manager account cannot be changed here'); const password = b.password ? await hashPassword(b.password) : target.password; transaction(() => { run('UPDATE users SET payments=?,active=?,password=? WHERE id=?', b.payments ? 1 : 0, b.active ? 1 : 0, password, p[1]); run('DELETE FROM sessions WHERE user_id=?', p[1]); audit(u, 'team.updated', p[1]); }); return { ok: true }; });
for (const kind of ['customers', 'services']) {
    route('GET', `/api/${kind}`, ({ u, url }) => { const q = (url.searchParams.get('q') || '').toLowerCase(); return all(`SELECT * FROM ${kind} WHERE archived=0${kind === 'customers' && u.role !== 'manager' ? ' AND created_by=?' : ''}`, ...(kind === 'customers' && u.role !== 'manager' ? [u.id] : [])).map(r => ({ ...JSON.parse(r.body), ...(kind==='services' && u.role!=='manager'?{purchasePrice:undefined}:{}), id: r.id, version: r.version })).filter(r => JSON.stringify(r).toLowerCase().includes(q)); });
    for (const method of ['POST', 'PUT'])
        route(method, `/api/${kind}${method === 'PUT' ? '/([a-zA-Z0-9-]+)' : ''}`, ({ b, u, p }) => {
            if (kind === 'services')
                manager(u);
            return transaction(() => {
                const old = method === 'PUT' ? get(`SELECT * FROM ${kind} WHERE id=?`, p[1]) : null;
                if (method === 'PUT') {
                    if (kind === 'customers')
                        scope(u, old);
                    else if (!old)
                        fail(404, 'Service not found');
                    version(old, b);
                }
                const uid = old?.id || id();
                let value;
                if (kind === 'customers') {
                    const st = state(b.state);
                    value = { name: text(b.name, 'Customer name'), email: String(b.email || '').slice(0, 150), phone: String(b.phone || '').slice(0, 30), contactName: String(b.contactName||'').trim().slice(0,150), address: text(b.address, 'Address', 1000), state: st, gstin: gstin(String(b.gstin || '').toUpperCase(), st) };
                }
                else {
                    if(b.rate==null||String(b.rate).trim()==='')fail(400,'Selling rate is required');
                    minor(b.rate);
                    const metadata = itemMetadata(b, true);
                    const taxRate=b.taxRate==null||String(b.taxRate).trim()===''?'':String(b.taxRate);
                    if(taxRate!==''&&minor(taxRate)>10000)fail(400,'GST rate must be between 0 and 100 percent');
                    const optional={};
                    for(const field of ['purchasePrice','openingStock','minimumStock']){
                        const v=b[field]==null||String(b[field]).trim()===''?'':String(b[field]);
                        if(v!=='')fixed(v,field==='purchasePrice'?2:3);optional[field]=v;
                    }
                    for(const field of ['brand','category']){optional[field]=String(b[field]||'').trim();if(optional[field].length>100)fail(400,field+' must be at most 100 characters');}
                    value = { ...metadata, ...optional, name: text(b.name, 'Product / service name'), rate: String(b.rate), taxRate };
                }
                if (old)
                    run(`UPDATE ${kind} SET body=?,version=version+1 WHERE id=?`, JSON.stringify(value), uid);
                else if (kind === 'customers')
                    run('INSERT INTO customers(id,body,created_by) VALUES(?,?,?)', uid, JSON.stringify(value), u.id);
                else
                    run('INSERT INTO services(id,body) VALUES(?,?)', uid, JSON.stringify(value));
                audit(u, `${kind}.${old ? 'updated' : 'created'}`, uid, JSON.stringify({before:old?JSON.parse(old.body):null,after:value}));
                return { ...value, id: uid, version: (old?.version || 0) + 1 };
            });
        });
    route('POST', `/api/${kind}/([a-zA-Z0-9-]+)/archive`, ({ u, p, b }) => { if (kind === 'services')
        manager(u); const r = get(`SELECT * FROM ${kind} WHERE id=?`, p[1]); if (kind === 'customers')
        scope(u, r);
    else if (!r)
        fail(404, 'Service not found'); version(r, b); run(`UPDATE ${kind} SET archived=1,version=version+1 WHERE id=?`, p[1]); audit(u, `${kind}.archived`, p[1]); return { ok: true }; });
}
route('POST', '/api/calculate', ({ b }) => calculate(b, settings()?.state || '27'));
route('GET', '/api/documents', ({u,url}) => listDocuments(u,url.searchParams,docView));
route('POST', '/api/documents', ({ b, u }) => { if (!['invoice', 'quote', 'proforma'].includes(b.kind))
    fail(400, 'Invalid document type'); const value = validateDoc(b, u), uid = id(); run('INSERT INTO documents(id,kind,status,customer_id,created_by,body) VALUES(?,?,?,?,?,?)', uid, b.kind, 'draft', b.customerId, u.id, JSON.stringify(value)); audit(u, 'document.draft-created', uid); return docView(get('SELECT * FROM documents WHERE id=?', uid)); });
route('GET', '/api/documents/([a-zA-Z0-9-]+)', ({ u, p }) => { const d = docView(scope(u, get('SELECT * FROM documents WHERE id=?', p[1]))); return { ...d, customer:d.snapshot?.customer||JSON.parse(get('SELECT body FROM customers WHERE id=?',d.customer_id).body), payments: all('SELECT * FROM payments WHERE document_id=? ORDER BY rowid DESC', p[1]), corrections: all('SELECT * FROM corrections WHERE document_id=?', p[1]) }; });
route('PUT', '/api/documents/([a-zA-Z0-9-]+)', ({ b, u, p }) => transaction(() => { const old = scope(u, get('SELECT * FROM documents WHERE id=?', p[1])); version(old, b); if (old.status !== 'draft'||get('SELECT document_id FROM document_archives WHERE document_id=?',old.id))
    fail(409, 'Issued documents cannot be edited. Request a correction.'); if(JSON.parse(old.body).sourceDocumentId&&b.customerId!==old.customer_id)fail(400,'A converted invoice must retain its source customer'); const value = {...validateDoc(b, u),...sourceMetadata(JSON.parse(old.body))}; run('UPDATE documents SET body=?,customer_id=?,version=version+1 WHERE id=?', JSON.stringify(value), b.customerId, p[1]); audit(u, 'document.draft-updated', p[1]); return docView(get('SELECT * FROM documents WHERE id=?', p[1])); }));
route('POST', '/api/documents/([a-zA-Z0-9-]+)/issue', ({ b, u, p }) => transaction(() => {
    const old = scope(u, get('SELECT * FROM documents WHERE id=?', p[1]));
    if (old.status === 'issued')
        return docView(old);
    if(old.status!=='draft'||get('SELECT document_id FROM document_archives WHERE document_id=?',old.id))fail(409,'Only active drafts can be issued');
    version(old, b);
    const v = {...validateDoc(JSON.parse(old.body), u),...sourceMetadata(JSON.parse(old.body))}, biz = settings();
    if (!biz.confirmed || !biz.gstin)
        fail(400, 'Manager must confirm business GST details and tax settings before issuing');
    if (v.date > today())
        fail(400, 'Cannot issue a future-dated document');
    v.lines.forEach(l => itemMetadata(l, true));
    if(v.lines.some(l=>l.taxRate===''))fail(400,'Choose a GST rate for every invoice item before issuing; use 0 only where applicable');
    const d = new Date(v.date), fy = d.getUTCFullYear() - (d.getUTCMonth() < 3 ? 1 : 0), series = (old.kind === 'quote' ? 'Q' : old.kind === 'proforma' ? 'P' : 'I') + String(fy).slice(-2) + String(fy + 1).slice(-2);
    run('INSERT INTO sequences VALUES(?,1) ON CONFLICT(fy) DO UPDATE SET value=value+1', series);
    const n = get('SELECT value FROM sequences WHERE fy=?', series).value, number = `${series}/${String(n).padStart(6, '0')}`;
    const source=v.sourceDocumentId?get('SELECT * FROM documents WHERE id=?',v.sourceDocumentId):null;
    const snapshot = { business: biz, customer: source?.converted_id===old.id?JSON.parse(source.snapshot).customer:JSON.parse(get('SELECT body FROM customers WHERE id=?', old.customer_id).body), document: v, issuedAt: new Date().toISOString() };
    run("UPDATE documents SET number=?,status='issued',body=?,snapshot=?,version=version+1 WHERE id=?", number, JSON.stringify(v), JSON.stringify(snapshot), p[1]);
    audit(u, 'document.issued', p[1], number);
    return docView(get('SELECT * FROM documents WHERE id=?', p[1]));
}));
function sourceMetadata(body){return body.sourceDocumentId?{sourceDocumentId:body.sourceDocumentId,sourceDocumentNumber:body.sourceDocumentNumber}:{};}
route('POST','/api/documents/([a-zA-Z0-9-]+)/convert',({u,p})=>transaction(()=>{
 const old=scope(u,get('SELECT * FROM documents WHERE id=?',p[1]));
 if(!['quote','proforma'].includes(old.kind)||old.status!=='issued')fail(400,'Issue the quotation or proforma before converting');
 if(old.converted_id)return docView(scope(u,get('SELECT * FROM documents WHERE id=?',old.converted_id)));
 const original=JSON.parse(old.snapshot).document,current=today();
 const value={...validateDoc({...original,customerId:old.customer_id,date:current,dueDate:original.dueDate<current?current:original.dueDate},u),sourceDocumentId:old.id,sourceDocumentNumber:old.number};
 const uid=id();run("INSERT INTO documents(id,kind,status,customer_id,created_by,body) VALUES(?,'invoice','draft',?,?,?)",uid,old.customer_id,old.created_by,JSON.stringify(value));
 run('UPDATE documents SET converted_id=?,version=version+1 WHERE id=?',uid,old.id);audit(u,old.kind+'.converted',old.id,uid);audit(u,'document.created-from-'+old.kind,uid,old.number);
 return docView(get('SELECT * FROM documents WHERE id=?',uid));
}));
route('GET','/api/documents/([a-zA-Z0-9-]+)/revisions',({u,p})=>{scope(u,get('SELECT * FROM documents WHERE id=?',p[1]));return all('SELECT version,number,at,actor,reason FROM document_revisions WHERE document_id=? ORDER BY version DESC',p[1]);});
route('POST','/api/documents/([a-zA-Z0-9-]+)/revise',({u,p,b})=>{manager(u);return transaction(()=>{
 const old=scope(u,get('SELECT * FROM documents WHERE id=?',p[1]));version(old,b);
 if(old.kind!=='proforma'||old.status!=='issued'||old.converted_id)fail(409,'Only an unconverted issued proforma can be revised');
 if(b.customerId!==old.customer_id)fail(400,'A proforma revision must retain its customer. Create a new proforma for another company.');
 const reason=text(b.revisionReason,'Revision reason',1000),value=validateDoc(b,u);
 if(value.date>today())fail(400,'Cannot issue a future-dated document');
 if(value.lines.some(l=>l.taxRate===''))fail(400,'Choose a GST rate for every proforma item before saving an issued revision');
 const at=new Date().toISOString();
 run('INSERT INTO document_revisions(document_id,version,body,snapshot,number,at,actor,reason) VALUES(?,?,?,?,?,?,?,?)',old.id,old.version,old.body,old.snapshot,old.number,at,u.name,reason);
 const snapshot={business:settings(),customer:JSON.parse(get('SELECT body FROM customers WHERE id=?',old.customer_id).body),document:value,issuedAt:at};
 run('UPDATE documents SET body=?,snapshot=?,version=version+1 WHERE id=?',JSON.stringify(value),JSON.stringify(snapshot),old.id);audit(u,'proforma.revised',old.id,reason);return docView(get('SELECT * FROM documents WHERE id=?',old.id));
});});
route('POST', '/api/documents/([a-zA-Z0-9-]+)/correction', ({ u, p, b }) => { const document=scope(u, get('SELECT * FROM documents WHERE id=?', p[1]));if(document.status!=='issued')fail(400,'Corrections apply to issued documents'); const uid = id(); run('INSERT INTO corrections(id,document_id,created_by,reason) VALUES(?,?,?,?)', uid, p[1], u.id, text(b.reason, 'Correction reason', 1000)); audit(u, 'correction.requested', p[1], b.reason); return { id: uid }; });
function printableDocument(u, documentId) {
 const d=docView(scope(u,get('SELECT * FROM documents WHERE id=?',documentId)));
 if(!d.snapshot)d.snapshot={business:settings(),customer:JSON.parse(get('SELECT body FROM customers WHERE id=?',d.customer_id).body),document:d.body};
 d.payments=all('SELECT date,method,reference,amount,reversed_at FROM payments WHERE document_id=? ORDER BY date,id',d.id);
 return d;
}
route('GET','/api/documents/([a-zA-Z0-9-]+)/pdf',async({u,p,res,url})=>{
 const d=printableDocument(u,p[1]);
 if(url.searchParams.has('revision')){
  const r=get('SELECT * FROM document_revisions WHERE document_id=? AND version=?',d.id,Number(url.searchParams.get('revision')));if(!r)fail(404,'Saved revision not found');
  d.body=JSON.parse(r.body);d.snapshot=JSON.parse(r.snapshot);d.number=r.number;d.paid=0;d.balance=d.body.total;d.archivedVersion=r.version;
 }
 const bytes=await invoicePDF(d,logoForPDF(d.snapshot?.business.logoId));
 res.setHeader('Content-Type','application/pdf');res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Disposition',`${url.searchParams.get('download')==='1'?'attachment':'inline'}; filename="${(d.number||'draft').replace(/\//g,'-')}.pdf"`);res.end(bytes);
});

function recordPaymentEntry(u,b){if(u.role!=='manager'&&!u.payments)fail(403,'Payment recording is disabled for your account');text(b.idempotency, 'Submission key'); const previous = get('SELECT * FROM payments WHERE idempotency=?', b.idempotency); if (previous) {
    scope(u, get('SELECT * FROM documents WHERE id=?', previous.document_id));
    if (previous.document_id !== b.documentId || previous.amount !== minor(b.amount) || previous.date !== b.date || previous.method !== b.method || previous.reference !== String(b.reference || ''))
        fail(409, 'Submission key reused with different payment details');
    return previous;
} const d = docView(scope(u, get('SELECT * FROM documents WHERE id=?', b.documentId))); if (d.status !== 'issued' || d.kind !== 'invoice')
    fail(400, 'Payments require an issued invoice'); const value = minor(b.amount); if (value <= 0 || value > d.balance)
    fail(400, 'Payment must be positive and cannot exceed the outstanding balance; advances are not supported'); date(b.date); if (b.date > today())
    fail(400, 'Payment date cannot be in the future'); const uid = id(); run('INSERT INTO payments(id,document_id,customer_id,amount,date,method,reference,created_by,idempotency) VALUES(?,?,?,?,?,?,?,?,?)', uid, d.id, d.customer_id, value, b.date, text(b.method, 'Payment method', 30), String(b.reference || '').slice(0, 200), u.id, b.idempotency); audit(u, 'payment.recorded', uid, amount(value)); return get('SELECT * FROM payments WHERE id=?', uid);}
route('POST','/api/payments',({u,b})=>transaction(()=>recordPaymentEntry(u,b)));
route('POST', '/api/payments/([a-zA-Z0-9-]+)/reverse', ({ u, p, b }) => { manager(u); return transaction(() => { const r = get('SELECT * FROM payments WHERE id=?', p[1]); if (!r)
    fail(404, 'Payment not found'); if (r.reversed_at)
    return r; const reason = text(b.reason, 'Reversal reason', 1000); run('UPDATE payments SET reversed_at=?,reason=? WHERE id=?', new Date().toISOString(), reason, p[1]); audit(u, 'payment.reversed', p[1], reason); return { ok: true }; }); });
route('GET', '/api/payments', ({ u }) => all(`SELECT payments.*,documents.number FROM payments JOIN documents ON document_id=documents.id ${u.role !== 'manager' ? 'WHERE documents.created_by=?' : ''} ORDER BY payments.rowid DESC`, ...u.role !== 'manager' ? [u.id] : []));
route('GET', '/api/customers/([a-zA-Z0-9-]+)/statement', ({ u, p }) => { const c = scope(u, get('SELECT * FROM customers WHERE id=?', p[1])); const documents = all(`SELECT * FROM documents WHERE customer_id=? AND kind='invoice' AND status='issued'${u.role !== 'manager' ? ' AND created_by=?' : ''}`, ...u.role !== 'manager' ? [c.id, u.id] : [c.id]).map(docView); const ids = new Set(documents.map(d => d.id)); return { customer: JSON.parse(c.body), documents, payments: all('SELECT * FROM payments WHERE customer_id=?', c.id).filter(p => ids.has(p.document_id)), balance: documents.reduce((s, d) => s + d.balance, 0) }; });
route('GET', '/api/expenses', ({ u }) => { manager(u); return all('SELECT * FROM expenses ORDER BY rowid DESC').map(r => ({ ...JSON.parse(r.body), id: r.id })); });
route('POST', '/api/expenses', ({ u, b }) => { manager(u); const uid = id(), value = { description: text(b.description, 'Description'), category: text(b.category, 'Category'), date: date(b.date), amount: minor(b.amount) }; if (value.amount <= 0)
    fail(400, 'Expense must be positive'); run('INSERT INTO expenses VALUES(?,?,?)', uid, JSON.stringify(value), u.id); audit(u, 'expense.created', uid); return value; });
route('GET', '/api/audit', ({ u }) => { manager(u); return all('SELECT * FROM audit ORDER BY id DESC LIMIT 200'); });
function summary(u, from, to) { const docs = all(`SELECT * FROM documents WHERE kind='invoice' AND status='issued'${u.role !== 'manager' ? ' AND created_by=?' : ''}`, ...u.role !== 'manager' ? [u.id] : []).map(docView), ids = new Set(docs.map(d => d.id)); const pays = all('SELECT * FROM payments WHERE reversed_at IS NULL').filter(p => ids.has(p.document_id) && p.date >= from && p.date <= to); const period = docs.filter(d => d.body.date >= from && d.body.date <= to); return { billed: period.reduce((s, d) => s + d.body.total, 0), received: pays.reduce((s, p) => s + p.amount, 0), outstanding: docs.reduce((s, d) => s + d.balance, 0), overdue: docs.filter(d => d.overdue).reduce((s, d) => s + d.balance, 0), tax: period.reduce((s, d) => s + d.body.cgst + d.body.sgst + d.body.igst, 0), recent: docs.slice(-5).reverse(), attention: docs.filter(d => d.overdue).slice(0, 5), corrections: u.role === 'manager' ? all("SELECT corrections.*,documents.number FROM corrections JOIN documents ON document_id=documents.id WHERE corrections.status='open'") : [], chart: Array.from({ length: 6 }, (_, i) => { const d = new Date(today()); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 5 + i); const month = d.toISOString().slice(0, 7); return { month, billed: docs.filter(r => r.body.date.startsWith(month)).reduce((s, r) => s + r.body.total, 0), received: all('SELECT * FROM payments WHERE reversed_at IS NULL AND date LIKE ?', month + '%').filter(p => ids.has(p.document_id)).reduce((s, p) => s + p.amount, 0) }; }) }; }
route('GET', '/api/dashboard', ({ u, url }) => { const from = date(url.searchParams.get('from') || today().slice(0, 7) + '-01'), to = date(url.searchParams.get('to') || today()); return { ...summary(u, from, to), from, to }; });
route('GET', '/api/reports', ({ u, url }) => { manager(u); const from = date(url.searchParams.get('from') || today().slice(0, 7) + '-01'), to = date(url.searchParams.get('to') || today()); return { ...summary(u, from, to), expenses: all('SELECT body FROM expenses').map(r => JSON.parse(r.body)).filter(r => r.date >= from && r.date <= to).reduce((s, r) => s + r.amount, 0), from, to }; });
route('GET', '/api/export', ({ u, url, res }) => { manager(u); const from = date(url.searchParams.get('from') || '2000-01-01'), to = date(url.searchParams.get('to') || today()); const rows = all("SELECT * FROM documents WHERE kind='invoice' AND status='issued'").map(docView).filter(d => d.body.date >= from && d.body.date <= to); const cell = v => '"' + String(v).replace(/"/g, '""').replace(/^[=+@-]/, "'$&") + '"'; const csv = [['Number', 'Date', 'Customer', 'Taxable INR', 'CGST INR', 'SGST INR', 'IGST INR', 'Total INR', 'Paid INR', 'Balance INR'], ...rows.map(d => [d.number, d.body.date, d.snapshot.customer.name, amount(d.body.subtotal), amount(d.body.cgst), amount(d.body.sgst), amount(d.body.igst), amount(d.body.total), amount(d.paid), amount(d.balance)])].map(r => r.map(cell).join(',')).join('\r\n'); audit(u, 'report.exported'); res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="invoice-report.csv"'); res.end('\ufeff' + csv); });
route('GET', '/api/backups', ({ u }) => { manager(u); return backupStatus(); });
route('POST', '/api/backups', ({ u }) => { manager(u); return createBackup(u); });
route('POST', '/api/backups/test', ({ u, b }) => { manager(u); const { bytes, ...result } = testRestore(b.file, u); return result; });
route('POST', '/api/backups/restore', async ({ u, b }) => { manager(u); if (b.confirmation !== 'RESTORE ' + b.file)
    fail(400, 'Type RESTORE followed by the exact backup filename'); if (!await passwordOK(b.password, u.password))
    fail(403, 'Manager password is incorrect'); return restoreBackup(b.file, u); });
registerManagement(route,{scope,version,docView});
registerInvoiceActions(route,{scope,version,docView,printableDocument,recordPaymentEntry});
const root = path.resolve('dist');
export const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
    res.setHeader('Cache-Control', 'no-store');
    try {
        const url = new URL(req.url, 'http://localhost');
        const host = new URL('http://' + req.headers.host).hostname;
        if (!['localhost', '127.0.0.1', '[::1]'].includes(host) && req.headers.host !== process.env.APP_HOST)
            fail(403, 'Unrecognised application host');
        if (!url.pathname.startsWith('/api/')) {
            const target = url.pathname === '/' ? path.join(root, 'index.html') : path.resolve(root, '.' + decodeURIComponent(url.pathname));
            if (!target.startsWith(root + path.sep))
                fail(403, 'Forbidden');
            const file = fs.existsSync(target) && fs.statSync(target).isFile() ? target : path.join(root, 'index.html');
            res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html');
            res.end(fs.readFileSync(file));
            return;
        }
        const mutating = !['GET', 'HEAD'].includes(req.method);
        if (mutating) {
            const host = req.headers.host, origin = req.headers.origin;
            if (origin && new URL(origin).host !== host)
                fail(403, 'Cross-origin request rejected');
            if (req.headers['sec-fetch-site'] === 'cross-site')
                fail(403, 'Cross-site request rejected');
        }
        const raw = req.headers.cookie?.match(/(?:^|; )billing_session=([a-f0-9]+)/)?.[1], s = raw ? get('SELECT * FROM sessions WHERE token=? AND expires>?', crypto.createHash('sha256').update(raw).digest('hex'), Date.now()) : null, u = s ? get('SELECT * FROM users WHERE id=? AND active=1', s.user_id) : null;
        const publicRoute = ['/api/session', '/api/login', '/api/setup'].includes(url.pathname);
        if (!publicRoute && !u)
            fail(401, 'Please sign in');
        if (mutating && !publicRoute && req.headers['x-csrf-token'] !== s?.csrf)
            fail(403, 'Session check failed. Reload and retry');
        let b = {};
        if (mutating) {
            let body = '';
            for await (const chunk of req) {
                body += chunk;
                if (Buffer.byteLength(body) > (url.pathname==='/api/branding/logo'?3*1024*1024:262144))
                    fail(413, 'Request is too large');
            }
            try {
                b = JSON.parse(body || '{}');
            }
            catch {
                fail(400, 'Invalid JSON');
            }
        }
        const r = routes.find(r => r.method === req.method && r.pattern.test(url.pathname));
        if (!r)
            fail(404, 'Endpoint not found');
        const ctx = { b, u, s, req, res, url, p: url.pathname.match(r.pattern) };
        const key = req.headers['idempotency-key'];
        let response;
        if (mutating && u && key && ['POST /api/documents', 'POST /api/expenses'].includes(req.method + ' ' + url.pathname)) {
            if (typeof key !== 'string' || key.length > 100)
                fail(400, 'Invalid submission key');
            const hash = crypto.createHash('sha256').update(req.url + JSON.stringify(b)).digest('hex');
            response = transaction(() => { const prior = get('SELECT * FROM requests WHERE user_id=? AND key=?', u.id, key); if (prior) {
                if (prior.hash !== hash)
                    fail(409, 'Submission key reused for a different request');
                return JSON.parse(prior.response);
            } const result = r.fn(ctx); run('INSERT INTO requests VALUES(?,?,?,?)', u.id, key, hash, JSON.stringify(result)); return result; });
        }
        else
            response = await r.fn(ctx);
        if (!res.writableEnded) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(response ?? { ok: true }));
        }
    }
    catch (e) {
        if (res.writableEnded)
            return;
        const status = e.status || (/UNIQUE constraint/.test(e.message) ? 409 : 400);
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: status === 409 && !e.status ? 'A record with these details already exists' : e.message }));
    }
});
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const port = Number(process.env.PORT || 3001);
    server.listen(port, process.env.HOST || '127.0.0.1', () => { console.log(`Billing Workspace: http://127.0.0.1:${port}`); scheduleBackups(); });
}
