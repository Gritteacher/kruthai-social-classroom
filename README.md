# ห้องเรียนสังคมครูไต๋

เว็บแอพห้องเรียนออนไลน์วิชาสังคมศึกษา ออกแบบจากไฟล์ PDF ต้นแบบให้พร้อมใช้งานกับ GitHub, Supabase และ Netlify

## Stack

- Vite + React + TypeScript
- Supabase Auth, Database และ Storage
- Netlify static deploy
- GitHub Actions สำหรับ build check

## ฟีเจอร์ในต้นแบบ

- Login และเลือกบทบาทครู/นักเรียน
- Dashboard ครูและนักเรียน
- คลังสื่อการสอนพร้อมตัวกรอง
- จัดการคะแนนแบบแก้ไขได้
- ส่งงานและอัปโหลดรายชื่อนักเรียนผ่าน Supabase Storage
- Mock demo mode เมื่อยังไม่ได้ตั้งค่า Supabase

## รันในเครื่อง

```bash
npm install
npm run dev
```

## ตั้งค่า Supabase

1. สร้าง Supabase project ใหม่
2. เปิด SQL editor แล้วรัน `database/supabase-schema.sql`
3. สร้าง user ใน Auth สำหรับครูและนักเรียน
4. เพิ่มค่า env จาก `.env.example`

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

## Deploy ด้วย GitHub และ Netlify

1. สร้าง repository บน GitHub แล้ว push โฟลเดอร์นี้ขึ้นไป
2. ใน Netlify เลือก Add new site จาก GitHub repository
3. Build command: `npm run build`
4. Publish directory: `dist`
5. เพิ่ม environment variables `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY`
6. Deploy
