import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), modules=[], ids=new Map();
function bundle(file){
  file=path.resolve(file); if(ids.has(file))return ids.get(file);
  const id=modules.length;ids.set(file,id);modules.push('');
  let source=fs.readFileSync(file,'utf8');
  if(/\.tsx?$/.test(file)) source=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  source=source.replace(/require\(["']([^"']+)["']\)/g,(_,name)=>{
    let target;
    if(name.startsWith('.')) { const p=path.resolve(path.dirname(file),name);target=['','.ts','.tsx','.js','.json','/index.js'].map(e=>p+e).find(p=>fs.existsSync(p)&&fs.statSync(p).isFile()); }
    else target=require.resolve(name,{paths:[path.dirname(file)]});
    if(!target)throw Error(`Cannot resolve ${name}`);
    return `__require(${bundle(target)})`;
  });
  modules[id]=`function(module,exports,__require){${source}\n}`;return id;
}
const entry=bundle('src/main.tsx');
fs.mkdirSync('dist',{recursive:true});
fs.writeFileSync('dist/app.js',`(()=>{const process={env:{NODE_ENV:'production'}};const m=[${modules.join(',\n')}],c={};function r(i){if(c[i])return c[i].exports;const x=c[i]={exports:{}};m[i](x,x.exports,r);return x.exports}r(${entry})})();`);
fs.writeFileSync('dist/styles.css',fs.readFileSync('src/styles.css','utf8')+'\n'+fs.readFileSync('src/management.css','utf8')+'\n'+fs.readFileSync('src/invoice-management.css','utf8'));
fs.writeFileSync('dist/index.html',fs.readFileSync('index.html','utf8').replace('<script type="module" src="/src/main.tsx"></script>','<link rel="stylesheet" href="/styles.css"/><script defer src="/app.js"></script>'));
console.log(`Built ${modules.length} modules to dist/`);
