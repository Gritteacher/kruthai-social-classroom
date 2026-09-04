import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Send, Sparkles, Plus } from 'lucide-react';
import AiHistory from './AiHistory';
import {waitForAssistantReply} from './assistantReply';
import AiSettingsPanel from '../settings/AiSettingsPanel';
import {defaultAiSettings,readAiSettings} from '../settings/settingsService';
import { supabase } from '../../lib/supabase';
import type { Classroom, Material, Role, StudentRecord } from '../../types';
import './assistant.css';

type ScoreWork = { title: string; score: number | null; max: number; status: string; submissionStatus: string; explanation: string | null };
type ScoreStudent = { name: string; total: number; max: number; available: number; target: { value: number; needed: number; possibleFromUnscored: boolean } | null; work: ScoreWork[] };
type Snapshot = { fetchedAt: string; students: ScoreStudent[]; count: number; average: number };
type Reply = { answer: string; snapshot?: Snapshot | null; source?: string | null; truncated?: boolean };
type Message = { role: 'user' | 'assistant'; content: string; result?: Reply };
const statusLabels: Record<string,string> = { ungraded:'ยังไม่ให้คะแนน',scored:'ให้คะแนนแล้ว',leave:'ลา',expired:'หมดเวลาส่ง',no_score:'ไม่มีคะแนน' };

