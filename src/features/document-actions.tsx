import React,{useState} from 'react';
import {Button,ErrorBox} from '../components/ui';
export function DocumentActions({id,number,notify}:any){const[busy,setBusy]=useState(false),[error,setError]=useState('');async function share(){setBusy(true);setError('');try{
 const response=await fetch(`/api/documents/${id}/pdf`);if(!response.ok){const error=await response.json();throw Error(error.error||'PDF could not be generated');}
 const file=new File([await response.blob()],(number||'draft').replace(/[^a-zA-Z0-9_-]/g,'-')+'.pdf',{type:'application/pdf'});
 if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:number||'Billing document'});notify('PDF share completed');}
 else{const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);notify('PDF downloaded. Attach it in your preferred sharing app.');}
 }catch(e:any){if(e.name!=='AbortError')setError(e.message);}finally{setBusy(false);}}
 return <><a className="button secondary" href={`/api/documents/${id}/pdf?download=1`}>Download PDF</a><a className="button secondary" href={`/api/documents/${id}/pdf`} target="_blank" rel="noreferrer">Preview / print</a><Button secondary disabled={busy} onClick={share}>{busy?'Preparing PDF…':'Share PDF'}</Button><ErrorBox error={error}/></>;}
