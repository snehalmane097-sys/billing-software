import React,{useRef,useState} from 'react';
import {api} from '../lib/api';
import {Badge,Button,ErrorBox,Icon,Load,useData} from '../components/ui';

export function CompanyLogo({notify,onSaved}:any){
    const state=useData('/branding'),input=useRef<HTMLInputElement>(null);
    const [selected,setSelected]=useState<{mime:string,data:string,url:string}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
    async function choose(file?:File){
        setError('');if(!file)return;
        if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setError('Choose a PNG, JPG or WebP image.');return;}
        if(file.size>2*1024*1024){setError('Logo must be no larger than 2 MB.');return;}
        const reader=new FileReader();reader.onload=()=>{const url=String(reader.result);setSelected({mime:file.type,data:url.split(',')[1],url});};reader.onerror=()=>setError('Unable to read the image. Please choose it again.');reader.readAsDataURL(file);
    }
    async function save(remove=false){
        setBusy(true);setError('');try{
            await api('/branding/logo',remove?'DELETE':'POST',{...(!remove?selected:{}),url:undefined,version:state.data.version});
            setSelected(null);if(input.current)input.current.value='';await state.refresh();await onSaved();notify(remove?'Company logo removed':'Company logo saved');
        }catch(e:any){setError(e.message);}finally{setBusy(false);}
    }
    const url=selected?.url||(state.data?.logoId?'/api/logos/'+state.data.logoId:null);
    return <section className="panel settings-panel"><div className="panel-head"><div><h2>Company logo</h2><p>Your business identity across the workspace and documents</p></div><Badge>{selected?'Preview · not yet saved':state.data?.logoId?'Saved permanently':'No logo uploaded'}</Badge></div><Load state={state}><div className="logo-settings panel-content"><div className="logo-preview">{url?<img src={url} alt="Company logo preview"/>:<div className="logo-fallback"><Icon name="box" size={34}/><small>Your company logo</small></div>}</div><div className="logo-controls"><h3>{state.data?.logoId?'Update your company logo':'Make the workspace yours'}</h3><p>PNG, JPG or WebP · up to 2 MB. Your original image is retained. Logos keep their aspect ratio in the app and PDFs.</p><input ref={input} className="logo-file" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Choose company logo" disabled={busy} onChange={e=>choose(e.target.files?.[0])}/><div className="detail-actions"><Button secondary disabled={busy} onClick={()=>input.current?.click()}><Icon name="plus" size={15}/>{state.data?.logoId?'Replace logo':'Upload logo'}</Button>{selected&&<><Button disabled={busy} onClick={()=>save()}>Save logo</Button><Button secondary disabled={busy} onClick={()=>{setSelected(null);if(input.current)input.current.value='';}}>Cancel preview</Button></>}{state.data?.logoId&&<Button secondary disabled={busy} onClick={()=>save(true)}>Remove logo</Button>}</div><small className="muted">New documents use the current logo. Issued documents keep the logo saved when they were issued.</small></div></div><div className="logo-errors"><ErrorBox error={error}/></div></Load></section>;
}
