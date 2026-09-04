import {supabase} from '../../lib/supabase';

function pause(signal:AbortSignal) {
  return new Promise<void>((resolve,reject)=>{
    if(signal.aborted){reject(new DOMException('Aborted','AbortError'));return;}
    const cancel=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));};
    const timer=window.setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},2500);
    signal.addEventListener('abort',cancel,{once:true});
  });
}
export async function waitForAssistantReply(id:string,userId:string,signal:AbortSignal) {
  const start=Date.now();
  while(!signal.aborted&&Date.now()-start<210000) {
    const result=await supabase!.from('ai_assistant_exchanges').select('answer,status,error_message,response_data')
      .eq('id',id).eq('user_id',userId).abortSignal(signal).maybeSingle();
    if(!result.error&&result.data) {
      if(result.data.status==='completed'&&result.data.answer)return {answer:String(result.data.answer),...(result.data.response_data||{})};
      if(result.data.status==='failed')throw new Error(result.data.error_message||'AI ตอบไม่สำเร็จ กรุณาลองใหม่');
    } else if(!result.error&&Date.now()-start>15000) {
      throw new Error('ยังไม่พบคำถามที่บันทึกไว้ กรุณาลองส่งใหม่');
    }
    await pause(signal);
  }
  throw new Error('ยังไม่ได้รับคำตอบ สามารถตรวจคำตอบภายหลังในประวัติการสนทนา');
}
