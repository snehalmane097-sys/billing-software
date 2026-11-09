import React, {useState, type FormEvent} from 'react';
import {api, money, type Row} from '../lib/api';
import {Badge, Button, ErrorBox, Field, Icon, Input, Modal} from '../components/ui';

export function CatalogueForm({record, onClose, onSaved, defaultType, lockType=false}:any) {
    const [itemType,setItemType]=useState(record?.itemType || defaultType || (record?.id?'service':'product'));
    const [error,setError]=useState(''),[busy,setBusy]=useState(false);
    const product=itemType==='product', editing=!!record?.id;
    async function save(e:FormEvent<HTMLFormElement>) {
        e.preventDefault();setBusy(true);setError('');
        try {
            const body={...Object.fromEntries(new FormData(e.currentTarget)),itemType,version:record?.version};
            const result=await api('/services'+(editing?'/'+record.id:''),editing?'PUT':'POST',body);
            await onSaved(result);
        } catch(e:any){setError(e.message);} finally{setBusy(false);}
    }
    return <Modal title={editing?'Edit '+(product?'product':'service'):'Add '+(product?'product':'service')} onClose={onClose}>
        <form onSubmit={save}>
            <Field label="Item type"><select disabled={lockType||editing} value={itemType} onChange={e=>setItemType(e.target.value)}><option value="product">Product / goods</option><option value="service">Service</option></select></Field>
            <Input label={product?'Product name *':'Service name *'} name="name" required maxLength={250} defaultValue={record?.name} autoFocus placeholder={product?'e.g. Shell Pipe Ring':'e.g. Installation'}/>
            <div className="form-grid"><Input label="Unit *" name="unit" key={itemType} required maxLength={20} defaultValue={record?.itemType===itemType?record?.unit||'NOS':product?'NOS':record?.unit||'service'} hint="e.g. NOS, PCS, KG, hour"/><Input label="Selling price per unit · INR *" name="rate" type="number" step="0.01" min="0" required defaultValue={record?.rate} placeholder="102.00"/></div>
            <p className="basic-entry-note"><Icon name="check" size={15}/>That's all you need to save. Everything below is optional.</p>
            <details className="optional-fields"><summary>Optional details <span>Codes, tax and additional information</span></summary><div className="optional-body">
                <div className="form-grid"><Input key={'code-'+itemType} label={product?'HSN code (optional)':'SAC code (optional)'} name={product?'hsn':'sac'} inputMode="numeric" pattern={product?'([0-9]{4}|[0-9]{6}|[0-9]{8})':'[0-9]{6}'} maxLength={product?8:6} defaultValue={product?record?.hsn:record?.sac}/><Input label={product?'SKU / product code (optional)':'Service code (optional)'} name="sku" maxLength={64} defaultValue={record?.sku}/></div>
                <Field label="Description (optional)"><textarea name="details" maxLength={500} rows={2} defaultValue={record?.details}/></Field>
                <div className="form-grid"><Input label="GST rate % (optional)" name="taxRate" type="number" min="0" max="100" step="0.01" defaultValue={record?.taxRate??''} hint="Leave unset for now; choose the applicable rate when issuing an invoice."/><Input label="Category (optional)" name="category" maxLength={100} defaultValue={record?.category}/></div>
                {product&&<><div className="form-grid"><Input label="Purchase price · INR (optional)" name="purchasePrice" type="number" step="0.01" min="0" defaultValue={record?.purchasePrice}/><Input label="Brand (optional)" name="brand" maxLength={100} defaultValue={record?.brand}/><Input label="Opening stock (optional)" name="openingStock" type="number" step="0.001" min="0" defaultValue={record?.openingStock}/><Input label="Minimum stock (optional)" name="minimumStock" type="number" step="0.001" min="0" defaultValue={record?.minimumStock}/></div><small className="muted">Stock values are reference fields; invoice entry does not maintain an inventory ledger.</small></>}
            </div></details>
            <ErrorBox error={error}/><div className="form-actions"><Button secondary onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy?'Saving…':editing?'Save changes':product?'Save product':'Save service'}</Button></div>
        </form>
    </Modal>;
}

export const emptyItem=():Row=>({description:'',itemType:'product',hsn:'',sac:'',unit:'NOS',sku:'',details:'',quantity:'1',rate:'0',discount:'0',taxRate:''});
export const catalogueLine=(item:Row):Row=>({description:item.name,itemType:item.itemType||'service',hsn:item.hsn||'',sac:item.sac||'',unit:item.unit||(item.itemType==='product'?'NOS':'service'),sku:item.sku||'',details:item.details||'',quantity:'1',rate:item.rate,discount:'0',taxRate:item.taxRate??''});

