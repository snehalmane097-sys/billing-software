import React,{useEffect,useId,useState} from 'react';
import {type Row} from '../lib/api';
export function SearchSelect({label,value,items=[],onChange,disabled=false}:any){
 const id=useId(),[query,setQuery]=useState(''),[open,setOpen]=useState(false),[index,setIndex]=useState(0);
 const selected=items.find((r:Row)=>r.id===value),matches=items.filter((r:Row)=>[r.name,r.gstin,r.contactName].join(' ').toLowerCase().includes(query.toLowerCase())).slice(0,30);
 useEffect(()=>{if(!open)setQuery(selected?.name||'');},[selected?.name,open]);
 function choose(r:Row){onChange(r.id);setQuery(r.name);setOpen(false);}
 return <div className="search-select"><label htmlFor={id}>{label}</label><input id={id} role="combobox" aria-expanded={open} aria-controls={id+'-options'} aria-autocomplete="list" aria-activedescendant={open&&matches[index]?id+'-'+index:undefined} value={query} disabled={disabled} placeholder="Search company or GSTIN" autoComplete="off" onFocus={()=>{setQuery('');setIndex(0);setOpen(true);}} onBlur={()=>setOpen(false)} onChange={e=>{setQuery(e.target.value);setIndex(0);setOpen(true);}} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);setIndex(i=>Math.min(i+1,matches.length-1));}if(e.key==='ArrowUp'){e.preventDefault();setIndex(i=>Math.max(0,i-1));}if(e.key==='Enter'&&open&&matches[index]){e.preventDefault();choose(matches[index]);}if(e.key==='Escape')setOpen(false);}}/>
 {open&&<div id={id+'-options'} role="listbox" className="search-select-options">{matches.length?matches.map((r:Row,i:number)=><div id={id+'-'+i} key={r.id} role="option" aria-selected={i===index} onMouseDown={e=>{e.preventDefault();choose(r);}} onMouseEnter={()=>setIndex(i)}><strong>{r.name}</strong><small>{r.gstin||r.phone||'Unregistered customer'}</small></div>):<p>No matching customers</p>}</div>}
 </div>;
}
