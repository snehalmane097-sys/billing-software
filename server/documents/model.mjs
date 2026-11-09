// Maps immutable document snapshots into a presentation model. No tax or invoice
// calculation is performed here: all financial fields come from saved records.
import {amountInWords,financialYear} from './format.mjs';
const kinds={invoice:{title:'TAX INVOICE',due:'Due date',financial:true},quote:{title:'QUOTATION',due:'Valid until',financial:true,note:'Quotation — not a tax invoice.'},proforma:{title:'PROFORMA INVOICE',due:'Due date',financial:true,note:'Proforma invoice — not a tax invoice.'},credit:{title:'CREDIT NOTE',due:'Date',financial:true},debit:{title:'DEBIT NOTE',due:'Due date',financial:true},delivery:{title:'DELIVERY NOTE',due:'Delivery date',financial:false,note:'Delivery acknowledgement — not a tax invoice.'}};
export function documentModel(doc,logo){
 const business=doc.snapshot?.business||{},customer=doc.snapshot?.customer||{},value=doc.snapshot?.document||doc.body;
 const kind=String(doc.kind||'invoice').replace(/_note$/,''),config=kinds[kind];if(!config)throw Error('Unsupported document template');
 for(const key of ['subtotal','cgst','sgst','igst','roundOff','total'])if(!Number.isSafeInteger(value[key]))throw Error('Saved document has an invalid '+key);
 for(const line of value.lines)for(const key of ['taxable','cgst','sgst','igst','total'])if(!Number.isSafeInteger(line[key]))throw Error('Saved item has an invalid '+key);
 for(const key of ['grossAmount','discountTotal'])if(value[key]!=null&&!Number.isSafeInteger(value[key]))throw Error('Saved document has invalid '+key);
 for(const key of ['taxable','cgst','sgst','igst']){
  const aggregate=value.lines.reduce((n,l)=>n+l[key],0),documentKey=key==='taxable'?'subtotal':key;
  if(aggregate!==value[documentKey])throw Error('Saved line totals are inconsistent');
 }
 const cess=value.cess??0;if(!Number.isSafeInteger(cess))throw Error('Saved document has invalid cess');
 if(value.subtotal+value.cgst+value.sgst+value.igst+cess+value.roundOff!==value.total)throw Error('Saved document totals are inconsistent');
 const noDiscount=value.lines.every(l=>!l.discount||/^0(?:\.0+)?$/.test(String(l.discount)));
 const cancelled=doc.status==='cancelled';
 const paid=doc.paid??0,balance=doc.balance??(value.total-paid);
 if(!Number.isSafeInteger(paid)||!Number.isSafeInteger(balance)||(cancelled?(paid!==0||balance!==0):paid+balance!==value.total))throw Error('Saved payment balance is inconsistent');
 return {cancelled,cancellation:doc.cancellation,revisionLabel:cancelled?'CANCELLED — NOT PAYABLE. '+(doc.cancellation?.reason||''):doc.archivedVersion?'Archived version '+doc.archivedVersion:doc.kind==='proforma'&&doc.version?'Version '+doc.version:'',business,customer,shipTo:value.shipping||customer,sameShipping:!value.shipping,value,config,kind,number:doc.number||'DRAFT · NOT ISSUED',draft:doc.status!=='issued'&&!cancelled,logo,
  subtotal:value.grossAmount??(noDiscount&&value.pricing==='exclusive'?value.subtotal:null),discount:value.discountTotal??(noDiscount?0:null),taxable:value.subtotal,cess,
  paid,balance,payments:(doc.payments||[]).filter(p=>!p.reversed_at),words:amountInWords(value.total),fy:financialYear(value.date),notes:value.notes||'',terms:value.terms??business.terms??'',reference:value.referenceNumber||''};
}
