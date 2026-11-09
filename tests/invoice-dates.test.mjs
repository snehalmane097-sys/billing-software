import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(fs.readFileSync('src/lib/invoice-dates.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {invoiceDates}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('invoice date presets cover inclusive ranges, month/year boundaries and leap days',()=>{
 for(const [preset,from,to]of [['today','2026-11-04','2026-11-04'],['yesterday','2026-11-03','2026-11-03'],['7days','2026-10-29','2026-11-04'],['30days','2026-10-06','2026-11-04'],['month','2026-11-01','2026-11-04'],['previous','2026-10-01','2026-10-31']])assert.deepEqual(invoiceDates(preset,'2026-11-04'),{from,to});
 assert.deepEqual(invoiceDates('previous','2024-03-01'),{from:'2024-02-01',to:'2024-02-29'});assert.deepEqual(invoiceDates('yesterday','2026-01-01'),{from:'2025-12-31',to:'2025-12-31'});assert.deepEqual(invoiceDates('all','2026-11-04'),{from:'',to:''});
});
