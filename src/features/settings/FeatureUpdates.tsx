import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {Eye,Pencil,Plus,RefreshCw,Save,Trash2} from 'lucide-react';
import {supabase} from '../../lib/supabase';
import type {Role} from '../../types';
import {settingsChanged,type FeatureUpdate} from './settingsService';
import './settings.css';

const empty={title:'',body:'',audience:'student' as FeatureUpdate['audience'],enabled:false};
function UpdateDialog({item,onClose,busy=false,error='',preview=false}:{item:Pick<FeatureUpdate,'title'|'body'>;onClose:()=>void;busy?:boolean;error?:string;preview?:boolean}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close();},[]);
  return <dialog ref={ref} className="feature-dialog" aria-labelledby="feature-dialog-title" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}><h2 id="feature-dialog-title">{item.title}</h2><div className="feature-body">{item.body}</div>{error&&<p role="alert">{error}</p>}<div className="settings-actions"><button className="primary-button" disabled={busy} onClick={onClose}>{busy?'กำลังบันทึก':preview?'ปิดตัวอย่าง':'รับทราบ'}</button></div></dialog>;
}

export function FeatureUpdateManager() {
  const [items,setItems]=useState<FeatureUpdate[]>([]);
  const [draft,setDraft]=useState(empty);
  const [editing,setEditing]=useState<FeatureUpdate|null>(null);
  const [preview,setPreview]=useState<Pick<FeatureUpdate,'title'|'body'>|null>(null);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState('');
  async function load() {
    setLoading(true);
    try {const result=await supabase!.from('feature_updates').select('*').order('updated_at',{ascending:false});if(result.error)throw result.error;setItems(result.data as FeatureUpdate[]);}
    catch {setMessage('โหลดรายการไม่สำเร็จ กรุณาลองใหม่');}
    finally {setLoading(false);}
  }
  useEffect(()=>{void load();},[]);
  function reset() {setEditing(null);setDraft(empty);}
  async function save(event:FormEvent) {
    event.preventDefault();if(busy)return;setBusy(true);setMessage('');
    try {
      const data={...draft,title:draft.title.trim(),body:draft.body.trim()};
      if(!data.title||!data.body)throw new Error('empty');
      const query=editing?supabase!.from('feature_updates').update(data).eq('id',editing.id).eq('revision',editing.revision):supabase!.from('feature_updates').insert(data);
      const result=await query.select('*').single();if(result.error)throw result.error;
      setItems(current=>[result.data as FeatureUpdate,...current.filter(i=>i.id!==result.data.id)]);reset();settingsChanged();setMessage(data.enabled?'เผยแพร่แล้ว':'บันทึกฉบับร่างแล้ว');
    } catch {setMessage('บันทึกไม่สำเร็จ รายการอาจถูกแก้ไขแล้ว กรุณาโหลดใหม่และลองอีกครั้ง');}
    finally {setBusy(false);}
  }
  async function remove(item:FeatureUpdate) {
    if(busy||!window.confirm(`ลบป๊อปอัป “${item.title}” หรือไม่?`))return;
    setBusy(true);setMessage('');
    try {const result=await supabase!.from('feature_updates').delete().eq('id',item.id).select('id').single();if(result.error)throw result.error;setItems(current=>current.filter(i=>i.id!==item.id));if(editing?.id===item.id)reset();settingsChanged();setMessage('ลบแล้ว');}
    catch {setMessage('ลบไม่สำเร็จ กรุณาลองใหม่');}
    finally {setBusy(false);}
  }
  return <section className="teacher-settings"><h2>ป๊อปอัปฟีเจอร์ใหม่</h2><form onSubmit={save}><fieldset disabled={busy||loading}>
    <label>หัวข้อ<input required maxLength={120} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
    <label>ข้อความ<textarea required maxLength={4000} rows={4} value={draft.body} onChange={e=>setDraft({...draft,body:e.target.value})}/></label>
    <label>ผู้รับ<select value={draft.audience} onChange={e=>setDraft({...draft,audience:e.target.value as FeatureUpdate['audience']})}><option value="student">นักเรียน</option><option value="teacher">ครู</option><option value="all">ทุกคน</option></select></label>
    <label className="settings-check"><input type="checkbox" checked={draft.enabled} onChange={e=>setDraft({...draft,enabled:e.target.checked})}/>เปิดแสดงป๊อปอัป</label>
    <div className="settings-actions"><button className="primary-button" disabled={!draft.title.trim()||!draft.body.trim()}><Save aria-hidden/>{busy?'กำลังบันทึก':editing?'บันทึกการแก้ไข':'เพิ่มป๊อปอัป'}</button><button type="button" className="icon-button" aria-label="ดูตัวอย่างป๊อปอัป" title="ดูตัวอย่างป๊อปอัป" disabled={!draft.title.trim()||!draft.body.trim()} onClick={()=>setPreview(draft)}><Eye aria-hidden/></button>{editing&&<button type="button" onClick={reset}>ยกเลิกแก้ไข</button>}</div>
  </fieldset></form>{message&&<p role="status">{message}</p>}
  <div className="settings-actions"><h3>รายการป๊อปอัป</h3><button type="button" className="icon-button" title="โหลดใหม่" aria-label="โหลดรายการป๊อปอัปใหม่" disabled={busy||loading} onClick={()=>void load()}><RefreshCw aria-hidden/></button><button type="button" className="icon-button" title="รายการใหม่" aria-label="รายการใหม่" disabled={busy} onClick={reset}><Plus aria-hidden/></button></div>
  {loading?<p role="status">กำลังโหลด…</p>:!items.length?<p>ยังไม่มีรายการ</p>:items.map(item=><div className="settings-update" key={item.id}><div><strong>{item.title}</strong><small>{item.enabled?'เปิดแสดง':'ฉบับร่าง / ปิดแสดง'} · {item.audience==='all'?'ทุกคน':item.audience==='teacher'?'ครู':'นักเรียน'}</small></div><div className="settings-actions"><button className="icon-button" title="ดูตัวอย่าง" aria-label={`ดูตัวอย่าง ${item.title}`} onClick={()=>setPreview(item)}><Eye aria-hidden/></button><button className="icon-button" title="แก้ไข" aria-label={`แก้ไข ${item.title}`} disabled={busy} onClick={()=>{setEditing(item);setDraft({title:item.title,body:item.body,audience:item.audience,enabled:item.enabled});}}><Pencil aria-hidden/></button><button className="icon-button" title="ลบ" aria-label={`ลบ ${item.title}`} disabled={busy} onClick={()=>void remove(item)}><Trash2 aria-hidden/></button></div></div>)}
  {preview&&<UpdateDialog item={preview} preview onClose={()=>setPreview(null)}/>}</section>;
}

