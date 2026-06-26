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
2. เปิด SQL editor แล้วรัน `database/supabase-schema.sql`
3. สร้าง user ใน Auth สำหรับครู
4. เพิ่มค่า env จาก `.env.example`

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-private-service-role-key
```

`SUPABASE_SERVICE_ROLE_KEY` ใช้เฉพาะฝั่ง Netlify Function เพื่อให้ครูสร้าง/รีเซ็ตรหัสบัญชีนักเรียนจากหน้ารายชื่อได้ ห้ามนำค่านี้ไปใส่ในโค้ดหน้าเว็บหรือเผยแพร่ใน repository

## Deploy ด้วย GitHub และ Netlify

1. สร้าง repository บน GitHub แล้ว push โฟลเดอร์นี้ขึ้นไป
2. ใน Netlify เลือก Add new site จาก GitHub repository
3. Build command: `npm run build`
4. Publish directory: `dist`
5. เพิ่ม environment variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` และ `SUPABASE_SERVICE_ROLE_KEY`
6. Deploy
