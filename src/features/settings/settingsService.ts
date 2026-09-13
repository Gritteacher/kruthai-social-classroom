import { supabase } from '../../lib/supabase';
export type AiSettings = { name:string; student_enabled:boolean; score_access:boolean; tone:'friendly'|'formal'|'coach'; answer_length:'short'|'balanced'|'detailed'; instructions:string; daily_student_limit:number; daily_teacher_limit:number; history_retention_days:number };
export const defaultAiSettings:AiSettings = {name:'ผู้ช่วย AI',student_enabled:true,score_access:true,tone:'friendly',answer_length:'balanced',instructions:'',daily_student_limit:0,daily_teacher_limit:0,history_retention_days:90};
export type FeatureUpdate = {id:string; title:string; body:string; audience:'student'|'teacher'|'all'; enabled:boolean; display_frequency:'once'|'every_visit'; revision:number; updated_at:string};
export async function readAiSettings():Promise<AiSettings> {
  if(!supabase) throw new Error('ระบบยังไม่เชื่อมต่อ');
  const result=await supabase.from('ai_assistant_settings').select('*').eq('id',true).single();
  if(result.error) throw result.error;
  return {...defaultAiSettings,...result.data} as AiSettings;
}
export function settingsChanged() { window.dispatchEvent(new Event('classroom-settings-changed')); }
