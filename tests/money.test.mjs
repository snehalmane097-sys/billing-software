import test from 'node:test';
import assert from 'node:assert/strict';
import {calculate,minor} from '../server/money.mjs';
const base={pricing:'exclusive',placeOfSupply:'27',lines:[{description:'Consulting',sac:'998311',quantity:'1',rate:'23000.00',taxRate:'18',discount:'0'}]};
test('intra-state invoice has exact CGST/SGST and total',()=>{const v=calculate(base,'27');assert.equal(v.subtotal,2300000);assert.equal(v.cgst,207000);assert.equal(v.sgst,207000);assert.equal(v.igst,0);assert.equal(v.total,2714000);});
test('inter-state tax uses IGST only',()=>{const v=calculate({...base,placeOfSupply:'29'},'27');assert.equal(v.igst,414000);assert.equal(v.cgst+v.sgst,0);assert.equal(v.total,2714000);});
test('inclusive price and discount are applied in the documented order',()=>{const v=calculate({...base,pricing:'inclusive',lines:[{...base.lines[0],rate:'118.00',discount:'10'}]},'27');assert.equal(v.subtotal,9000);assert.equal(v.cgst,810);assert.equal(v.sgst,810);assert.equal(v.total,10620);});
test('fractional quantity and half-up rounding do not use floating point',()=>{const v=calculate({...base,lines:[{...base.lines[0],quantity:'1.005',rate:'1.00',taxRate:'0'}]},'27');assert.equal(v.total,101);const rounded=calculate({...base,rounding:true,lines:[{...base.lines[0],rate:'1.50',taxRate:'0'}]},'27');assert.equal(rounded.total,200);assert.equal(rounded.roundOff,50);});
test('invalid inputs and excess precision are rejected',()=>{for(const amount of ['NaN','-1','1.001','1e3','Infinity'])assert.throws(()=>minor(amount));assert.throws(()=>calculate({...base,lines:[]},'27'));assert.throws(()=>calculate({...base,lines:[{...base.lines[0],discount:'101'}]},'27'));});
test('inclusive pricing preserves the quoted total when tax-component rounding differs by a paise',()=>{
 for(const st of ['27','29'])for(const rate of ['0.05','0.06','1.27','118.01']){
  const v=calculate({...base,pricing:'inclusive',lines:[{...base.lines[0],rate}]},st);
  assert.equal(v.total,minor(rate));assert.equal(v.subtotal+v.cgst+v.sgst+v.igst+v.roundOff,v.total);
 }
});
test('product metadata survives calculation and invalid product classification is rejected',()=>{
 const line={description:'Test goods',itemType:'product',hsn:'8443',sku:'P-1',unit:'BOX',quantity:'2.5',rate:'100.00',taxRate:'18'};
 const v=calculate({...base,lines:[line]},'27');assert.equal(v.total,29500);assert.equal(v.lines[0].unit,'BOX');assert.equal(v.lines[0].sku,'P-1');assert.equal(v.lines[0].hsn,'8443');
 assert.throws(()=>calculate({...base,lines:[{...line,hsn:'12345'}]},'27'));
 assert.throws(()=>calculate({...base,lines:[{...line,unit:''}]},'27'));
 assert.throws(()=>calculate({...base,lines:[{...line,taxRate:'100.01'}]},'27'));
});
