import crypto from 'node:crypto';
import {deflateSync} from 'node:zlib';
import sharp from 'sharp';
import {get,run,transaction,audit} from './db.mjs';
export const LOGO_LIMIT=2*1024*1024;
export const branding=()=>{const b=get('SELECT * FROM branding WHERE id=1');return {logoId:b.logo_id,version:b.version,maxBytes:LOGO_LIMIT};};
export async function saveLogo(body,user){
    const allowed={'image/png':'png','image/jpeg':'jpeg','image/webp':'webp'};
    if(!allowed[body.mime])throw Error('Use a PNG, JPG or WebP image');
    if(typeof body.data!=='string'||body.data.length>Math.ceil(LOGO_LIMIT/3)*4||!body.data.length||body.data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.data))throw Error('Logo must be a valid image no larger than 2 MB');
    const original=Buffer.from(body.data,'base64');
    if(original.length>LOGO_LIMIT)throw Error('Logo must be no larger than 2 MB');
    const signature=body.mime==='image/png'?original.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):body.mime==='image/jpeg'?original[0]===255&&original[1]===216&&original[2]===255:original.subarray(0,4).toString()==='RIFF'&&original.subarray(8,12).toString()==='WEBP';
    if(!signature)throw Error('Image contents do not match the selected file type');
    let meta,decoded;
    try{
        const image=sharp(original,{limitInputPixels:16000000,failOn:'warning'});
        meta=await image.metadata();
        if(meta.format!==allowed[body.mime]||(meta.pages||1)>1)throw Error('format');
        decoded=await image.rotate().resize({width:1600,height:600,fit:'inside',withoutEnlargement:true}).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
    }catch{throw Error('Image is invalid, animated, too large in dimensions, or does not match its file type');}
    const {data,info}=decoded,rgb=Buffer.alloc(info.width*info.height*3),alpha=Buffer.alloc(info.width*info.height);
    for(let i=0,j=0;i<data.length;i+=4,j++){rgb[j*3]=data[i];rgb[j*3+1]=data[i+1];rgb[j*3+2]=data[i+2];alpha[j]=data[i+3];}
    const id=crypto.createHash('sha256').update(original).digest('hex');
    return transaction(()=>{
        if(branding().version!==body.version){const e=new Error('Company logo changed in another session. Reload before saving.');e.status=409;throw e;}
        run('INSERT OR IGNORE INTO logos VALUES(?,?,?,?,?,?,?,?,?)',id,body.mime,meta.width,meta.height,original,deflateSync(rgb),deflateSync(alpha),info.width,info.height);
        run('UPDATE branding SET logo_id=?,version=version+1 WHERE id=1',id);audit(user,'business.logo-saved',id);return branding();
    });
}
export function removeLogo(version,user){return transaction(()=>{if(branding().version!==version){const e=new Error('Company logo changed in another session. Reload before removing.');e.status=409;throw e;}run('UPDATE branding SET logo_id=NULL,version=version+1 WHERE id=1');audit(user,'business.logo-removed');return branding();});}
export const logoForPDF=id=>id?get('SELECT * FROM logos WHERE id=?',id):null;
