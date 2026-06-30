import type { LucideIcon } from "lucide-react";

export type Role = "teacher" | "student";
export type ViewKey = "home" | "materials" | "scores" | "work" | "students" | "profile";
export type MaterialType = "PDF" | "VIDEO" | "IMG";
export type SubmissionStatus = "ยังไม่ส่ง" | "ส่งแล้ว" | "รอตรวจ" | "ตรวจแล้ว" | "ให้แก้ไข" | "ส่งช้า";
export type ScoreEntryStatus = "ungraded" | "scored" | "leave" | "expired" | "no_score";

export interface AppSession {
  role: Role;
  name: string;
  room: string;
  school: string;
  studentCode?: string;
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
  className: string;
  classroomId?: string;
  previewUrl?: string;
  accent: "green" | "amber" | "blue" | "coral";
}

export interface MaterialDownloadLog {
  id: string;
  materialId: string;
  materialTitle: string;
  studentId: string;
  studentName: string;
  className: string;
  classroomId?: string;
  downloadedAt: string;
}

export interface StudentHomeCard {
  id: string;
  title: string;
  description: string;
  url: string;
  classroomIds: string[];
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
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
  authEmail?: string;
  accountCreatedAt?: string;
}

export interface ScoreAssignment {
  id: string;
  assignmentGroupId?: string;
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
  status: ScoreEntryStatus;
  rawScore: number;
  rawMax: number;
  finalScore: number;
  finalMax: number;
}

export interface SubmissionRecord {
  id: string;
  assignmentId?: string;
  assignmentTitle: string;
  studentName: string;
  studentId: string;
  classroomId?: string;
  filePath?: string;
  previewUrl?: string;
  status: SubmissionStatus;
  submittedAt: string;
  rawScore: number;
  rawMax: number;
  finalScore: number;
  finalMax: number;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  className: string;
  classroomId?: string;
  publishedAt: string;
}
