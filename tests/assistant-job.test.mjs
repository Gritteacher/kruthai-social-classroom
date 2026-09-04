import test from 'node:test';
import assert from 'node:assert/strict';
import {handler} from '../netlify/functions/ai-assistant.js';
import {handler as worker} from '../netlify/functions/ai-assistant-background.js';
import {signAssistantJob,validAssistantJob,assistantError} from '../netlify/functions/lib/assistant-job.js';

test('worker signatures bind job, token and expiry; DOM timeouts become 504',()=>{
 const job={exchangeId:'id',expires:Date.now()+10000};job.signature=signAssistantJob(job.exchangeId,'token',job.expires,'secret');
 assert.ok(validAssistantJob(job,'token','secret'));
 assert.equal(validAssistantJob(job,'other','secret'),false);
 assert.equal(validAssistantJob({...job,exchangeId:'other'},'token','secret'),false);
 assert.equal(validAssistantJob(job,'token','secret',job.expires+1),false);
 assert.equal(assistantError(new DOMException('timeout','TimeoutError')).status,504);
});
test('async chat records one job, authenticates worker, saves answer and ignores replays',async()=>{
 const keys=['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','AI_GATEWAY_API_KEY'];
 const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));const oldFetch=globalThis.fetch;
 Object.assign(process.env,{VITE_SUPABASE_URL:'https://mock.supabase.co',VITE_SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'secret',AI_GATEWAY_API_KEY:'key'});
 const id='33333333-3333-4333-8333-333333333333';let row,dispatch,providerCalls=0,inserts=0;
 globalThis.fetch=async(input,options={})=>{
  const url=new URL(String(input)),method=options.method||'GET';let data=null;
  if(url.pathname.endsWith('/auth/v1/user'))data={id};
  else if(url.pathname.endsWith('/profiles'))data={role:'student',student_code:'123',full_name:'Synthetic',class_name:'M1'};
  else if(url.pathname.endsWith('/ai_assistant_settings'))data={name:'AI',student_enabled:true,score_access:true,tone:'friendly',answer_length:'balanced'};
  else if(url.pathname.endsWith('/ai_assistant_exchanges')) {
   if(method==='POST'){inserts++;row={...JSON.parse(options.body),status:'pending'};}
   else if(method==='PATCH'){
    const patch=JSON.parse(options.body);const claim=patch.response_data?.claimed_at;
    assert.equal(url.searchParams.get('id'),`eq.${row.id}`);
    if(claim){assert.equal(url.searchParams.get('user_id'),`eq.${id}`);assert.equal(url.searchParams.get('response_data->>claimed_at'),'is.null');}
    if(!claim||!row.response_data.claimed_at){row={...row,...patch};data=claim?{id:row.id}:null;}
   } else data=url.searchParams.has('conversation_id')?[]:row;
  } else if(url.pathname.endsWith('/ai-assistant-background')){dispatch={httpMethod:'POST',headers:options.headers,body:options.body};return new Response('',{status:202});}
  else if(url.pathname.endsWith('/chat/completions')){providerCalls++;data={choices:[{message:{content:'คำตอบจากงานเบื้องหลัง'},finish_reason:'stop'}]};}
  else throw new Error(`Unexpected URL ${url.pathname}`);
  return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
 };
 try {
  const started=await handler({httpMethod:'POST',headers:{authorization:'Bearer test-token'},body:JSON.stringify({message:'สวัสดี',background:true})});
  assert.equal(started.statusCode,202,started.body);assert.equal(providerCalls,0);assert.equal(inserts,1);
  assert.equal((await worker({...dispatch,headers:{authorization:'Bearer forged'}})).statusCode,403);
  dispatch.headers={authorization:dispatch.headers.Authorization};
  assert.equal((await worker(dispatch)).statusCode,200);assert.equal(row.status,'completed');assert.equal(providerCalls,1);assert.equal(inserts,1);
  await worker(dispatch);assert.equal(providerCalls,1);
 }finally{globalThis.fetch=oldFetch;for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}}
});
