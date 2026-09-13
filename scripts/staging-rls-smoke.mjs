import { createClient } from "@supabase/supabase-js";

const required = [
  "STAGING_SUPABASE_URL",
  "STAGING_SUPABASE_ANON_KEY",
  "STAGING_TEACHER_EMAIL",
  "STAGING_TEACHER_PASSWORD",
  "STAGING_STUDENT_EMAIL",
  "STAGING_STUDENT_PASSWORD",
];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
}

function client() {
  return createClient(process.env.STAGING_SUPABASE_URL, process.env.STAGING_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signIn(email, password) {
  const supabase = client();
  const result = await supabase.auth.signInWithPassword({ email, password });
  if (result.error || !result.data.user) throw result.error || new Error(`Login failed for ${email}`);
  return { supabase, user: result.data.user };
}

const teacher = await signIn(process.env.STAGING_TEACHER_EMAIL, process.env.STAGING_TEACHER_PASSWORD);
const teacherProfile = await teacher.supabase.from("profiles").select("id,role").eq("id", teacher.user.id).single();
if (teacherProfile.error || teacherProfile.data?.role !== "teacher") throw teacherProfile.error || new Error("Staging teacher profile is invalid");
const teacherRooms = await teacher.supabase.from("classrooms").select("id").limit(1);
if (teacherRooms.error) throw teacherRooms.error;
await teacher.supabase.auth.signOut();

const student = await signIn(process.env.STAGING_STUDENT_EMAIL, process.env.STAGING_STUDENT_PASSWORD);
const profiles = await student.supabase.from("profiles").select("id,role,student_code");
if (profiles.error) throw profiles.error;
if (profiles.data.length !== 1 || profiles.data[0].id !== student.user.id || profiles.data[0].role !== "student") {
  throw new Error("Student profile RLS returned records outside the current account");
}
const roster = await student.supabase.from("students").select("student_code");
if (roster.error) throw roster.error;
if (roster.data.some((row) => row.student_code !== profiles.data[0].student_code)) {
  throw new Error("Student roster RLS returned another student's record");
}
const scores = await student.supabase.from("score_entries").select("student_code");
if (scores.error) throw scores.error;
if (scores.data.some((row) => row.student_code !== profiles.data[0].student_code)) {
  throw new Error("Score RLS returned another student's record");
}
await student.supabase.auth.signOut();
console.log("Staging login and read-only RLS smoke test passed.");