export function FeatureUpdatePopup({role}:{role:Role}) {
  const [pending,setPending]=useState<FeatureUpdate[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const userId=useRef('');
  const mounted=useRef(false);
  const generation=useRef(0);
  const load=useCallback(async()=>{
    const version=++generation.current;
    try {
      const auth=await supabase!.auth.getSession();const id=auth.data.session?.user.id;if(!id)return;
      const updates=await supabase!.from('feature_updates').select('*').eq('enabled',true).in('audience',['all',role]).order('updated_at',{ascending:false});
      const receipts=await supabase!.from('feature_update_receipts').select('update_id,revision').eq('user_id',id);
      if(updates.error||receipts.error)throw new Error('load');
      if(!mounted.current||version!==generation.current)return;
      userId.current=id;
      const seen=new Set((receipts.data||[]).map(r=>`${r.update_id}:${r.revision}`));
      setPending((updates.data as FeatureUpdate[]).filter(u=>!seen.has(`${u.id}:${u.revision}`)));
    } catch { /* Optional notices must not block classroom access on a network failure. */ }
  },[role]);
  useEffect(()=>{mounted.current=true;void load();const refresh=()=>{if(document.visibilityState==='visible')void load();};const timer=window.setInterval(refresh,60000);window.addEventListener('classroom-settings-changed',refresh);window.addEventListener('focus',refresh);return()=>{mounted.current=false;generation.current++;clearInterval(timer);window.removeEventListener('classroom-settings-changed',refresh);window.removeEventListener('focus',refresh);};},[load]);
  async function acknowledge() {
    if(busy||!pending[0])return;const item=pending[0];setBusy(true);setError('');generation.current++;
    try {
      const result=await supabase!.from('feature_update_receipts').insert({user_id:userId.current,update_id:item.id,revision:item.revision});
      if(result.error&&result.error.code!=='23505')throw result.error;
      if(mounted.current)setPending(current=>current.filter(i=>!(i.id===item.id&&i.revision===item.revision)));
    } catch {setError('บันทึกการรับทราบไม่สำเร็จ กรุณาลองใหม่');void load();}
    finally {setBusy(false);}
  }
  return pending[0]?<UpdateDialog key={`${pending[0].id}:${pending[0].revision}`} item={pending[0]} onClose={()=>void acknowledge()} busy={busy} error={error}/>:null;
}
