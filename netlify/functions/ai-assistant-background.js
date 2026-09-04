import {createClient} from '@supabase/supabase-js';
import {handler as answer} from './ai-assistant.js';
import {validAssistantJob} from './lib/assistant-job.js';

export async function handler(event) {
  if(event.httpMethod!=='POST')return {statusCode:405};
  let job;
  try {job=JSON.parse(event.body||'');}catch{return {statusCode:400};}
  const token=String(event.headers?.authorization||'').replace(/^Bearer\s+/i,'');
  const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!validAssistantJob(job,token,secret))return {statusCode:403};
  const admin=createClient(process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const stored=await admin.from('ai_assistant_exchanges').select('status,response_data').eq('id',job.exchangeId).single();
  if(stored.error||stored.data.status!=='pending'||!stored.data.response_data?.job_input)return {statusCode:200};
  const result=await answer({httpMethod:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify(stored.data.response_data.job_input)},{exchangeId:job.exchangeId});
  // Configuration/auth failures can happen before the worker claims the row.
  if(result.statusCode>=400) {
    const message=JSON.parse(result.body).message;
    await admin.from('ai_assistant_exchanges').update({status:'failed',error_message:message,completed_at:new Date().toISOString()}).eq('id',job.exchangeId).eq('status','pending').is('response_data->>claimed_at',null);
  }
  return {statusCode:200};
}
