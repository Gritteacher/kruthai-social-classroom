import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Send, Sparkles, Plus, History, MoreHorizontal, ArrowLeft, SlidersHorizontal, X, Settings, Info, ArrowUpRight } from 'lucide-react';
import { useChatViewport } from './useChatViewport';
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

export default function AiAssistant({ active = true, role, classrooms, students, materials }: { active?: boolean; role: Role; classrooms: Classroom[]; students: StudentRecord[]; materials: Material[] }) {
  const { pageRef, keyboardOpen } = useChatViewport(active);
  const contextDialog = useRef<HTMLDialogElement>(null);
  const infoDialog = useRef<HTMLDialogElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
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
  useEffect(() => {
    if (!active) { menu.current?.removeAttribute('open'); contextDialog.current?.close(); infoDialog.current?.close(); return; }
    const close = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) menu.current?.removeAttribute('open'); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && menu.current?.open) { menu.current.removeAttribute('open'); menu.current.querySelector('summary')?.focus(); } };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [active]);
  useEffect(() => { if (input.current) { input.current.style.height = 'auto'; input.current.style.height = `${Math.min(120, input.current.scrollHeight)}px`; } }, [draft,panel]);
  useEffect(()=>()=>controller.current?.abort(),[]);
  useEffect(()=>{ if(active) log.current?.scrollTo({top:log.current.scrollHeight,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}); },[messages,busy,panel,active]);
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
  const contextCount = [classroomId,studentId,materialId,target].filter(Boolean).length;
  return <div className="ai-page" ref={pageRef} data-keyboard={active && keyboardOpen}>
    <header className="ai-heading">
      <div className="ai-heading-title">{panel !== 'chat' && <button className="icon-button" aria-label="กลับไปแชท" title="กลับไปแชท" onClick={()=>setPanel('chat')}><ArrowLeft aria-hidden /></button>}<h1><Sparkles aria-hidden /><span>{panel==='history'?'ประวัติการสนทนา':panel==='settings'?'ตั้งค่า AI':settings.name}</span></h1></div>
      <div className="ai-heading-actions">
        <button className="icon-button" type="button" title="ประวัติการสนทนา" aria-label="ประวัติการสนทนา" disabled={busy || loadingHistory} onClick={()=>setPanel('history')}><History aria-hidden /></button>
        <button className="icon-button" type="button" title="เริ่มบทสนทนาใหม่" aria-label="เริ่มบทสนทนาใหม่" disabled={busy || loadingHistory} onClick={reset}><Plus aria-hidden /></button>
        <details className="ai-menu" ref={menu}><summary aria-label="เมนูผู้ช่วย AI" title="เมนูผู้ช่วย AI"><MoreHorizontal aria-hidden /></summary><div className="ai-menu-items">
          {role==='teacher'&&<button disabled={busy||loadingHistory} onClick={()=>{setPanel('settings');menu.current?.removeAttribute('open');}}><Settings aria-hidden />ตั้งค่า AI</button>}
          <button onClick={()=>{menu.current?.removeAttribute('open');infoDialog.current?.showModal();}}><Info aria-hidden />ข้อมูลการสนทนา</button>
        </div></details>
      </div>
    </header>
    {panel==='settings'&&role==='teacher'?<div className="ai-panel-scroll"><AiSettingsPanel/></div>:panel==='history' ? <div className="ai-panel-scroll"><AiHistory role={role} onResume={resume} disabled={loadingHistory} /></div> : role==='student'&&!settings.student_enabled?<p role="status">ครูปิดผู้ช่วย AI ชั่วคราว</p>:<>
    <dialog className="ai-dialog" ref={contextDialog} aria-labelledby="ai-context-title" onClick={e=>{if(e.target===e.currentTarget)contextDialog.current?.close();}}>
    <div className="ai-dialog-heading"><h2 id="ai-context-title">ข้อมูลประกอบ</h2><button className="icon-button" aria-label="ปิดข้อมูลประกอบ" title="ปิดข้อมูลประกอบ" onClick={()=>contextDialog.current?.close()}><X aria-hidden /></button></div>
    <div className="ai-filters">
      <label>สื่ออ้างอิง<select aria-label="สื่ออ้างอิง" value={materialId} disabled={busy} onChange={e=>setMaterialId(e.target.value)}><option value="">ไม่ระบุสื่อ</option>{materials.filter(m=>m.type === 'PDF').map(m=><option key={m.id} value={m.id}>{m.title}</option>)}</select></label>
      {role === 'teacher' && <><label>ห้องเรียน<select aria-label="ห้องเรียน" value={classroomId} disabled={busy} onChange={e=>{setClassroomId(e.target.value);setStudentId('');}}><option value="">ไม่ระบุห้อง</option>{classrooms.map(c=><option value={c.id} key={c.id}>{c.displayName}</option>)}</select></label><label>นักเรียน<select aria-label="นักเรียน" value={studentId} disabled={busy || !classroomId} onChange={e=>setStudentId(e.target.value)}><option value="">ภาพรวมทั้งห้อง</option>{students.filter(s=>s.classroomId === classroomId).map(s=><option key={s.id} value={s.id}>{s.no}. {s.name}</option>)}</select></label></>}
      <label className="ai-target">คะแนนเป้าหมาย<input type="number" min="0" max="10000" step="0.01" placeholder="เช่น 80" value={target} disabled={busy} onChange={e=>setTarget(e.target.value)} /></label>
    </div>
    <button className="ai-dialog-done" onClick={()=>contextDialog.current?.close()}>เสร็จสิ้น</button>
    </dialog>
    <div className="ai-conversation" ref={log} role="log" aria-label="บทสนทนากับผู้ช่วย AI" aria-live="polite">
      {!messages.length && <div className="ai-empty"><Sparkles aria-hidden /><h2>วันนี้ให้ช่วยอะไรดีครับ</h2><div>{prompts.map(prompt=><button type="button" key={prompt} disabled={busy} onClick={()=>{setDraft(prompt);input.current?.focus();}}><span>{prompt}</span><ArrowUpRight aria-hidden /></button>)}</div></div>}
      {messages.map((message,index)=><article className={`ai-message ${message.role}`} key={index}><strong>{message.role === 'user' ? 'คุณ' : settings.name}</strong><p>{message.content}</p>{message.result?.truncated && <small>คำตอบยังไม่จบ พิมพ์ “ต่อ” เพื่อให้ AI อธิบายต่อได้</small>}{message.result?.source && <small>สื่ออ้างอิง: {message.result.source}</small>}{message.result?.snapshot && <ScoreSnapshot snapshot={message.result.snapshot} />}</article>)}
      {busy && <div className="ai-pending" role="status">รับคำถามแล้ว กำลังเตรียมคำตอบ…</div>}
    </div>
    <div className="ai-compose-dock"><form className="ai-compose" onSubmit={send}>
      <textarea ref={input} aria-label="คำถามถึงผู้ช่วย AI" rows={1} maxLength={6000} placeholder="พิมพ์ข้อความ…" value={draft} disabled={loadingHistory} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer:fine)').matches){e.preventDefault();e.currentTarget.form?.requestSubmit();}}} />
      <div className="ai-compose-tools"><button className="ai-context-button" type="button" aria-haspopup="dialog" onClick={()=>contextDialog.current?.showModal()}><SlidersHorizontal aria-hidden /><span>ข้อมูลประกอบ{contextCount>0?` · ${contextCount}`:''}</span></button><button className="icon-button ai-send" type="submit" disabled={busy || loadingHistory || !draft.trim()} title="ส่งข้อความ" aria-label="ส่งข้อความ"><Send aria-hidden /></button></div>
    </form><small className="ai-compose-note">AI อาจตอบผิดได้ ควรตรวจสอบข้อมูลสำคัญ</small></div>
    </>}
    {error && <p className="ai-error" role="alert">{error}</p>}
    <dialog className="ai-dialog" ref={infoDialog} aria-labelledby="ai-info-title"><div className="ai-dialog-heading"><h2 id="ai-info-title">ข้อมูลการสนทนา</h2><button className="icon-button" aria-label="ปิดข้อมูลการสนทนา" onClick={()=>infoDialog.current?.close()}><X aria-hidden /></button></div><p>คำถามและคำตอบถูกบันทึก ไม่ควรส่งรหัสผ่านหรือข้อมูลลับ และควรตรวจสอบข้อมูลสำคัญจากคำตอบของ AI</p></dialog>
  </div>;
}

function ScoreSnapshot({snapshot}:{snapshot:Snapshot}) {
  return <section className="ai-score-snapshot"><h3>คะแนนจากระบบ</h3><small>{new Date(snapshot.fetchedAt).toLocaleString('th-TH')} · {snapshot.count} คน{snapshot.count > 1 ? ` · คะแนนเฉลี่ย ${snapshot.average}` : ''}</small>{snapshot.students.map((student,index)=><details key={index} open={snapshot.count === 1}><summary>{index+1}. {student.name}<strong>{student.total} / {student.max}</strong></summary>{student.target && <p>เป้าหมาย {student.target.value} · ต้องการอีก {student.target.needed} คะแนน{!student.target.possibleFromUnscored && ' · คะแนนของงานที่ยังไม่ให้คะแนนในระบบขณะนี้ไม่พอถึงเป้าหมาย'}</p>}<div className="ai-score-list">{student.work.map((work,i)=><div key={i}><span>{work.title}<small>{statusLabels[work.status] || work.status} · {work.submissionStatus}</small></span><strong>{work.score === null ? 'ยังไม่มีคะแนน' : `${work.score} / ${work.max}`}</strong></div>)}</div></details>)}</section>;
}
