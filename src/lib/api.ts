export type Row = Record<string, any>;
export let csrf = '';
export async function api(url: string, method = 'GET', body?: unknown, key?: string) {
    const res = await fetch('/api' + url, { method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...(key ? { 'Idempotency-Key': key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await res.json();
    if (!res.ok) {
        if (result.error === 'Enter a six-digit SAC; confirm classification with your accountant') {
            throw Error('The running billing server has outdated product rules. HSN and SAC are optional. Close this form, restart the billing server from C:\\billingsoftware, then reopen the product form.');
        }
        throw Error(result.error || 'Request failed');
    }
    return result;
}
export const money = (v = 0) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(v / 100);
export const day = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
export const go = (path: string) => { location.hash = path; };
export const paths: Record<string, string> = { dashboard: 'Overview', invoices: 'GST invoices', quotations: 'Quotations', proformas:'Proforma invoices', customers: 'Customers', products:'Products', services: 'Services', accounts:'Company accounts', payments: 'Payments & receipts', expenses: 'Business expenses', reports: 'Financial reports', team: 'Team & permissions', backups: 'Backups & recovery', settings: 'Business information', activity: 'Activity history' };
export function setCSRF(value: string) { csrf = value; }

export const documentPage=(kind:string)=>kind==='quote'?'quotations':kind==='proforma'?'proformas':'invoices';
export const documentName=(kind:string)=>kind==='quote'?'quotation':kind==='proforma'?'proforma invoice':'invoice';
