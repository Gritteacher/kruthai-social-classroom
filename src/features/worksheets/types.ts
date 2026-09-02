export type WorksheetPageStatus =
  | "draft"
  | "submitted"
  | "returned"
  | "reviewed";
export type WorksheetTool = "pen" | "text" | "eraser";

export type WorksheetStroke = {
  id: string;
  kind: "stroke";
  points: number[];
  color: string;
  width: number;
};

export type WorksheetText = {
  id: string;
  kind: "text";
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
};

export type WorksheetAnnotation = WorksheetStroke | WorksheetText;

export interface Worksheet {
  id: string;
  title: string;
  description: string;
  filePath: string;
  originalFileName: string;
  pageCount: number;
  acceptingSubmissions: boolean;
  opensAt?: string;
  closesAt?: string;
  classroomIds: string[];
  createdAt: string;
}

export interface WorksheetPageAnswer {
  id: string;
  worksheetId: string;
  classroomId: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  pageNumber: number;
  annotations: WorksheetAnnotation[];
  status: WorksheetPageStatus;
  submittedAt?: string;
  reviewedAt?: string;
  updatedAt: string;
}

export interface WorksheetDraft {
  title: string;
  description: string;
  file: File | null;
  classroomIds: string[];
  acceptingSubmissions: boolean;
  opensAt: string;
  closesAt: string;
}
