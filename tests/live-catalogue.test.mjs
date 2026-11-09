import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'billing-live-catalogue-'));
process.env.DATA_DIR=root;
const {server}=await import('../server/index.mjs');
const {db}=await import('../server/db.mjs');
test('actual HTTP product save accepts blank HSN/SAC and the screenshot optional fields',async t=>{
    t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));db.close();fs.rmSync(root,{recursive:true,force:true});});
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const base=`http://127.0.0.1:${server.address().port}`;
    let cookie='',csrf='';
    async function call(url,method='GET',body){
        const response=await fetch(base+'/api'+url,{method,headers:{cookie,'Content-Type':'application/json','X-CSRF-Token':csrf},body:body===undefined?undefined:JSON.stringify(body)});
        if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
        const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));
        if(result.csrf)csrf=result.csrf;return result;
    }
    await call('/setup','POST',{name:'Disposable HTTP manager',email:'http-test@example.test',password:'only-a-disposable-test-password'});
    const basic=await call('/services','POST',{itemType:'product',name:'Disposable basic product',unit:'NOS',rate:'102'});
    assert.equal(basic.hsn,'');assert.equal(basic.sac,'');assert.equal(basic.taxRate,'');
    const full=await call('/services','POST',{itemType:'product',name:'Disposable optional product',unit:'NOS',rate:'102',hsn:'',sac:'',taxRate:'18',purchasePrice:'102',openingStock:'',minimumStock:'',brand:'',category:'',sku:'',details:''});
    assert.equal(full.hsn,'');assert.equal(full.sac,'');assert.equal(full.purchasePrice,'102');
    const service=await call('/services','POST',{itemType:'service',name:'Disposable service',unit:'hour',rate:'500'});
    assert.equal(service.sac,'');
    const listed=await call('/services');assert.equal(listed.length,3);assert.ok(listed.some(v=>v.id===full.id));
});
