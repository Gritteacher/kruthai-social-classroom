import type { HistoryCursor, ScoreSnapshot } from "./types";
const statuses: Record<string,string> = { ungraded:"ยังไม่กรอก", scored:"มีคะแนน", leave:"ลา", expired:"หมดเวลาส่ง", no_score:"ไม่มีคะแนน" };
export function statusLabel(value: string) { return statuses[value] || value; }
export function scoreLabel(value: ScoreSnapshot | null) {
  if (!value) return "ไม่มีรายการ";
  if (value.status !== "scored") return statusLabel(value.status);
  return `${value.final_score} / ${value.final_max}`;
}
export function rawLabel(value: ScoreSnapshot | null) {
  return value ? `ดิบ ${value.raw_score} / ${value.raw_max}` : "";
}
export function historyCursorFilter(cursor: HistoryCursor) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor.id)
    || !/^[0-9T:.+Z -]+$/.test(cursor.changed_at) || !Number.isFinite(Date.parse(cursor.changed_at))) {
    throw new Error("จุดเริ่มต้นประวัติไม่ถูกต้อง กรุณาโหลดใหม่");
  }
  return `changed_at.lt.${cursor.changed_at},and(changed_at.eq.${cursor.changed_at},id.lt.${cursor.id})`;
}
