# ห้องเรียนสังคมครูไต๋

เว็บแอพห้องเรียนออนไลน์วิชาสังคมศึกษา ออกแบบจากไฟล์ PDF ต้นแบบให้พร้อมใช้งานกับ GitHub, Supabase และ Netlify

## Stack

- Vite + React + TypeScript
- Supabase Auth, Database และ Storage
- Netlify static deploy + Functions
- GitHub Actions สำหรับ build check

## ฟีเจอร์ในต้นแบบ

- Login และเลือกบทบาทครู/นักเรียน
- Dashboard ครูและนักเรียน
- คลังสื่อการสอนพร้อมตัวกรอง
- จัดการคะแนนแบบแก้ไขได้
- ส่งงานและอัปโหลดรายชื่อนักเรียนผ่าน Supabase Storage
- ใช้งานจริงผ่าน Supabase เท่านั้น หากยังไม่ได้ตั้งค่า env ระบบจะไม่เข้าสู่ระบบจำลอง

## รันในเครื่อง

```bash
npm install
npm run dev
```

## ตั้งค่า Supabase

1. สร้าง Supabase project ใหม่
2. เปิด SQL editor แล้วรัน `database/supabase-schema.sql` ทั้งไฟล์ทุกครั้งที่มีการอัปเดต schema
3. สร้าง user ใน Auth สำหรับครู
4. เพิ่มค่า env จาก `.env.example`

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-private-service-role-key
```

`SUPABASE_SERVICE_ROLE_KEY` ใช้เฉพาะฝั่ง Netlify Function เพื่อให้ครูสร้าง/รีเซ็ตรหัสบัญชีนักเรียนจากหน้ารายชื่อได้ ห้ามนำค่านี้ไปใส่ในโค้ดหน้าเว็บหรือเผยแพร่ใน repository

หากเปิด frontend จาก GitHub Pages ให้ตั้ง Repository Variable ชื่อ `VITE_STUDENT_ACCOUNT_FUNCTION_URL` เป็น URL เต็มของ Netlify Function ที่ deploy แล้ว ค่านี้เป็น URL สาธารณะ ไม่ใช่ secret และไม่จำเป็นเมื่อเปิดเว็บจาก Netlify

RLS และ Storage policies ใน `database/supabase-schema.sql` เป็นแหล่งอ้างอิงปัจจุบัน ไฟล์ `database/production-patch-2026-06-26.sql` เป็นไฟล์เก่าที่เลิกใช้แล้ว

## Deploy ด้วย GitHub และ Netlify

1. สร้าง repository บน GitHub แล้ว push โฟลเดอร์นี้ขึ้นไป
2. ใน Netlify เลือก Add new site จาก GitHub repository
3. Build command: `npm run build`
4. Publish directory: `dist`
5. เพิ่ม environment variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` และ `SUPABASE_SERVICE_ROLE_KEY`
6. Deploy

การสร้างหรือรีเซ็ตรหัสบัญชีนักเรียนต้องทำผ่าน Netlify Function จึงใช้งานไม่ได้จาก static hosting ที่ไม่มี `/.netlify/functions/create-student-account` ส่วนหน้าเว็บและฟีเจอร์ที่เรียก Supabase โดยตรงยังเปิดบน GitHub Pages ได้ตามปกติ

## ตรวจสอบก่อน Deploy

```bash
npm ci
npm run typecheck
npm run build
```

ตรวจให้แน่ใจว่า `SUPABASE_SERVICE_ROLE_KEY` อยู่ใน Netlify เท่านั้น และไม่ใช้ชื่อตัวแปรที่ขึ้นต้นด้วย `VITE_` สำหรับ secret นี้
