import {createHmac,timingSafeEqual} from 'node:crypto';

export function signAssistantJob(id,token,expires,secret) {
  return createHmac('sha256',secret).update(`${id}\n${expires}\n${token}`).digest('hex');
}
export function validAssistantJob(job,token,secret,now=Date.now()) {
  if(!secret||!token||!job||typeof job.exchangeId!=='string'||!Number.isSafeInteger(job.expires)||job.expires<now||job.expires>now+300000||!/^[a-f0-9]{64}$/.test(job.signature||''))return false;
  const expected=signAssistantJob(job.exchangeId,token,job.expires,secret);
  return timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(job.signature,'hex'));
}
export function assistantError(error) {
  const timeout=error?.name==='TimeoutError'||error?.name==='AbortError'||error?.code===23;
  const status=Number.isInteger(error?.status)&&error.status>=400&&error.status<=599?error.status:timeout?504:500;
  return {status,message:status===504?'AI ใช้เวลานานเกินไป กรุณาลองใหม่':error?.status?error.message:'ผู้ช่วย AI โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่หรือแจ้งครู'};
}
