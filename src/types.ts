import type { LucideIcon } from "lucide-react";
export type Role = "teacher" | "student";
export type ViewKey = "home" | "materials" | "scores" | "work" | "students" | "profile";
export type MaterialType = "PDF" | "VIDEO" | "IMG";
export interface AppSession { role: Role; name: string; room: string; school: string; }
export interface NavItem { key: ViewKey; label: string; icon: LucideIcon; }
export interface Material { id: string; title: string; unit: string; level: string; type: MaterialType; date: string; image?: string; filePath?: string; accent: "green" | "amber" | "blue" | "coral"; }
export interface ScoreRow { id: string; studentId: string; name: string; score: number; maxScore: number; }
