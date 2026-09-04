import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const source=await readFile(new URL('../src/services/pagination.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {fetchAllRows}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));

test('loads older submissions beyond the first 1000 records',async()=>{
 const rows=Array.from({length:1927},(_,id)=>({id}));const offsets=[];
 const result=await fetchAllRows((from,to)=>{offsets.push(from);return Promise.resolve({data:rows.slice(from,to+1),count:rows.length,error:null});});
 assert.equal(result.error,null);assert.deepEqual(result.data,rows);assert.deepEqual(offsets,[0,1000]);
});
test('honors smaller server caps without skipping rows',async()=>{
 const rows=Array.from({length:235},(_,id)=>({id}));const offsets=[];
 const result=await fetchAllRows((from)=>{offsets.push(from);return Promise.resolve({data:rows.slice(from,from+100),count:rows.length,error:null});});
 assert.deepEqual(result.data,rows);assert.deepEqual(offsets,[0,100,200]);
});
test('without a count keeps loading until an empty page',async()=>{
 const rows=Array.from({length:12},(_,id)=>({id}));
 const result=await fetchAllRows(from=>Promise.resolve({data:rows.slice(from,from+5),error:null}));
 assert.deepEqual(result.data,rows);
});
test('never returns truncated scores after a later-page failure',async()=>{
 const failure={message:'Network error'};
 const result=await fetchAllRows(from=>Promise.resolve(from===0?{data:[{id:1}],count:2,error:null}:{data:null,error:failure}));
 assert.equal(result.data,null);assert.equal(result.error,failure);
});
test('network rejection preserves the same all-or-nothing contract',async()=>{
 const result=await fetchAllRows(async()=>{throw new Error('Offline');});
 assert.equal(result.data,null);assert.equal(result.error.message,'Offline');
});
test('an empty page cannot masquerade as a complete nonempty dataset',async()=>{
 const result=await fetchAllRows(async()=>({data:[],count:10,error:null}));
 assert.equal(result.data,null);assert.ok(result.error);
});
