import type { StudentRecord } from "../types";
import { supabase } from "../lib/supabase";

interface StudentAccountResponse {
  ok: boolean;
  email?: string;
  accountCreatedAt?: string;
  mode?: "created" | "updated";
  message?: string;
}

export async function createOrResetStudentAccount(student: StudentRecord, password: string) {
  if (!supabase) throw new Error("ระบบยังไม่ได้เชื่อมต่อ Supabase");

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบครูใหม่");
  }

  const endpoint = String(import.meta.env.VITE_STUDENT_ACCOUNT_FUNCTION_URL || "/.netlify/functions/create-student-account").trim();
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        studentRecordId: student.id,
        studentCode: student.studentId.trim(),
        password: password.trim()
      })
    });
  } catch {
    throw new Error("เชื่อมต่อระบบสร้างบัญชีนักเรียนไม่ได้ กรุณาตรวจ Netlify Function");
  }

  if (response.status === 404) {
    throw new Error("ยังไม่พบ Netlify Function สำหรับสร้างบัญชีนักเรียน");
  }

  let payload: StudentAccountResponse;
  try {
    payload = await response.json() as StudentAccountResponse;
  } catch {
    throw new Error("ระบบสร้างบัญชีตอบกลับไม่ถูกต้อง");
  }

  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || "สร้างบัญชีนักเรียนไม่สำเร็จ");
  }

  return payload;
}
