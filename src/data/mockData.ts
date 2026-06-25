import type { Material, ScoreRow } from "../types";
export const materials: Material[] = [
  { id: "m1", title: "ระบอบประชาธิปไตยในไทย", unit: "บทที่ 1", level: "ม.3", type: "PDF", date: "12 ต.ค. 67", accent: "green" },
  { id: "m2", title: "อารยธรรมลุ่มแม่น้ำโขง", unit: "บทที่ 3", level: "ม.2", type: "VIDEO", date: "10 ต.ค. 67", image: "/lesson-geography.png", accent: "blue" },
  { id: "m3", title: "พระพุทธศาสนากับสังคมไทย", unit: "บทที่ 2", level: "ม.1", type: "IMG", date: "8 ต.ค. 67", image: "/lesson-rattanakosin.png", accent: "coral" },
  { id: "m4", title: "ภูมิศาสตร์ทรัพยากรไทย", unit: "บทที่ 5", level: "ม.3", type: "PDF", date: "6 ต.ค. 67", image: "/lesson-geography.png", accent: "amber" }
];
export const scoreRows: ScoreRow[] = [
  { id: "s1", studentId: "65001", name: "กฤษฎา มาดี", score: 18, maxScore: 20 },
  { id: "s2", studentId: "65002", name: "จิรวัฒน์ รักเรียน", score: 14, maxScore: 20 },
  { id: "s3", studentId: "65003", name: "ชลดา สดใส", score: 20, maxScore: 20 }
];
export const studentScores = [
  { title: "ใบงานที่ 1: กฎหมายแพ่งและอาญา", date: "12 ต.ค. 67", score: 18, max: 20 },
  { title: "สอบกลางภาค: ภูมิศาสตร์ไทย", date: "10 ต.ค. 67", score: 34, max: 40 },
  { title: "ใบงานที่ 2: วัฒนธรรมและประเพณี", date: "8 ต.ค. 67", score: 8, max: 10 }
];
export const submissions = [
  { title: "ใบงานกฎหมายแพ่งและอาญา", student: "กฤษฎา มาดี", id: "65001", status: "รอตรวจ", date: "วันนี้ 09:15" },
  { title: "สรุปภูมิศาสตร์ไทย", student: "จิรวัฒน์ รักเรียน", id: "65002", status: "ส่งช้า", date: "เมื่อวาน 16:40" },
  { title: "แบบฝึกวัฒนธรรมไทย", student: "ชลดา สดใส", id: "65003", status: "ตรวจแล้ว", date: "12 ต.ค. 67" }
];
export const rosterPreview = [
  { no: 1, id: "65001", name: "กฤษฎา มาดี", gender: "ชาย" },
  { no: 2, id: "65002", name: "จิรนันท์ รักเรียน", gender: "หญิง" },
  { no: 3, id: "65003", name: "ชลดา ดีใจ", gender: "หญิง" }
];