export function InvoiceItems({lines,items,loading,error,onChange,onCreate,user}:any) {
    const [query,setQuery]=useState(''),[open,setOpen]=useState(false);
    const matches=(items||[]).filter((r:Row)=>[r.name,r.sku,r.hsn,r.sac].join(' ').toLowerCase().includes(query.toLowerCase()));
    const update=(i:number,key:string,value:any)=>onChange(lines.map((l:Row,j:number)=>j===i?{...l,[key]:value}:l));
    function add(item:Row) {
        const row=catalogueLine(item),firstBlank=lines.findIndex((l:Row)=>!l.description.trim());
        onChange(firstBlank>=0?lines.map((l:Row,i:number)=>i===firstBlank?row:l):[...lines,row]);setQuery('');setOpen(false);
    }
    return <section className="panel">
        <div className="panel-head"><h2><span className="step">02</span>Products & services</h2>{user.role==='manager'&&<Button secondary onClick={onCreate}><Icon name="plus" size={14}/>New product</Button>}</div>
        <div className="item-picker"><Field label="Add a saved product or service"><div className="search-box"><Icon name="search" size={17}/><input placeholder="Search by name, SKU, HSN or SAC…" value={query} onFocus={()=>setOpen(true)} onChange={e=>{setQuery(e.target.value);setOpen(true);}} aria-label="Search saved products and services" aria-expanded={open}/><button type="button" onClick={()=>setOpen(!open)}>{open?'Close':'Browse'}</button></div></Field>
            {open&&<div className="item-results">{loading?<p>Loading catalogue…</p>:matches.length?matches.slice(0,20).map((item:Row)=><button type="button" key={item.id} onClick={()=>add(item)}><Icon name={item.itemType==='product'?'box':'file'} size={18}/><div><strong>{item.name}</strong><small>{item.sku?item.sku+' · ':''}{item.itemType==='product'?'HSN '+item.hsn:'SAC '+item.sac} · {item.unit||'service'}</small></div><b>{money(Number(item.rate)*100)}</b><Icon name="plus" size={16}/></button>):<p>{query?'No matching items.':'No products or services saved yet.'}{user.role==='manager'&&<button type="button" className="text-button" onClick={onCreate}>Add your first product</button>}</p>}{matches.length>20&&<p>Showing the first 20 matches. Type more to narrow the list.</p>}</div>}
            <ErrorBox error={error}/><p className="muted small-text">Select an item to fill its description, code, unit, rate and GST. Change the quantity below.</p>
        </div>
        <div className="service-lines">{lines.map((l:Row,i:number)=><div className="service-line" key={i}>
            <div className="line-heading"><strong>Item {String(i+1).padStart(2,'0')} <Badge>{(l.itemType||'service')==='product'?'Product':'Service'}</Badge></strong><button className="text-button" disabled={lines.length===1} onClick={()=>onChange(lines.filter((_:Row,j:number)=>j!==i))}>Remove</button></div>
            <Input label="Product / service description" maxLength={250} value={l.description} onChange={(e:any)=>update(i,'description',e.target.value)}/>
            <div className="line-numbers">{[['quantity','Quantity','0.001'],['rate','Rate · INR','0.01'],['discount','Discount %','0.01'],['taxRate','GST %','0.01']].map(([key,label,step])=><Input key={key} label={label} type="number" min="0" step={step} value={l[key]} onChange={(e:any)=>update(i,key,e.target.value)}/>)}<Input label="Unit" maxLength={20} value={l.unit||(l.itemType==='product'?'NOS':'service')} onChange={(e:any)=>update(i,'unit',e.target.value)}/></div>
            {(l.taxRate==null||l.taxRate==='')&&<p className="tax-pending">GST rate is not set. Select the applicable rate before issuing (0 only where applicable). Preview totals currently exclude GST for this row.</p>}<details className="line-optional"><summary>Optional codes & specifications</summary><div>            <div className="form-grid"><Field label="Item type"><select value={l.itemType||'service'} onChange={e=>onChange(lines.map((r:Row,j:number)=>j===i?{...r,itemType:e.target.value,hsn:'',sac:'',unit:e.target.value==='product'?'NOS':'service'}:r))}><option value="product">Product / goods</option><option value="service">Service</option></select></Field><Input label="SKU / item code" maxLength={64} value={l.sku||''} onChange={(e:any)=>update(i,'sku',e.target.value)}/></div>
<Input label={l.itemType==='product'?'HSN (optional)':'SAC (optional)'} inputMode="numeric" maxLength={l.itemType==='product'?8:6} value={(l.itemType==='product'?l.hsn:l.sac)||''} onChange={(e:any)=>update(i,l.itemType==='product'?'hsn':'sac',e.target.value)}/><Field label="Specifications / details (optional)"><textarea rows={2} maxLength={500} value={l.details||''} onChange={e=>update(i,'details',e.target.value)}/></Field>
</div></details>
        </div>)}</div>
        <div className="panel-content top-border"><Button secondary onClick={()=>onChange([...lines,emptyItem()])}><Icon name="plus" size={16}/>Add blank item row</Button></div>
    </section>;
}
