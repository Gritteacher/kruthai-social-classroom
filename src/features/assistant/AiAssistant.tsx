import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Send, Sparkles, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Classroom, Material, Role, StudentRecord } from '../../types';
import './assistant.css';

type ScoreWork = { title: string; score: number | null; max: number; status: string; submissionStatus: string; explanation: string | null };
type ScoreStudent = { name: string; total: number; max: number; available: number; target: { value: number; needed: number; possibleFromUnscored: boolean } | null; work: ScoreWork[] };
type Snapshot = { fetchedAt: string; students: ScoreStudent[]; count: number; average: number };
type Reply = { answer: string; snapshot?: Snapshot | null; source?: string | null; remaining: number };
type Message = { role: 'user' | 'assistant'; content: string; result?: Reply };
const statusLabels: Record<string,string> = { ungraded:'ยังไม่ให้คะแนน',scored:'ให้คะแนนแล้ว',leave:'ลา',expired:'หมดเวลาส่ง',no_score:'ไม่มีคะแนน' };

export default function AiAssistant({ role, classrooms, students, materials }: { role: Role; classrooms: Classroom[]; students: StudentRecord[]; materials: Material[] }) {
  const [mode,setMode] = useState<'study'|'scores'>('study');
  const [classroomId,setClassroomId] = useState('');
  const [studentId,setStudentId] = useState('');
  const [materialId,setMaterialId] = useState('');
  const [target,setTarget] = useState('');
  const [draft,setDraft] = useState('');
  const [messages,setMessages] = useState<Message[]>([]);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [remaining,setRemaining] = useState<number>();
  const controller = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  useEffect(()=>{ log.current?.scrollTo({top:log.current.scrollHeight,behavior:'smooth'}); },[messages,busy]);
  function reset() { setMessages([]); setError(''); }
  async function send(event:FormEvent) {
    event.preventDefault();
    if (busy || !draft.trim()) return;
    if (mode === 'scores' && role === 'teacher' && !classroomId) { setError('กรุณาเลือกห้องเรียนก่อนถามคะแนน'); return; }
    setBusy(true); setError('');
    const question = draft.trim();
    controller.current = new AbortController();
    const timeout = window.setTimeout(()=>controller.current?.abort(),60000);
    try {
      const session = await supabase?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) throw new Error('กรุณาเข้าสู่ระบบใหม่');
      const response = await fetch('/.netlify/functions/ai-assistant',{
        method:'POST', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
        body:JSON.stringify({message:question,mode,classroomId,studentId,materialId,target:target === '' ? undefined : Number(target),history:messages.slice(-8).map(({role,content})=>({role,content}))}),
        signal:controller.current.signal,
      });
      const result = await response.json().catch(()=>null) as (Reply & {message?:string}) | null;
      if (!response.ok || !result?.answer) throw new Error(result?.message || 'ผู้ช่วย AI ตอบไม่สำเร็จ กรุณาลองใหม่');
      setMessages(current=>[...current,{role:'user',content:question},{role:'assistant',content:result.answer,result}]);
      setRemaining(result.remaining); setDraft('');
    } catch(cause) {
      if (!controller.current?.signal.aborted) setError(cause instanceof Error ? cause.message : 'ส่งคำถามไม่สำเร็จ');
      else setError('การตอบใช้เวลานานเกินไป กรุณาลองใหม่');
    } finally { clearTimeout(timeout); setBusy(false); }
  }
  const prompts = mode === 'scores' ? ['สรุปคะแนนปัจจุบันให้หน่อย','งานไหนยังไม่ได้คะแนนและงานไหนรอตรวจ'] : role === 'teacher' ? ['ช่วยร่างแบบฝึกหัดพร้อมเฉลยเรื่องเศรษฐกิจพอเพียง','ช่วยร่างเกณฑ์ให้คะแนนงานสังคมศึกษา'] : ['อธิบายเศรษฐกิจพอเพียงแบบเข้าใจง่าย','ช่วยถามคำถามทบทวนบทเรียนทีละข้อ'];
  return <div className="ai-page">
    <header className="ai-heading"><h1><Sparkles aria-hidden />ผู้ช่วย AI</h1><button className="icon-button" type="button" title="เริ่มบทสนทนาใหม่" aria-label="เริ่มบทสนทนาใหม่" disabled={busy || !messages.length} onClick={()=>{if(window.confirm('ล้างบทสนทนานี้และเริ่มใหม่หรือไม่?')) reset();}}><Trash2 aria-hidden /></button></header>
    <div className="ai-mode" role="tablist" aria-label="หัวข้อผู้ช่วย AI">{(['study','scores'] as const).map(value=><button key={value} type="button" role="tab" aria-selected={mode === value} disabled={busy} onClick={()=>{setMode(value);reset();}}>{value === 'study' ? 'ถามบทเรียน' : 'ถามคะแนน'}</button>)}</div>
    <div className="ai-filters">
      {mode === 'study' && <label>สื่ออ้างอิง<select aria-label="สื่ออ้างอิง" value={materialId} disabled={busy} onChange={e=>{setMaterialId(e.target.value);reset();}}><option value="">ความรู้ทั่วไป</option>{materials.filter(m=>m.type === 'PDF').map(m=><option key={m.id} value={m.id}>{m.title}</option>)}</select></label>}
      {mode === 'scores' && role === 'teacher' && <><label>ห้องเรียน<select aria-label="ห้องเรียน" value={classroomId} disabled={busy} onChange={e=>{setClassroomId(e.target.value);setStudentId('');reset();}}><option value="">เลือกห้องเรียน</option>{classrooms.map(c=><option value={c.id} key={c.id}>{c.displayName}</option>)}</select></label><label>นักเรียน<select aria-label="นักเรียน" value={studentId} disabled={busy || !classroomId} onChange={e=>{setStudentId(e.target.value);reset();}}><option value="">ภาพรวมทั้งห้อง</option>{students.filter(s=>s.classroomId === classroomId).map(s=><option key={s.id} value={s.id}>{s.no}. {s.name}</option>)}</select></label></>}
      {mode === 'scores' && <label className="ai-target">คะแนนเป้าหมาย<input type="number" min="0" max="10000" step="0.01" placeholder="เช่น 80" value={target} disabled={busy} onChange={e=>{setTarget(e.target.value);reset();}} /></label>}
    </div>
    <div className="ai-disclaimer">คำตอบจาก AI อาจคลาดเคลื่อน โปรดตรวจสอบกับครู · {mode === 'scores' ? 'ส่งข้อมูลคะแนนในขอบเขตนี้ให้ AI ช่วยอธิบาย โดยแก้คะแนนไม่ได้' : 'เมื่อเลือกสื่อ เนื้อหาจะถูกส่งให้ผู้ให้บริการ AI เพื่อช่วยตอบ'}{remaining !== undefined ? ` · เหลือ ${remaining} คำถามวันนี้` : ''}</div>
    <div className="ai-conversation" ref={log} role="log" aria-label="บทสนทนากับผู้ช่วย AI" aria-live="polite">
      {!messages.length && <div className="ai-empty"><Sparkles aria-hidden /><h2>{mode === 'scores' ? 'อยากทราบคะแนนส่วนไหนครับ' : 'วันนี้อยากเรียนรู้เรื่องอะไรครับ'}</h2><div>{prompts.map(prompt=><button type="button" key={prompt} disabled={busy} onClick={()=>setDraft(prompt)}>{prompt}</button>)}</div></div>}
      {messages.map((message,index)=><article className={`ai-message ${message.role}`} key={index}><strong>{message.role === 'user' ? 'คุณ' : 'ผู้ช่วย AI'}</strong><p>{message.content}</p>{message.result?.source && <small>สื่ออ้างอิง: {message.result.source}</small>}{message.result?.snapshot && <ScoreSnapshot snapshot={message.result.snapshot} />}</article>)}
      {busy && <div className="ai-pending" role="status">กำลังอ่านข้อมูลและเตรียมคำตอบ…</div>}
    </div>
    {error && <p className="ai-error" role="alert">{error}</p>}
    <form className="ai-compose" onSubmit={send}><textarea aria-label="คำถามถึงผู้ช่วย AI" rows={2} maxLength={2000} placeholder="พิมพ์คำถาม…" value={draft} disabled={busy} onChange={e=>setDraft(e.target.value)} /><button className="icon-button" type="submit" disabled={busy || !draft.trim()} title="ส่งคำถาม" aria-label="ส่งคำถาม"><Send aria-hidden /></button></form>
  </div>;
}

function ScoreSnapshot({snapshot}:{snapshot:Snapshot}) {
  return <section className="ai-score-snapshot"><h3>คะแนนจากระบบ</h3><small>{new Date(snapshot.fetchedAt).toLocaleString('th-TH')} · {snapshot.count} คน{snapshot.count > 1 ? ` · คะแนนเฉลี่ย ${snapshot.average}` : ''}</small>{snapshot.students.map((student,index)=><details key={index} open={snapshot.count === 1}><summary>{index+1}. {student.name}<strong>{student.total} / {student.max}</strong></summary>{student.target && <p>เป้าหมาย {student.target.value} · ต้องการอีก {student.target.needed} คะแนน{!student.target.possibleFromUnscored && ' · คะแนนของงานที่ยังไม่ให้คะแนนในระบบขณะนี้ไม่พอถึงเป้าหมาย'}</p>}<div className="ai-score-list">{student.work.map((work,i)=><div key={i}><span>{work.title}<small>{statusLabels[work.status] || work.status} · {work.submissionStatus}</small></span><strong>{work.score === null ? 'ยังไม่มีคะแนน' : `${work.score} / ${work.max}`}</strong></div>)}</div></details>)}</section>;
}
