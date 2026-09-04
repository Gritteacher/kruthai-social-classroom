import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Role } from '../../types';

type Exchange = { id:string; conversation_id:string; user_id:string; author_name:string; author_role:Role; class_name:string; question:string; answer:string; status:string; error_message:string; created_at:string };
export default function AiHistory({role,onResume,disabled}:{role:Role;onResume:(id:string)=>void;disabled:boolean}) {
  const [items,setItems]=useState<Exchange[]>([]);
  const [name,setName]=useState('');
  const [who,setWho]=useState('');
  const [revision,setRevision]=useState(0);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [offset,setOffset]=useState(0);
  const [more,setMore]=useState(false);
  const [ownId,setOwnId]=useState('');
  const generation=useRef(0);
  useEffect(()=>{
    const version=++generation.current;
    const timer=window.setTimeout(()=>void (async()=>{
      setBusy(true);setError('');
      try {
        const auth=await supabase!.auth.getSession();
        const userId=auth.data.session?.user.id;
        if(!userId) throw new Error('กรุณาเข้าสู่ระบบใหม่');
        setOwnId(userId);
        let query=supabase!.from('ai_assistant_exchanges').select('id,conversation_id,user_id,author_name,author_role,class_name,question,answer,status,error_message,created_at').order('created_at',{ascending:false}).order('id',{ascending:false});
        if(role!=='teacher') query=query.eq('user_id',userId);
        if(role==='teacher' && who) query=query.eq('author_role',who);
        if(role==='teacher' && name.trim()) query=query.ilike('author_name',`%${name.trim().replace(/[\\%_]/g,'\\$&')}%`);
        const result=await query.range(offset,offset+49);
        if(result.error) throw result.error;
        if(version!==generation.current) return;
        const next=(result.data || []) as Exchange[];
        setItems(current=>offset ? [...current,...next.filter(n=>!current.some(c=>c.id===n.id))] : next);setMore(next.length===50);
      }catch {if(version===generation.current)setError('โหลดประวัติไม่สำเร็จ กรุณาลองใหม่');}
      finally {if(version===generation.current)setBusy(false);}
    })(),250);
    return ()=>{clearTimeout(timer);generation.current++;};
  },[role,name,who,offset,revision]);
  return <section className="ai-history">
    <div className="ai-history-filters">
      {role==='teacher' && <><label><Search aria-hidden/><input aria-label="ค้นหาชื่อผู้ใช้" placeholder="ค้นหาชื่อผู้ใช้" value={name} onChange={e=>{setName(e.target.value);setOffset(0);setItems([]);}} /></label><select aria-label="บทบาทผู้สนทนา" value={who} onChange={e=>{setWho(e.target.value);setOffset(0);setItems([]);}}><option value="">ทุกคน</option><option value="student">นักเรียน</option><option value="teacher">ครู</option></select></>}
      <button className="icon-button" title="โหลดประวัติใหม่" aria-label="โหลดประวัติใหม่" disabled={busy} onClick={()=>{setOffset(0);setRevision(r=>r+1);}}><RefreshCw aria-hidden/></button>
    </div>
    {error && <p role="alert" className="ai-error">{error}</p>}
    {!busy && !error && !items.length && <p className="ai-disclaimer">ยังไม่มีประวัติการสนทนา</p>}
    {items.map(item=><details className="ai-history-entry" key={item.id}><summary><span><strong>{item.author_name}</strong><small>{item.author_role==='teacher'?'ครู':'นักเรียน'}{item.class_name && ` · ${item.class_name}`} · {new Date(item.created_at).toLocaleString('th-TH')}</small><span className="ai-history-question">{item.question}</span></span><small>{item.status==='completed'?'ตอบแล้ว':item.status==='failed'?'ตอบไม่สำเร็จ':'ยังไม่มีคำตอบ'}</small></summary><div><strong>ข้อความที่ส่ง</strong><p>{item.question}</p><strong>คำตอบของ AI</strong><p>{item.status==='completed'?item.answer:item.error_message || 'คำขอนี้ยังไม่มีคำตอบที่บันทึกไว้'}</p>{item.user_id===ownId && <button className="template-button" disabled={disabled} onClick={()=>onResume(item.conversation_id)}>สนทนาต่อ</button>}</div></details>)}
    {busy && <p role="status">กำลังโหลดประวัติ…</p>}
    {more && <button className="template-button" disabled={busy} onClick={()=>setOffset(current=>current+50)}>โหลดประวัติเพิ่ม</button>}
  </section>;
}
