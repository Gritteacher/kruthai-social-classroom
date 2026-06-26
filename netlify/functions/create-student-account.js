import { createClient } from "@supabase/supabase-js";

const STUDENT_EMAIL_DOMAIN = "students.kruthai.local";
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
  return `${String(studentCode).trim().toLowerCase()}@${STUDENT_EMAIL_DOMAIN}`;
}

function defaultStudentPassword(studentCode) {
  return `${String(studentCode).trim()}@2569`;
}

async function findUserByEmail(admin, email) {
  for (let page = 1; page <= 10; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw new Error(result.error.message);
    const user = result.data?.users?.find((item) => item.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (!result.data?.users?.length || result.data.users.length < 1000) break;
  }
  return null;
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { ok: false, message: "Method not allowed" });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey) return json(500, { ok: false, message: "ยังไม่ได้ตั้งค่า Supabase URL/Anon Key ใน Netlify" });

  const token = event.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { ok: false, message: "กรุณาเข้าสู่ระบบครูก่อน" });

  const userClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const caller = await userClient.auth.getUser(token);
  if (caller.error || !caller.data?.user) return json(401, { ok: false, message: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่" });
  const metadataRole = caller.data.user.user_metadata?.role;
  const trustedTeacherEmail = caller.data.user.email === "teacher@example.com";
  if (!serviceRoleKey && metadataRole !== "teacher" && !trustedTeacherEmail) {
    return json(403, { ok: false, message: "เฉพาะบัญชีครูเท่านั้นที่สร้างบัญชีนักเรียนได้" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { ok: false, message: "ข้อมูลที่ส่งมาไม่ถูกต้อง" });
  }

  const studentCode = String(body.studentCode || "").trim();
  const fullName = String(body.fullName || "").trim();
  const className = String(body.className || "").trim();
  const classroomId = body.classroomId || null;
  const studentRecordId = body.studentRecordId || null;
  const password = String(body.password || defaultStudentPassword(studentCode)).trim();
  if (!studentCode || !fullName) return json(400, { ok: false, message: "ต้องมีรหัสนักเรียนและชื่อ-นามสกุล" });
  if (password.length < 6) return json(400, { ok: false, message: "รหัสผ่านเริ่มต้นต้องมีอย่างน้อย 6 ตัวอักษร" });

  const email = studentCodeToEmail(studentCode);
  const metadata = {
    role: "student",
    full_name: fullName,
    student_code: studentCode,
    class_name: className,
    school_name: "โรงเรียนเทพศิรินทร์ นนทบุรี"
  };

  if (!serviceRoleKey) {
    const signup = await userClient.auth.signUp({ email, password, options: { data: metadata } });
    if (signup.error) {
      return json(409, {
        ok: false,
        message: "สร้างบัญชีไม่สำเร็จ: ต้องเพิ่ม SUPABASE_SERVICE_ROLE_KEY ใน Netlify เพื่อสร้างหรือรีเซ็ตรหัสนักเรียนจากรายชื่อ"
      });
    }
    return json(200, {
      ok: true,
      email,
      mode: "signup",
      message: "สร้างบัญชีแล้ว หาก Supabase เปิดยืนยันอีเมลอยู่ ให้เพิ่ม SUPABASE_SERVICE_ROLE_KEY เพื่อยืนยันบัญชีอัตโนมัติ"
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const profile = await admin.from("profiles").select("role").eq("id", caller.data.user.id).maybeSingle();
  const callerRole = profile.data?.role || caller.data.user.user_metadata?.role;
  if (callerRole !== "teacher" && !trustedTeacherEmail) {
    return json(403, { ok: false, message: "เฉพาะบัญชีครูเท่านั้นที่สร้างบัญชีนักเรียนได้" });
  }

  try {
    const existing = await findUserByEmail(admin, email);
    const userResult = existing
      ? await admin.auth.admin.updateUserById(existing.id, { password, user_metadata: metadata, email_confirm: true })
      : await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: metadata });
    if (userResult.error) return json(400, { ok: false, message: userResult.error.message });

    const userId = userResult.data.user.id;
    await admin.from("profiles").upsert({
      id: userId,
      full_name: fullName,
      role: "student",
      student_code: studentCode,
      class_name: className,
      school_name: "โรงเรียนเทพศิรินทร์ นนทบุรี"
    }, { onConflict: "id" });

    if (studentRecordId) {
      await admin
        .from("students")
        .update({ auth_email: email, account_created_at: new Date().toISOString() })
        .eq("id", studentRecordId);
    }

    return json(200, {
      ok: true,
      email,
      mode: existing ? "updated" : "created",
      message: existing ? "รีเซ็ตรหัสบัญชีนักเรียนแล้ว" : "สร้างบัญชีนักเรียนแล้ว"
    });
  } catch (error) {
    return json(500, { ok: false, message: error.message || "สร้างบัญชีนักเรียนไม่สำเร็จ" });
  }
}
