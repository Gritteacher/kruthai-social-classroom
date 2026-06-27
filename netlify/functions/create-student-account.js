import { createClient } from "@supabase/supabase-js";

const STUDENT_EMAIL_DOMAIN = "students.kruthai.local";
const STUDENT_CODE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const headers = {
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json; charset=utf-8"
};

function json(statusCode, payload) {
  return { statusCode, headers, body: JSON.stringify(payload) };
}

function studentCodeToEmail(studentCode) {
  return `${studentCode.toLowerCase()}@${STUDENT_EMAIL_DOMAIN}`;
}

function defaultStudentPassword(studentCode) {
  return `${studentCode}@2569`;
}

function errorMessage(error, fallback) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/already.*registered|already exists|duplicate/i.test(message)) return "มีบัญชีรหัสนักเรียนนี้อยู่แล้ว";
  if (/password/i.test(message)) return "รหัสผ่านไม่ผ่านเงื่อนไขความปลอดภัย";
  return message || fallback;
}

async function findUserByEmail(admin, email) {
  for (let page = 1; page <= 10; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw new Error(result.error.message);
    const user = result.data?.users?.find((item) => item.email?.toLowerCase() === email);
    if (user) return user;
    if (!result.data?.users?.length || result.data.users.length < 1000) break;
  }
  return null;
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { ok: false, message: "รองรับเฉพาะคำขอ POST" });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { ok: false, message: "Netlify ยังไม่ได้ตั้งค่า Supabase URL หรือ Service Role Key" });
  }

  const token = event.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(401, { ok: false, message: "กรุณาเข้าสู่ระบบครูก่อน" });

  try {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const caller = await admin.auth.getUser(token);
    if (caller.error || !caller.data.user) {
      return json(401, { ok: false, message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" });
    }

    const profile = await admin
      .from("profiles")
      .select("role")
      .eq("id", caller.data.user.id)
      .maybeSingle();
    if (profile.error) {
      return json(500, { ok: false, message: "ตรวจสอบสิทธิ์ครูไม่สำเร็จ" });
    }
    if (profile.data?.role !== "teacher") {
      return json(403, { ok: false, message: "เฉพาะบัญชีครูเท่านั้นที่สร้างบัญชีนักเรียนได้" });
    }

    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { ok: false, message: "ข้อมูลที่ส่งมาไม่ถูกต้อง" });
    }

    const requestedStudentCode = String(body.studentCode || "").trim();
    const studentRecordId = String(body.studentRecordId || "").trim();
    const requestedPassword = String(body.password || "").trim();
    if (!STUDENT_CODE_PATTERN.test(requestedStudentCode)) {
      return json(400, { ok: false, message: "รหัสนักเรียนใช้ได้เฉพาะตัวอักษร ตัวเลข ขีดกลาง และขีดล่าง" });
    }
    if (!UUID_PATTERN.test(studentRecordId)) {
      return json(400, { ok: false, message: "ไม่พบรายการนักเรียนที่ต้องการสร้างบัญชี" });
    }

    const studentResult = await admin
      .from("students")
      .select("id, student_code, full_name, class_name, classroom_id")
      .eq("id", studentRecordId)
      .maybeSingle();
    if (studentResult.error) {
      return json(500, { ok: false, message: "ตรวจสอบรายชื่อนักเรียนไม่สำเร็จ" });
    }
    if (!studentResult.data || String(studentResult.data.student_code).trim() !== requestedStudentCode) {
      return json(404, { ok: false, message: "ไม่พบรหัสนักเรียนนี้ในรายชื่อ" });
    }

    const studentCode = String(studentResult.data.student_code).trim();
    const fullName = String(studentResult.data.full_name).trim();
    const className = String(studentResult.data.class_name || "").trim();
    const classroomId = studentResult.data.classroom_id || null;
    const password = requestedPassword || defaultStudentPassword(studentCode);
    if (password.length < 6) {
      return json(400, { ok: false, message: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" });
    }
    if (password.length > 128) {
      return json(400, { ok: false, message: "รหัสผ่านต้องไม่เกิน 128 ตัวอักษร" });
    }

    const email = studentCodeToEmail(studentCode);
    const metadata = {
      role: "student",
      full_name: fullName,
      student_code: studentCode,
      class_name: className,
      classroom_id: classroomId,
      school_name: "โรงเรียนเทพศิรินทร์ นนทบุรี"
    };

    const existing = await findUserByEmail(admin, email);
    const userResult = existing
      ? await admin.auth.admin.updateUserById(existing.id, { password, user_metadata: metadata, email_confirm: true })
      : await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: metadata });
    if (userResult.error || !userResult.data.user) {
      return json(400, { ok: false, message: errorMessage(userResult.error, "สร้างบัญชีนักเรียนไม่สำเร็จ") });
    }

    const profileResult = await admin.from("profiles").upsert({
      id: userResult.data.user.id,
      full_name: fullName,
      role: "student",
      student_code: studentCode,
      class_name: className,
      school_name: "โรงเรียนเทพศิรินทร์ นนทบุรี"
    }, { onConflict: "id" });
    if (profileResult.error) {
      return json(500, { ok: false, message: "สร้างบัญชีแล้ว แต่บันทึกโปรไฟล์นักเรียนไม่สำเร็จ" });
    }

    const accountCreatedAt = new Date().toISOString();
    const updateResult = await admin
      .from("students")
      .update({ auth_email: email, account_created_at: accountCreatedAt })
      .eq("id", studentRecordId)
      .eq("student_code", studentCode);
    if (updateResult.error) {
      return json(500, { ok: false, message: "สร้างบัญชีแล้ว แต่เชื่อมบัญชีกับรายชื่อไม่สำเร็จ" });
    }

    return json(200, {
      ok: true,
      email,
      accountCreatedAt,
      mode: existing ? "updated" : "created",
      message: existing ? "รีเซ็ตรหัสบัญชีนักเรียนแล้ว" : "สร้างบัญชีนักเรียนแล้ว"
    });
  } catch (error) {
    return json(500, { ok: false, message: errorMessage(error, "สร้างบัญชีนักเรียนไม่สำเร็จ") });
  }
}
