import React,{useEffect,useState} from 'react';
import {documentName,documentPage,go} from '../lib/api';
import {Button,Icon,Load,PageHead,useData} from '../components/ui';
import {DocumentDetail} from './billing';
import {DocumentFilters,InvoiceTable,navigateQuery,Pager} from './management-ui';
export function Documents({kind,params,user,notify}:any){
 const [detail,setDetail]=useState<string|null>(null),base=documentPage(kind),state=useData('/documents?'+new URLSearchParams({...Object.fromEntries(params),kind}));
 useEffect(()=>{sessionStorage.setItem('billing.returnTo',location.hash.slice(1));},[kind,params.toString()]);
 return <><PageHead eyebrow="SALES" title={kind==='invoice'?'GST invoices':kind==='proforma'?'Proforma invoices':'Quotations & estimates'} description={kind==='proforma'?'Prepare an offer, manage revisions and convert it to a GST invoice when ready. Proformas are excluded from sales and receivables.':'Find documents, review their history and manage the next action.'}><Button onClick={()=>go('editor?kind='+kind)}><Icon name="plus" size={17}/>New {documentName(kind)}</Button></PageHead>
 <section className="panel"><div className="panel-head"><h2>Search & manage {kind==='proforma'?'proforma invoices':kind==='quote'?'quotations':'GST invoices'}</h2></div><DocumentFilters params={params} kind={kind} onApply={(patch:any)=>navigateQuery(base,params,{...patch,page:1})}/><Load state={state}><InvoiceTable items={state.data?.items} kind={kind} onView={setDetail}/><Pager data={state.data} onPage={(page:number)=>navigateQuery(base,params,{page})}/></Load></section>
 {detail&&<DocumentDetail key={detail} id={detail} user={user} notify={notify} onClose={()=>{setDetail(null);state.refresh();}}/>}</>;
}