export default function AiAssistant({ role, classrooms, students, materials }: { role: Role; classrooms: Classroom[]; students: StudentRecord[]; materials: Material[] }) {
  const [panel,setPanel] = useState<'chat'|'history'|'settings'>('chat');
  const [settings,setSettings] = useState(defaultAiSettings);
  useEffect(()=>{let active=true;const refresh=()=>{void readAiSettings().then(value=>{if(active)setSettings(value);}).catch(()=>{});};refresh();window.addEventListener('classroom-settings-changed',refresh);window.addEventListener('focus',refresh);return()=>{active=false;window.removeEventListener('classroom-settings-changed',refresh);window.removeEventListener('focus',refresh);};},[]);
  const [conversationId,setConversationId] = useState<string>(()=>crypto.randomUUID());
  const [loadingHistory,setLoadingHistory] = useState(false);
  const [classroomId,setClassroomId] = useState('');
  const [studentId,setStudentId] = useState('');
  const [materialId,setMaterialId] = useState('');
  const [target,setTarget] = useState('');
  const [draft,setDraft] = useState('');
  const [messages,setMessages] = useState<Message[]>([]);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  useEffect(()=>{ log.current?.scrollTo({top:log.current.scrollHeight,behavior:'smooth'}); },[messages,busy]);
  function reset() { setConversationId(crypto.randomUUID()); setMessages([]); setDraft(''); setError(''); setPanel('chat'); }
  async function resume(id:string) {
    setLoadingHistory(true); setError('');
    try {
      const auth = await supabase!.auth.getSession();
      const userId = auth.data.session?.user.id;
      if (!userId) throw new Error('กรุณาเข้าสู่ระบบใหม่');
      const result = await supabase!.from('ai_assistant_exchanges').select('question,answer,status,error_message,response_data')
        .eq('user_id',userId).eq('conversation_id',id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(100);
      if(result.error) throw result.error;
      const history:Message[] = (result.data || []).slice().reverse().flatMap(row=>[
        {role:'user' as const,content:String(row.question)},
        {role:'assistant' as const,content:row.status === 'completed' ? String(row.answer) : row.status === 'failed' ? String(row.error_message) : 'คำขอนี้ยังไม่มีคำตอบ ลองส่งใหม่ได้',result:row.status === 'completed' ? {answer:String(row.answer),...(row.response_data as Omit<Reply,'answer'> || {})} : undefined}
      ]);
      setConversationId(id); setMessages(history); setPanel('chat'); setDraft('');
    } catch { setError('โหลดบทสนทนาไม่สำเร็จ กรุณาลองใหม่'); }
    finally { setLoadingHistory(false); }
  }
  async function send(event:FormEvent) {
    event.preventDefault();
    if (busy || loadingHistory || !draft.trim()) return;
    setBusy(true); setError('');
    const question = draft.trim();
    setMessages(current=>[...current,{role:'user',content:question}]); setDraft('');
    controller.current = new AbortController();
    const timeout = window.setTimeout(()=>controller.current?.abort(),240000);
    try {
      const session = await supabase?.auth.getSession();
      const token = session?.data.session?.access_token;
      const userId=session?.data.session?.user.id;
      if (!token||!userId) throw new Error('กรุณาเข้าสู่ระบบใหม่');
      const requestId=crypto.randomUUID();
      const response = await fetch('/.netlify/functions/ai-assistant',{
        method:'POST', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
        body:JSON.stringify({message:question,mode:'chat',background:true,conversationId,requestId,classroomId,studentId,materialId,target:target === '' ? undefined : Number(target)}),
        signal:controller.current.signal,
      }).catch(cause=>{if(controller.current?.signal.aborted)throw cause;return null;});
      let result = await response?.json().catch(()=>null) as (Reply & {message?:string}) | null;
      if(response?.status===202||!response||(!response.ok&&!result?.message)) {
        result=await waitForAssistantReply(requestId,userId,controller.current.signal) as Reply;
      } else if(!response.ok||!result?.answer) {
        throw new Error(result?.message||'ไม่ได้รับคำตอบที่ถูกต้องจากเซิร์ฟเวอร์ กรุณาลองใหม่');
      }
      if(!result?.answer)throw new Error('ยังไม่มีคำตอบ กรุณาตรวจประวัติการสนทนา');
      setMessages(current=>[...current,{role:'assistant',content:result.answer,result}]);
    } catch(cause) {
      if (!controller.current?.signal.aborted) setError(cause instanceof Error ? cause.message : 'ส่งคำถามไม่สำเร็จ');
      else setError('การตอบใช้เวลานานกว่าปกติ สามารถตรวจคำตอบภายหลังในประวัติการสนทนา');
    } finally { clearTimeout(timeout); setBusy(false); }
  }
  const prompts = role === 'teacher' ? ['ช่วยคิดไอเดียกิจกรรมในห้องเรียน','ช่วยวางแผนงานสัปดาห์นี้'] : ['ช่วยวางแผนอ่านหนังสือให้หน่อย','ตอนนี้ฉันได้กี่คะแนนแล้ว'];
  return <div className="ai-page">
    <header className="ai-heading"><h1><Sparkles aria-hidden />{settings.name}</h1><button className="icon-button" type="button" title="เริ่มบทสนทนาใหม่" aria-label="เริ่มบทสนทนาใหม่" disabled={busy || loadingHistory} onClick={reset}><Plus aria-hidden /></button></header>
    <div className="ai-mode" role="tablist" aria-label="ผู้ช่วย AI"><button role="tab" aria-selected={panel==='chat'} disabled={busy || loadingHistory} onClick={()=>setPanel('chat')}>แชท</button><button role="tab" aria-selected={panel==='history'} disabled={busy || loadingHistory} onClick={()=>setPanel('history')}>{role==='teacher' ? 'ประวัติการสนทนา' : 'ประวัติของฉัน'}</button>{role==='teacher'&&<button role="tab" aria-selected={panel==='settings'} disabled={busy||loadingHistory} onClick={()=>setPanel('settings')}>ตั้งค่า</button>}</div>
    <div className="ai-disclaimer">คำถามและคำตอบถูกบันทึก · ไม่ควรส่งรหัสผ่านหรือข้อมูลลับ · AI อาจตอบผิดได้</div>
    {panel==='settings'&&role==='teacher'?<AiSettingsPanel/>:panel==='history' ? <AiHistory role={role} onResume={resume} disabled={loadingHistory} /> : role==='student'&&!settings.student_enabled?<p role="status">ครูปิดผู้ช่วย AI ชั่วคราว</p>:<>
    <details className="ai-context"><summary>ข้อมูลประกอบ</summary>
    <div className="ai-filters">
      <label>สื่ออ้างอิง<select aria-label="สื่ออ้างอิง" value={materialId} disabled={busy} onChange={e=>setMaterialId(e.target.value)}><option value="">ไม่ระบุสื่อ</option>{materials.filter(m=>m.type === 'PDF').map(m=><option key={m.id} value={m.id}>{m.title}</option>)}</select></label>
      {role === 'teacher' && <><label>ห้องเรียน<select aria-label="ห้องเรียน" value={classroomId} disabled={busy} onChange={e=>{setClassroomId(e.target.value);setStudentId('');}}><option value="">ไม่ระบุห้อง</option>{classrooms.map(c=><option value={c.id} key={c.id}>{c.displayName}</option>)}</select></label><label>นักเรียน<select aria-label="นักเรียน" value={studentId} disabled={busy || !classroomId} onChange={e=>setStudentId(e.target.value)}><option value="">ภาพรวมทั้งห้อง</option>{students.filter(s=>s.classroomId === classroomId).map(s=><option key={s.id} value={s.id}>{s.no}. {s.name}</option>)}</select></label></>}
      <label className="ai-target">คะแนนเป้าหมาย<input type="number" min="0" max="10000" step="0.01" placeholder="เช่น 80" value={target} disabled={busy} onChange={e=>setTarget(e.target.value)} /></label>
    </div>
    </details>
    <div className="ai-conversation" ref={log} role="log" aria-label="บทสนทนากับผู้ช่วย AI" aria-live="polite">
      {!messages.length && <div className="ai-empty"><Sparkles aria-hidden /><h2>วันนี้อยากคุยเรื่องอะไรครับ</h2><div>{prompts.map(prompt=><button type="button" key={prompt} disabled={busy} onClick={()=>setDraft(prompt)}>{prompt}</button>)}</div></div>}
      {messages.map((message,index)=><article className={`ai-message ${message.role}`} key={index}><strong>{message.role === 'user' ? 'คุณ' : settings.name}</strong><p>{message.content}</p>{message.result?.truncated && <small>คำตอบยังไม่จบ พิมพ์ “ต่อ” เพื่อให้ AI อธิบายต่อได้</small>}{message.result?.source && <small>สื่ออ้างอิง: {message.result.source}</small>}{message.result?.snapshot && <ScoreSnapshot snapshot={message.result.snapshot} />}</article>)}
      {busy && <div className="ai-pending" role="status">รับคำถามแล้ว กำลังเตรียมคำตอบ…</div>}
    </div>
    <form className="ai-compose" onSubmit={send}><textarea aria-label="คำถามถึงผู้ช่วย AI" rows={2} maxLength={6000} placeholder="พิมพ์ข้อความ…" value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer:fine)').matches){e.preventDefault();e.currentTarget.form?.requestSubmit();}}} /><button className="icon-button" type="submit" disabled={busy || !draft.trim()} title="ส่งข้อความ" aria-label="ส่งข้อความ"><Send aria-hidden /></button></form>
    </>}
    {error && <p className="ai-error" role="alert">{error}</p>}
  </div>;
}

function ScoreSnapshot({snapshot}:{snapshot:Snapshot}) {
  return <section className="ai-score-snapshot"><h3>คะแนนจากระบบ</h3><small>{new Date(snapshot.fetchedAt).toLocaleString('th-TH')} · {snapshot.count} คน{snapshot.count > 1 ? ` · คะแนนเฉลี่ย ${snapshot.average}` : ''}</small>{snapshot.students.map((student,index)=><details key={index} open={snapshot.count === 1}><summary>{index+1}. {student.name}<strong>{student.total} / {student.max}</strong></summary>{student.target && <p>เป้าหมาย {student.target.value} · ต้องการอีก {student.target.needed} คะแนน{!student.target.possibleFromUnscored && ' · คะแนนของงานที่ยังไม่ให้คะแนนในระบบขณะนี้ไม่พอถึงเป้าหมาย'}</p>}<div className="ai-score-list">{student.work.map((work,i)=><div key={i}><span>{work.title}<small>{statusLabels[work.status] || work.status} · {work.submissionStatus}</small></span><strong>{work.score === null ? 'ยังไม่มีคะแนน' : `${work.score} / ${work.max}`}</strong></div>)}</div></details>)}</section>;
}
