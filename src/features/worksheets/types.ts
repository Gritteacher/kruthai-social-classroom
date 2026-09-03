export type WorksheetPageStatus =
  | "draft"
  | "submitted"
  | "returned"
  | "reviewed";
export type WorksheetStroke = {
  id: string;
  kind: "stroke";
  type?: never;
  points: number[];
  pressures?: number[];
  color: string;
  width: number;
};

export type WorksheetText = {
  id: string;
  kind: "text";
  type?: never;
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
};

export type WorksheetSceneElement = {
  id: string;
  type: string;
  kind?: never;
  [key: string]: unknown;
};

export type WorksheetAnnotation =
  | WorksheetStroke
  | WorksheetText
  | WorksheetSceneElement;

export type WorksheetCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WorksheetPageView = {
  rotation: number;
  crop: WorksheetCrop;
};

export interface Worksheet {
  id: string;
  title: string;
  description: string;
  filePath: string;
  originalFileName: string;
  pageCount: number;
  pageSettings: Record<string, WorksheetPageView>;
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
  rotation: number;
  status: WorksheetPageStatus;
  submittedAt?: string;
  reviewedAt?: string;
  updatedAt: string;
}

export interface WorksheetTeacherPage {
  id: string;
  worksheetId: string;
  pageNumber: number;
  annotations: WorksheetAnnotation[];
  rotation: number;
  updatedAt: string;
}

export interface WorksheetScoreLink {
  id: string;
  worksheetId: string;
  pageNumber: number;
  assignmentGroupId: string;
  pageMaxScore: number;
  sortOrder: number;
}

export interface WorksheetPageGrade {
  id: string;
  answerId: string;
  scoreLinkId: string;
  score: number;
  feedback: string;
  gradedAt: string;
}

export type WorksheetAiReviewStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "confirmed"
  | "rejected";

export interface WorksheetAiSetting {
  id: string;
  worksheetId: string;
  pageNumber: number;
  enabled: boolean;
  rubric: string;
  minConfidence: number;
  updatedAt: string;
}

export interface WorksheetAiSuggestion {
  scoreLinkId: string;
  score: number;
  confidence: number;
  feedback: string;
}

export interface WorksheetAiReview {
  id: string;
  answerId: string;
  status: WorksheetAiReviewStatus;
  suggestions: WorksheetAiSuggestion[];
  overallConfidence: number;
  feedback: string;
  model: string;
  errorMessage: string;
  requestedAt: string;
  completedAt?: string;
}

export interface WorksheetAiSettingInput {
  enabled: boolean;
  rubric: string;
  minConfidence: number;
}

export interface WorksheetGradeInput {
  answerId: string;
  scoreLinkId: string;
  score: number;
  feedback?: string;
}

export interface WorksheetScoreLinkInput {
  assignmentGroupId: string;
  pageMaxScore: number;
  sortOrder: number;
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
