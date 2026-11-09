export const dateRanges=[['all','All dates'],['today','Today'],['yesterday','Yesterday'],['7days','Last 7 Days'],['30days','Last 30 Days'],['month','This Month'],['previous','Previous Month'],['custom','Custom']];
export function invoiceDates(preset:string,today:string){
 const d=new Date(today+'T00:00:00Z'),format=(v:Date)=>v.toISOString().slice(0,10),back=(n:number)=>{const x=new Date(d);x.setUTCDate(x.getUTCDate()-n);return format(x);};
 if(preset==='today')return {from:today,to:today};if(preset==='yesterday')return {from:back(1),to:back(1)};
 if(preset==='7days'||preset==='30days')return {from:back(preset==='7days'?6:29),to:today};
 if(preset==='month')return {from:today.slice(0,7)+'-01',to:today};
 if(preset==='previous')return {from:format(new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-1,1))),to:format(new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),0)))};
 return {from:'',to:''};
}
