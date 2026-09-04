import {useEffect,useState,type FormEvent} from 'react';
import {Save} from 'lucide-react';
import {supabase} from '../../lib/supabase';
import {defaultAiSettings,readAiSettings,settingsChanged,type AiSettings} from './settingsService';
import './settings.css';

export default function AiSettingsPanel() {
  const [value,setValue]=useState<AiSettings>(defaultAiSettings);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [ready,setReady]=useState(false);
  async function load() {
    setLoading(true);setMessage('');
    try {setValue(await readAiSettings());setReady(true);}
    catch {setMessage('โหลดการตั้งค่าไม่สำเร็จ กรุณาลองใหม่');}
    finally {setLoading(false);}
  }
  useEffect(()=>{void load();},[]);
  async function save(event:FormEvent) {
    event.preventDefault();if(busy||!ready)return;setBusy(true);setMessage('');
    try {
      const result=await supabase!.from('ai_assistant_settings').update({name:value.name.trim(),student_enabled:value.student_enabled,score_access:value.score_access,tone:value.tone,answer_length:value.answer_length,instructions:value.instructions.trim()}).eq('id',true).select('id').single();
      if(result.error)throw result.error;
      settingsChanged();setMessage('บันทึกแล้ว มีผลกับคำถามถัดไป');
    } catch {setMessage('บันทึกไม่สำเร็จ กรุณาตรวจสิทธิ์ครูแล้วลองใหม่');}
    finally {setBusy(false);}
  }
  return <section className="teacher-settings"><h2>ตั้งค่าผู้ช่วย AI</h2>{loading?<p role="status">กำลังโหลด…</p>:!ready?<button onClick={()=>void load()}>ลองใหม่</button>:<form onSubmit={save}><fieldset disabled={busy}>
    <label>ชื่อผู้ช่วย<input required maxLength={60} value={value.name} onChange={e=>setValue({...value,name:e.target.value})}/></label>
    <div className="settings-grid"><label>น้ำเสียง<select aria-label="น้ำเสียง" value={value.tone} onChange={e=>setValue({...value,tone:e.target.value as AiSettings['tone']})}><option value="friendly">เป็นกันเอง</option><option value="formal">สุภาพเป็นทางการ</option><option value="coach">ผู้ช่วยฝึกคิด</option></select></label><label>ความยาวคำตอบ<select aria-label="ความยาวคำตอบ" value={value.answer_length} onChange={e=>setValue({...value,answer_length:e.target.value as AiSettings['answer_length']})}><option value="short">กระชับ</option><option value="balanced">พอดีกับคำถาม</option><option value="detailed">ละเอียด</option></select></label></div>
    <label className="settings-check"><input type="checkbox" checked={value.student_enabled} onChange={e=>setValue({...value,student_enabled:e.target.checked})}/>เปิดผู้ช่วย AI ให้นักเรียน</label>
    <label className="settings-check"><input type="checkbox" checked={value.score_access} onChange={e=>setValue({...value,score_access:e.target.checked})}/>ให้ AI อ่านคะแนนที่ผู้ถามมีสิทธิ์ดู</label>
    <label>แนวทางตอบเพิ่มเติม<textarea rows={5} maxLength={4000} value={value.instructions} onChange={e=>setValue({...value,instructions:e.target.value})}/></label>
    <button className="primary-button" disabled={!value.name.trim()}><Save aria-hidden/>{busy?'กำลังบันทึก':'บันทึกการตั้งค่า'}</button>
  </fieldset></form>}{message&&<p role="status">{message}</p>}</section>;
}
