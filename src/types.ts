import type { LucideIcon } from "lucide-react";

export type Role = "teacher" | "student";
export type ViewKey = "home" | "materials" | "scores" | "work" | "students" | "profile";
export type MaterialType = "PDF" | "VIDEO" | "IMG";
export type SubmissionStatus = "ยังไม่ส่ง" | "ส่งแล้ว" | "รอตรวจ" | "ตรวจแล้ว" | "ให้แก้ไข" | "ส่งช้า";

export interface AppSession {
  role: Role;
  name: string;
  room: string;
  school: string;
}

export interface NavItem {
  key: ViewKey;
  label: string;
  icon: LucideIcon;
}

export interface Material {
  id: string;
  title: string;
  unit: string;
  level: string;
  type: MaterialType;
  date: string;
  filePath: string;
  accent: "green" | "amber" | "blue" | "coral";
}

export interface Classroom {
  id: string;
  academicYear: string;
  level: string;
  room: string;
  subject: string;
  displayName: string;
}

export interface StudentRecord {
  id: string;
  no: number;
  studentId: string;
  name: string;
  gender: string;
  className: string;
  classroomId?: string;
}

export interface ScoreAssignment {
  id: string;
  title: string;
  className: string;
  classroomId?: string;
  rawMax: number;
  finalMax: number;
  createdAt: string;
}

export interface ScoreEntry {
  id: string;
  assignmentId: string;
  studentRecordId: string;
  studentId: string;
  rawScore: number;
  rawMax: number;
  finalScore: number;
  finalMax: number;
}

export interface SubmissionRecord {
  id: string;
  assignmentTitle: string;
  studentName: string;
  studentId: string;
  classroomId?: string;
  filePath?: string;
  status: SubmissionStatus;
  submittedAt: string;
  rawScore: number;
  rawMax: number;
  finalScore: number;
  finalMax: number;
}
