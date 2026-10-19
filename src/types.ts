export type GradeLevel = '고1' | '고2' | '고3';
export type AcademicTrack = '미정/통합' | '인문·사회' | '자연·공학' | '예체능' | '융합·IT';
export type CounselingCategory =
  | '진로탐색'
  | '학과선택'
  | '고교학점제·과목선택'
  | '학생부·세특설계'
  | '학습·멘탈코칭';
export type SemesterTarget =
  | '고1 1학기'
  | '고1 2학기'
  | '고2 1학기'
  | '고2 2학기'
  | '고3 1학기'
  | '고3 2학기';
export type RoadmapCategory =
  | '선택과목'
  | '창체·동아리'
  | '세특·탐구주제'
  | '독서·프로젝트'
  | '진로체험';
export type RoadmapStatus = 'planned' | 'in_progress' | 'completed';

export interface StudentProfile {
  userId: string;
  displayName: string;
  grade: GradeLevel;
  track: AcademicTrack;
  hollandCode: string;
  favoriteSubjects: string;
  targetMajors: string;
  careerGoal: string;
  strengths: string;
  createdAt: string;
  updatedAt: string;
}

export interface CounselingSession {
  sessionId: string;
  ownerId: string;
  title: string;
  category: CounselingCategory;
  summary: string;
  messageCount: number;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface SuggestedRoadmapDraft {
  gradeTarget: SemesterTarget;
  category: RoadmapCategory;
  title: string;
  description: string;
  relatedMajor: string;
}

export interface ChatMessage {
  messageId: string;
  sessionId: string;
  ownerId: string;
  role: 'user' | 'assistant';
  content: string;
  recommendedMajors: string;
  actionItems: string;
  suggestedRoadmap?: SuggestedRoadmapDraft | null;
  createdAt: string;
}

export interface CareerRoadmapItem {
  roadmapId: string;
  ownerId: string;
  gradeTarget: SemesterTarget;
  category: RoadmapCategory;
  title: string;
  description: string;
  relatedMajor: string;
  status: RoadmapStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AptitudeReport {
  hollandCode: string;
  typeTitle: string;
  analysis: string;
  recommendedMajors: string[];
  recommendedElectives: string[];
  inquiryTopicIdea: string;
}
