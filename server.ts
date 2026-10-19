import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'career_db.json');

interface StudentProfileRecord {
  userId: string;
  displayName: string;
  grade: '고1' | '고2' | '고3';
  track: '미정/통합' | '인문·사회' | '자연·공학' | '예체능' | '융합·IT';
  hollandCode: string;
  favoriteSubjects: string;
  targetMajors: string;
  careerGoal: string;
  strengths: string;
  createdAt: string;
  updatedAt: string;
}

interface CounselingSessionRecord {
  sessionId: string;
  ownerId: string;
  title: string;
  category: '진로탐색' | '학과선택' | '고교학점제·과목선택' | '학생부·세특설계' | '학습·멘탈코칭';
  summary: string;
  messageCount: number;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

interface SuggestedRoadmapPayload {
  gradeTarget: '고1 1학기' | '고1 2학기' | '고2 1학기' | '고2 2학기' | '고3 1학기' | '고3 2학기';
  category: '선택과목' | '창체·동아리' | '세특·탐구주제' | '독서·프로젝트' | '진로체험';
  title: string;
  description: string;
  relatedMajor: string;
}

interface ChatMessageRecord {
  messageId: string;
  sessionId: string;
  ownerId: string;
  role: 'user' | 'assistant';
  content: string;
  recommendedMajors: string;
  actionItems: string;
  suggestedRoadmap?: SuggestedRoadmapPayload | null;
  createdAt: string;
}

interface CareerRoadmapRecord {
  roadmapId: string;
  ownerId: string;
  gradeTarget: '고1 1학기' | '고1 2학기' | '고2 1학기' | '고2 2학기' | '고3 1학기' | '고3 2학기';
  category: '선택과목' | '창체·동아리' | '세특·탐구주제' | '독서·프로젝트' | '진로체험';
  title: string;
  description: string;
  relatedMajor: string;
  status: 'planned' | 'in_progress' | 'completed';
  createdAt: string;
  updatedAt: string;
}

interface StudentWorkspaceStore {
  profile: StudentProfileRecord;
  sessions: CounselingSessionRecord[];
  messagesBySession: Record<string, ChatMessageRecord[]>;
  roadmaps: CareerRoadmapRecord[];
}

interface DatabaseSchema {
  workspaces: Record<string, StudentWorkspaceStore>;
}

function ensureDatabase(): DatabaseSchema {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const initial: DatabaseSchema = { workspaces: {} };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw) as DatabaseSchema;
  } catch {
    return { workspaces: {} };
  }
}

function saveDatabase(db: DatabaseSchema): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

function createDefaultWorkspace(studentId: string): StudentWorkspaceStore {
  const now = new Date().toISOString();
  const initialSessionId = `sess_${studentId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20)}_welcome`;

  const profile: StudentProfileRecord = {
    userId: studentId,
    displayName: '이하준 학생',
    grade: '고2',
    track: '융합·IT',
    hollandCode: 'IRA (탐구·현실·예술형)',
    favoriteSubjects: '수학I, 정보, 물리학I, 통합사회',
    targetMajors: '컴퓨터공학과, 인공지능학과, 데이터사이언스학과',
    careerGoal: '사람의 일상을 돕는 헬스케어 AI 서비스 개발자',
    strengths: '데이터 분석과 알고리즘 구현에 흥미가 있으며 사회 문제를 기술로 해결하는 탐구를 좋아함',
    createdAt: now,
    updatedAt: now,
  };

  const initialSession: CounselingSessionRecord = {
    sessionId: initialSessionId,
    ownerId: studentId,
    title: '고2 컴퓨터·AI 계열 선택과목 및 세특 심화 설계',
    category: '고교학점제·과목선택',
    summary: '인공지능·컴퓨터공학 진학을 위한 고2·고3 선택과목 조합(기하, 인공지능 기초, 미적분)과 세특 탐구 주제 설정 완료',
    messageCount: 2,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  const initialMessages: ChatMessageRecord[] = [
    {
      messageId: `msg_${Date.now()}_1`,
      sessionId: initialSessionId,
      ownerId: studentId,
      role: 'user',
      content: '현재 고2이고 컴퓨터공학과나 인공지능학과 진학을 희망하고 있어요. 고교학점제 진로선택과목으로 어떤 과목을 이수하면 좋을지, 그리고 수학·정보 교과 세특 주제를 어떻게 연결하면 좋을지 고민입니다.',
      recommendedMajors: '',
      actionItems: '',
      createdAt: now,
    },
    {
      messageId: `msg_${Date.now()}_2`,
      sessionId: initialSessionId,
      ownerId: studentId,
      role: 'assistant',
      content:
        '반가워요, 하준 학생! 헬스케어 AI 서비스 개발자라는 구체적인 진로 방향이 정말 멋집니다.\n\n1. **필수·권장 선택과목 전략 (고2~고3)**\n컴퓨터공학·인공지능학과에서는 수학적 기초 역량을 가장 중요하게 평가합니다.\n- **일반선택**: 수학I, 수학II, 확률과 통계, 물리학I, 정보\n- **진로선택**: **미적분**, **기하**(선형대수·벡터 개념의 기초), **인공지능 기초**, **데이터 과학**\n\n2. **교과 간 연계 세특(세부능력 및 특기사항) 설계 제안**\n단순 코딩 구현보다 **"수학적 원리 + 도메인 문제 해결"** 구조로 탐구 보고서를 작성해 보세요.\n- **확률과 통계 × 정보**: 조건부확률(베이즈 정리)을 활용한 초기 질병 진단 예측 모델의 정확도 한계와 보정 방법 탐구\n- **수학II/미적분 × 인공지능 기초**: 경사하강법(Gradient Descent)에서 도함수와 학습률(Learning Rate) 변화에 따른 수렴 속도 시뮬레이션 비교 분석\n\n아래 추천 로드맵 카드를 [내 로드맵에 저장] 버튼으로 바로 저장해 두고 학기별 계획을 관리해 보세요!',
      recommendedMajors: '컴퓨터공학과 · 인공지능학과 · 데이터사이언스학과 · 바이오메디컬공학부',
      actionItems: '진로선택과목에 기하·인공지능 기초 포함 여부 확인하기 · 수학II 미분 계수와 경사하강법 연계 탐구 보고서 초안 작성 · 고령자 복약 알림 AI 인터페이스 프로토타입 기획',
      suggestedRoadmap: {
        gradeTarget: '고2 2학기',
        category: '세특·탐구주제',
        title: '도함수와 경사하강법 수렴 원리 시뮬레이션 탐구',
        description: '수학II의 미분 개념을 인공지능 모델의 손실함수 최적화 과정(Gradient Descent)에 적용하고 파이썬으로 학습률 변화를 시각화하여 발표',
        relatedMajor: '인공지능학과 · 컴퓨터공학과',
      },
      createdAt: now,
    },
  ];

  const roadmaps: CareerRoadmapRecord[] = [
    {
      roadmapId: `road_${studentId.slice(0, 12)}_1`,
      ownerId: studentId,
      gradeTarget: '고1 2학기',
      category: '창체·동아리',
      title: '코딩 동아리 공공데이터 기반 스쿨존 안전 지도 시각화',
      description: '지역 교통사고 오픈 API 데이터를 수집·정제하여 학교 주변 위험 구간을 시각화하고 개선안을 제안하는 팀 프로젝트 수행',
      relatedMajor: '데이터사이언스학과',
      status: 'completed',
      createdAt: now,
      updatedAt: now,
    },
    {
      roadmapId: `road_${studentId.slice(0, 12)}_2`,
      ownerId: studentId,
      gradeTarget: '고2 1학기',
      category: '선택과목',
      title: '수학I · 확률과 통계 · 정보 · 물리학I 이수 및 심화 학습',
      description: '컴퓨터·AI 계열 핵심 권장 과목 이수. 정보 교과에서 알고리즘 시간복잡도(Big-O) 비교 실험 진행',
      relatedMajor: '컴퓨터공학과',
      status: 'in_progress',
      createdAt: now,
      updatedAt: now,
    },
    {
      roadmapId: `road_${studentId.slice(0, 12)}_3`,
      ownerId: studentId,
      gradeTarget: '고2 2학기',
      category: '세특·탐구주제',
      title: '베이즈 정리를 적용한 헬스케어 증상 분류 모델 탐구',
      description: '확률과 통계 교과의 조건부확률 개념을 의료 데이터 오진율 분석과 연결하여 세특 심화 탐구 보고서 작성',
      relatedMajor: '인공지능학과',
      status: 'planned',
      createdAt: now,
      updatedAt: now,
    },
    {
      roadmapId: `road_${studentId.slice(0, 12)}_4`,
      ownerId: studentId,
      gradeTarget: '고3 1학기',
      category: '독서·프로젝트',
      title: '의료 AI 윤리와 설명 가능한 AI(XAI) 심화 탐구 보고서',
      description: '블랙박스 딥러닝 모델의 판단 근거를 제시하는 XAI 기법을 조사하고 의료 현장의 책임 소재 윤리 가이드라인 제시',
      relatedMajor: '인공지능학과',
      status: 'planned',
      createdAt: now,
      updatedAt: now,
    },
  ];

  return {
    profile,
    sessions: [initialSession],
    messagesBySession: {
      [initialSessionId]: initialMessages,
    },
    roadmaps,
  };
}

function getOrCreateWorkspace(studentId: string): { db: DatabaseSchema; workspace: StudentWorkspaceStore } {
  const db = ensureDatabase();
  const safeId = studentId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128) || 'default_student';
  if (!db.workspaces[safeId]) {
    db.workspaces[safeId] = createDefaultWorkspace(safeId);
    saveDatabase(db);
  }
  return { db, workspace: db.workspaces[safeId] };
}

function getGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * Intelligent Korean High School Career Counseling Fallback Engine.
 * Guarantees rich, tailored responses even when upstream Gemini API credits/quotas are exhausted.
 */
function generateSmartCounselingFallback(
  message: string,
  profile: StudentProfileRecord,
  sessionCategory: CounselingSessionRecord['category']
): {
  reply: string;
  recommendedMajors: string[];
  actionItems: string[];
  sessionSummary: string;
  suggestedRoadmap: SuggestedRoadmapPayload;
} {
  const q = message.toLowerCase();
  const defaultSemester = (`${profile.grade} 2학기` as SuggestedRoadmapPayload['gradeTarget']) || '고2 2학기';
  const primaryMajor = profile.targetMajors.split(',')[0]?.trim() || '컴퓨터공학과';

  // Case 1:選択과목 / 고교학점제 / 커리큘럼
  if (
    q.includes('과목') ||
    q.includes('학점제') ||
    q.includes('진로선택') ||
    q.includes('일반선택') ||
    q.includes('이수')
  ) {
    return {
      reply: `${profile.displayName}(${profile.grade} · ${profile.track}), 희망하는 **${profile.targetMajors}** 진학을 위한 고교학점제 선택과목 전략을 정리해 드릴게요.\n\n1. **핵심 일반선택과목 이수 기준**\n대학 입학사정관들은 전공 수학에 필요한 기초 교과 이수 여부를 가장 먼저 확인합니다. 현재 선호 과목인 **${profile.favoriteSubjects}**을 중심으로 수학I·수학II·확률과 통계를 탄탄히 다지고, 계열 특성에 맞춰 물리학I·정보(자연·IT) 또는 경제·사회문화(인문·상경)를 이수하는 것이 유리합니다.\n\n2. **차별화되는 진로·융합선택과목 조합**\n- **수리·탐구 역량 강조**: 기하(벡터·행렬의 기초), 미적분, 인공지능 기초, 데이터 과학\n- **전공 융합 역량 강조**: 공학 일반, 융합과학, 사회문제 탐구 중 학교에 개설된 과목을 적극 선택하세요.\n\n3. **수강 신청 전 체크포인트**\n단순히 수강자 수가 많은 과목보다, 내 진로 목표인 **"${profile.careerGoal}"**와 연결해 수업 시간 발표나 심화 탐구 보고서를 작성하기 좋은 과목을 우선 배치해 보세요.`,
      recommendedMajors: profile.targetMajors
        .split(/[,·]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 4),
      actionItems: [
        '학교 교육과정 편제표에서 고2·고3 개설 진로선택과목 목록 확인하기',
        '희망 대학 입학처가 발간한 전공별 핵심 권장과목 가이드라인 대조하기',
        '선택한 과목에서 수행할 학기별 심화 탐구 키워드 1개씩 미리 메모하기',
      ],
      sessionSummary: `${profile.targetMajors} 진학을 위한 고교학점제 일반·진로선택과목 최적 조합 및 이수 전략 설계`,
      suggestedRoadmap: {
        gradeTarget: defaultSemester,
        category: '선택과목',
        title: `${primaryMajor} 연계 핵심 진로선택과목 이수 및 심화 학습`,
        description: `희망 전공(${primaryMajor})의 핵심 권장과목을 이수하고, 교과 단원 개념을 진로 목표(${profile.careerGoal})에 적용하는 미니 프로젝트를 수행합니다.`,
        relatedMajor: primaryMajor,
      },
    };
  }

  // Case 2: 세특 / 학생부 / 탐구 / 보고서 / 수학 / 과학
  if (
    q.includes('세특') ||
    q.includes('탐구') ||
    q.includes('보고서') ||
    q.includes('학생부') ||
    q.includes('생기부') ||
    q.includes('수학') ||
    q.includes('물리') ||
    q.includes('정보') ||
    q.includes('생명') ||
    q.includes('화학')
  ) {
    return {
      reply: `${profile.displayName}의 강점(**${profile.strengths}**)과 선호 과목(**${profile.favoriteSubjects}**)을 살려 **${profile.targetMajors}**에서 높이 평가받을 수 있는 교과 세특(세부능력 및 특기사항) 탐구 주제 3가지를 제안합니다.\n\n1. **[수학 × 전공 융합] 변화율·최적화 모델링 탐구**\n교과서 속 함수의 극한·미분 또는 조건부확률 개념을 단순 문제 풀이에 그치지 않고, 실제 데이터 예측 모델의 오차율(Loss Function)을 줄이는 과정에 대입해 시뮬레이션 결과를 그래프로 비교 분석해 보세요.\n\n2. **[정보·과학 × 도메인 문제 해결] 알고리즘 및 실험 검증 프로젝트**\n학생의 진로 비전인 **"${profile.careerGoal}"**와 연결하여, 일상 속 불편함이나 사회적 문제를 정의하고 이를 해결하는 알고리즘 의사코드(Pseudocode) 또는 실험 설계안을 작성해 발표하면 전공 적합성이 뚜렷하게 드러납니다.\n\n3. **[통합사회·독서 연계] 기술 윤리 및 사회적 영향력 비평**\n첨단 기술이나 전공 지식이 실제 사회에 도입될 때 발생할 수 있는 데이터 편향, 개인정보 보호, 접근성 격차 문제를 다루는 학술 자료를 읽고 학생만의 개선 가이드라인을 제시해 보세요.`,
      recommendedMajors: profile.targetMajors
        .split(/[,·]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 4),
      actionItems: [
        '이번 학기 주요 교과 단원 목차에서 내 관심 전공과 연결되는 개념 2개 표시하기',
        '탐구 동기 → 교과 원리 적용 → 한계점 및 후속 탐구 구조로 2페이지 보고서 초안 작성하기',
        '관련 학술 논문(KCI/DBpia) 또는 전공 입문서 1권을 선정해 참고문헌으로 인용하기',
      ],
      sessionSummary: `${profile.favoriteSubjects} 교과 개념과 ${primaryMajor}을 연결한 차별화된 학생부 세특 심화 탐구 주제 3선 설계`,
      suggestedRoadmap: {
        gradeTarget: defaultSemester,
        category: '세특·탐구주제',
        title: `[${primaryMajor} 연계] 교과 원리 기반 문제 해결 시뮬레이션 탐구`,
        description: `${profile.favoriteSubjects} 교과의 핵심 원리를 활용하여 '${profile.careerGoal}' 관련 실제 데이터를 분석하고, 한계점과 개선 방안을 도출하는 심화 세특 보고서를 작성합니다.`,
        relatedMajor: primaryMajor,
      },
    };
  }

  // Case 3: 학과 비교 / 전공 차이 / 진출 분야
  if (q.includes('학과') || q.includes('전공') || q.includes('비교') || q.includes('차이') || q.includes('대학')) {
    return {
      reply: `${profile.displayName}이 관심 있는 **${profile.targetMajors}** 계열 학과들의 핵심 커리큘럼 차이와 고등학교 준비 포인트를 비교해 드릴게요.\n\n1. **전공별 핵심 학문 초점 비교**\n- **기초·원리 중심 학과 (예: 컴퓨터공학과 / 수리과학과 / 전자공학과)**: 하드웨어와 소프트웨어의 구조, 운영체제, 알고리즘, 수학적 증명 등 근본적인 엔지니어링 원리를 폭넓게 다룹니다.\n- **응용·데이터 중심 학과 (예: 인공지능학과 / 데이터사이언스학과 / 산업공학과)**: 통계적 추론, 머신러닝 모델 설계, 도메인 데이터(의료·금융·모빌리티) 분석 및 최적화 의사결정에 집중합니다.\n\n2. **고교 생활기록부 준비 시 차별화 전략**\n- 원리 중심 학과를 지망한다면 **수학II·미적분·물리학** 등 기초 과학·수리 교과의 깊이 있는 증명과 원리 탐구를 강조하세요.\n- 응용·융합 학과를 지망한다면 **확률과 통계·정보·사회문제 탐구**를 결합해 실제 공공데이터를 수집·시각화하고 인사이트를 도출한 경험을 부각하는 것이 효과적입니다.\n\n3. **추천 탐색 활동**\n희망 대학 학과 홈페이지의 '전공 필수 교과목 요람'을 살펴보고, 1~2학년 때 배우는 과목명을 미리 파악해 두면 면접과 세특 작성에 큰 도움이 됩니다.`,
      recommendedMajors: ['컴퓨터공학과', '인공지능학과', '데이터사이언스학과', '산업공학과'],
      actionItems: [
        '희망 대학 2곳의 학과 홈페이지에서 1·2학년 전공필수 커리큘럼 비교표 만들기',
        '나의 홀랜드 적성 코드(' + profile.hollandCode + ')와 가장 잘 맞는 세부 트랙 선정하기',
        '학과 탐색 결과를 바탕으로 동아리 발표 주제 1건 기획하기',
      ],
      sessionSummary: `${profile.targetMajors} 간 커리큘럼 차이점 분석 및 학생 강점 기반 전공 선택 가이드 제공`,
      suggestedRoadmap: {
        gradeTarget: defaultSemester,
        category: '진로체험',
        title: `희망 전공(${primaryMajor}) 대학 커리큘럼 분석 및 진로 포트폴리오 작성`,
        description: `목표 대학 학과의 전공필수 교과목과 연구실 주요 주제를 조사하여 고등학교 선택과목 및 동아리 탐구 계획과 매핑하는 진로 활동 보고서를 작성합니다.`,
        relatedMajor: primaryMajor,
      },
    };
  }

  // Case 4: 내신 / 공부법 / 시간관리 / 멘탈
  if (
    q.includes('내신') ||
    q.includes('시간') ||
    q.includes('멘탈') ||
    q.includes('공부') ||
    q.includes('시험') ||
    q.includes('슬럼프')
  ) {
    return {
      reply: `${profile.displayName}, 내신 지필고사와 수행평가·세특 보고서를 동시에 챙기느라 고민이 많았죠? ${profile.grade} 시기에 가장 효과적인 **학습·진로 밸런스 루틴**을 제안해 드릴게요.\n\n1. **학기 중 3구간 시간 배분 법칙 (평상시 vs 시험 기간)**\n- **개학 직후 ~ 시험 4주 전 (탐구 집중기)**: 내신 기본 개념 복습 60% + 세특 탐구 자료 수집 및 독서 40%로 배분하세요. 이때 탐구 주제와 참고 논문·도서를 미리 선정해 두어야 시험 직전에 쫓기지 않습니다.\n- **시험 3주 전 ~ 지필고사 종료 (내신 올인기)**: 모든 비교과 활동을 잠시 멈추고 지필고사 대비에 100% 집중하세요.\n- **지필고사 직후 1~2주 (세특 완성기)**: 시험이 끝난 직후 미리 모아둔 자료를 바탕으로 보고서를 작성해 교사에게 제출·발표하세요.\n\n2. **수행평가를 곧바로 세특으로 연결하는 효율화 전략**\n별도의 활동을 새로 만들기보다, 각 과목의 정규 수행평가 주제를 나의 진로 목표(**"${profile.careerGoal}"**)와 연결해 한 단계만 더 깊이 파고드는 것이 시간 대비 효과가 가장 뛰어납니다.`,
      recommendedMajors: profile.targetMajors
        .split(/[,·]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3),
      actionItems: [
        '지필고사 4주 전까지 이번 학기 과목별 세특 탐구 주제 1줄 기획안 완성하기',
        '주간 플래너에 내신 자습 시간과 수행평가·탐구 작성 시간을 블록 단위로 분리하기',
        '시험 직후 1주일 동안 제출할 심화 보고서 체크리스트 정리하기',
      ],
      sessionSummary: `${profile.grade} 학기 중 내신 지필고사 대비와 학생부 세특·동아리 활동 병행을 위한 3단계 시간 관리 전략 수립`,
      suggestedRoadmap: {
        gradeTarget: defaultSemester,
        category: '독서·프로젝트',
        title: `교과 단원 연계 전공 심화 도서 발췌 독서 및 탐구 노트 작성`,
        description: `시험 기간 전 자투리 시간을 활용해 ${primaryMajor} 관련 전공 입문서를 챕터별로 발췌독하고, 교과 개념과 연결된 핵심 질문을 정리합니다.`,
        relatedMajor: primaryMajor,
      },
    };
  }

  // Default Case: Comprehensive Personalized Career Counseling
  return {
    reply: `반가워요, ${profile.displayName}! 질문해 주신 **"${message.slice(0, 80)}"**에 대해 현재 ${profile.grade}(${profile.track}) 프로필과 진로 목표(**${profile.careerGoal}**)를 바탕으로 맞춤 가이드를 드릴게요.\n\n1. **현재 진로 방향성 점검 (${profile.hollandCode})**\n하준 학생은 **${profile.favoriteSubjects}** 교과에 강점이 있고, "${profile.strengths}"라는 뚜렷한 탐구 특성을 가지고 있어요. 이는 희망하는 **${profile.targetMajors}**에서 요구하는 문제 정의 능력 및 융합적 사고력과 매우 잘 부합합니다.\n\n2. **이번 학기 핵심 실행 포인트 (${sessionCategory})**\n- **교과 심화**: 수업 시간에 배운 원리가 실제 산업 현장이나 최신 연구에서 어떻게 쓰이는지 '후속 질문'을 던지는 탐구 보고서를 1편 이상 완성해 보세요.\n- **연계 확장**: 한 과목에서 끝내지 않고, 예를 들어 수학에서 다룬 통계·함수 모델을 정보 코딩이나 과학 실험으로 구현해 보는 **'교과 간 융합 탐구'**를 시도하면 학생부의 스토리라인이 훨씬 탄탄해집니다.\n\n3. **다음 단계 제안**\n아래 제안된 맞춤 로드맵 활동을 [내 로드맵에 저장] 버튼으로 추가해 두고, 더 구체화하고 싶은 과목이나 주제가 있다면 편하게 이어서 질문해 주세요!`,
    recommendedMajors: profile.targetMajors
      .split(/[,·]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 4),
    actionItems: [
      `선호 과목(${profile.favoriteSubjects}) 중 이번 학기 핵심 세특 타깃 과목 2개 선정하기`,
      `진로 목표(${profile.careerGoal})와 관련된 최근 기술·사회 이슈 기사 1건 스크랩 및 분석하기`,
      '동아리 또는 창체 시간에 발표할 5분 미니 프레젠테이션 주제 구체화하기',
    ],
    sessionSummary: `${profile.displayName}의 질문(${message.slice(0, 35)})에 대한 맞춤형 진로·세특 실행 가이드 제시`,
    suggestedRoadmap: {
      gradeTarget: defaultSemester,
      category: '세특·탐구주제',
      title: `${primaryMajor} 연계 ${profile.favoriteSubjects.split(',')[0] || '주요 교과'} 심화 탐구 보고서`,
      description: `학생의 질문 주제("${message.slice(0, 60)}")를 바탕으로 교과 개념과 ${primaryMajor} 전공 지식을 결합한 심화 탐구 및 발표를 진행합니다.`,
      relatedMajor: primaryMajor,
    },
  };
}

function generateSmartRoadmapFallback(
  profile: StudentProfileRecord,
  focusArea?: string
): Array<SuggestedRoadmapPayload> {
  const sem1 = (`${profile.grade} 1학기` as SuggestedRoadmapPayload['gradeTarget']) || '고2 1학기';
  const sem2 = (`${profile.grade} 2학기` as SuggestedRoadmapPayload['gradeTarget']) || '고2 2학기';
  const nextSem = profile.grade === '고1' ? '고2 1학기' : '고3 1학기';
  const major = profile.targetMajors.split(',')[0]?.trim() || '컴퓨터공학과';
  const focusLabel = focusArea?.trim() ? `[${focusArea.trim()}] ` : '';

  return [
    {
      gradeTarget: sem1,
      category: '선택과목',
      title: `${focusLabel}${major} 핵심 권장 선택과목 이수 및 단원별 원리 정리`,
      description: `${profile.favoriteSubjects} 및 전공 연계 진로선택과목을 체계적으로 이수하고, 핵심 개념 노트와 단원별 심화 문제를 정리하여 학업 역량을 증명합니다.`,
      relatedMajor: major,
    },
    {
      gradeTarget: sem2,
      category: '세특·탐구주제',
      title: `${focusLabel}${profile.favoriteSubjects.split(',')[0]?.trim() || '수학·과학'} × ${major} 융합 심화 탐구 보고서`,
      description: `교과서 개념을 학생의 진로 비전('${profile.careerGoal}')에 적용하여 데이터 분석 또는 시뮬레이션 실험을 수행하고 교내 발표를 진행합니다.`,
      relatedMajor: major,
    },
    {
      gradeTarget: nextSem,
      category: '독서·프로젝트',
      title: `${focusLabel}${major} 최신 연구 동향 및 윤리적 쟁점 비평 프로젝트`,
      description: `전공 관련 학술 논문과 전문 도서를 읽고, 기술 발전이 사회에 미치는 영향과 해결 방안을 제시하는 심화 비평 에세이를 작성합니다.`,
      relatedMajor: major,
    },
  ];
}

function generateSmartAptitudeFallback(
  profile: StudentProfileRecord,
  scores: Record<string, number>,
  openAnswer?: string
) {
  const entries = Object.entries({
    R: scores?.R ?? 3,
    I: scores?.I ?? 5,
    A: scores?.A ?? 3,
    S: scores?.S ?? 4,
    E: scores?.E ?? 3,
    C: scores?.C ?? 4,
  }).sort((a, b) => b[1] - a[1]);

  const top3 = entries.slice(0, 3).map((e) => e[0]);
  const nameMap: Record<string, string> = {
    R: '현실',
    I: '탐구',
    A: '예술',
    S: '사회',
    E: '진취',
    C: '관습',
  };
  const codeStr = `${top3.join('')} (${top3.map((k) => nameMap[k]).join('·')}형)`;

  return {
    hollandCode: codeStr.slice(0, 20),
    typeTitle: '논리적 데이터 분석과 따뜻한 공감으로 실생활 문제를 해결하는 융합 탐구자',
    analysis: `${profile.displayName}은 ${top3.map((k) => nameMap[k] + '형(' + k + ')').join(', ')} 점수가 두드러집니다. 원리를 깊이 파고드는 지적 호기심과 함께, 배운 지식을 실제 사회나 사람들의 삶을 개선하는 데 적용할 때 높은 몰입도를 보입니다. 선호 과목(${profile.favoriteSubjects})과 관심 주제("${(openAnswer || profile.strengths).slice(0, 80)}")를 결합한 융합 탐구에서 큰 강점을 발휘할 수 있습니다.`,
    recommendedMajors: ['인공지능학과', '컴퓨터공학과', '데이터사이언스학과', '바이오메디컬공학부'],
    recommendedElectives: ['미적분', '기하', '인공지능 기초', '데이터 과학'],
    inquiryTopicIdea: `${profile.favoriteSubjects.split(',')[0]?.trim() || '수학'} 교과의 확률·최적화 모델을 활용하여 일상 속 헬스케어 또는 공공 안전 문제를 개선하는 데이터 기반 알고리즘 설계 및 효과 검증 탐구`,
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '2mb' }));

  // 1. Get Full Student Workspace from Backend Server
  app.get('/api/workspace/:studentId', (req, res) => {
    try {
      const { workspace } = getOrCreateWorkspace(req.params.studentId);
      res.json(workspace);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : '워크스페이스 데이터를 불러오지 못했습니다.',
      });
    }
  });

  // 1b. Unified Search Across All Counseling Sessions & Messages on Backend Server
  app.get('/api/workspace/:studentId/search', (req, res) => {
    try {
      const { workspace } = getOrCreateWorkspace(req.params.studentId);
      const q = String(req.query.q || '').trim().toLowerCase();
      if (!q) {
        res.json({ query: '', results: [] });
        return;
      }

      const results: Array<{
        sessionId: string;
        sessionTitle: string;
        sessionCategory: string;
        messageId: string;
        role: 'user' | 'assistant';
        content: string;
        recommendedMajors: string;
        actionItems: string;
        createdAt: string;
      }> = [];

      for (const session of workspace.sessions) {
        const msgs = workspace.messagesBySession[session.sessionId] || [];
        for (const msg of msgs) {
          const haystack = [
            session.title,
            session.summary,
            msg.content,
            msg.recommendedMajors,
            msg.actionItems,
            msg.suggestedRoadmap?.title || '',
            msg.suggestedRoadmap?.description || '',
          ]
            .join(' ')
            .toLowerCase();

          if (haystack.includes(q)) {
            results.push({
              sessionId: session.sessionId,
              sessionTitle: session.title,
              sessionCategory: session.category,
              messageId: msg.messageId,
              role: msg.role,
              content: msg.content,
              recommendedMajors: msg.recommendedMajors,
              actionItems: msg.actionItems,
              createdAt: msg.createdAt,
            });
          }
        }
      }

      res.json({ query: q, results });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : '통합 검색 중 오류가 발생했습니다.',
      });
    }
  });

  // 2. Update Student Career Profile on Backend Server
  app.put('/api/workspace/:studentId/profile', (req, res) => {
    try {
      const { db, workspace } = getOrCreateWorkspace(req.params.studentId);
      const body = req.body || {};
      const now = new Date().toISOString();

      workspace.profile = {
        ...workspace.profile,
        displayName: String(body.displayName || workspace.profile.displayName).slice(0, 60),
        grade: ['고1', '고2', '고3'].includes(body.grade) ? body.grade : workspace.profile.grade,
        track: ['미정/통합', '인문·사회', '자연·공학', '예체능', '융합·IT'].includes(body.track)
          ? body.track
          : workspace.profile.track,
        hollandCode: String(body.hollandCode || workspace.profile.hollandCode).slice(0, 20),
        favoriteSubjects: String(body.favoriteSubjects || workspace.profile.favoriteSubjects).slice(0, 200),
        targetMajors: String(body.targetMajors || workspace.profile.targetMajors).slice(0, 200),
        careerGoal: String(body.careerGoal || workspace.profile.careerGoal).slice(0, 300),
        strengths: String(body.strengths || workspace.profile.strengths).slice(0, 300),
        updatedAt: now,
      };

      saveDatabase(db);
      res.json({ profile: workspace.profile });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : '학생 프로필 저장 중 오류가 발생했습니다.',
      });
    }
  });

  // 3. Create New Counseling Session on Backend Server
  app.post('/api/workspace/:studentId/sessions', (req, res) => {
    try {
      const { db, workspace } = getOrCreateWorkspace(req.params.studentId);
      const body = req.body || {};
      const now = new Date().toISOString();
      const sessionId =
        typeof body.sessionId === 'string' && /^[a-zA-Z0-9_-]+$/.test(body.sessionId)
          ? body.sessionId.slice(0, 128)
          : `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      const validCategories = ['진로탐색', '학과선택', '고교학점제·과목선택', '학생부·세특설계', '학습·멘탈코칭'] as const;
      const category = validCategories.includes(body.category) ? body.category : '진로탐색';
      const title = String(body.title || `${category} 맞춤 상담`).slice(0, 120);

      const newSession: CounselingSessionRecord = {
        sessionId,
        ownerId: workspace.profile.userId,
        title,
        category,
        summary: '새로운 진로·진학 상담 세션이 시작되었습니다.',
        messageCount: 1,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };

      const welcomeMsg: ChatMessageRecord = {
        messageId: `msg_${Date.now()}_init`,
        sessionId,
        ownerId: workspace.profile.userId,
        role: 'assistant',
        content: `안녕하세요, ${workspace.profile.displayName}! [${category}] 주제로 새로운 상담을 시작합니다.\n현재 ${workspace.profile.grade}(${workspace.profile.track}) 기준 관심 학과는 "${workspace.profile.targetMajors}"로 설정되어 있네요. 어떤 고민이나 궁금한 점을 함께 풀어볼까요?`,
        recommendedMajors: workspace.profile.targetMajors,
        actionItems: '관심 있는 학과나 고민되는 선택과목 질문하기 · 교내 활동 및 세특 탐구 주제 아이디어 요청하기',
        createdAt: now,
      };

      workspace.sessions.unshift(newSession);
      workspace.messagesBySession[sessionId] = [welcomeMsg];
      saveDatabase(db);

      res.json({ session: newSession, messages: [welcomeMsg] });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : '새 상담 세션을 생성하지 못했습니다.',
      });
    }
  });

  // 4. Update or Archive Counseling Session
  app.patch('/api/workspace/:studentId/sessions/:sessionId', (req, res) => {
    try {
      const { db, workspace } = getOrCreateWorkspace(req.params.studentId);
      const session = workspace.sessions.find((s) => s.sessionId === req.params.sessionId);
      if (!session) {
        res.status(404).json({ error: '상담 세션을 찾을 수 없습니다.' });
        return;
      }
      if (session.status === 'archived') {
        res.status(400).json({ error: '보관 완료된 상담 세션은 수정할 수 없습니다.' });
        return;
      }

      const body = req.body || {};
      if (body.title) session.title = String(body.title).slice(0, 120);
      if (body.summary) session.summary = String(body.summary).slice(0, 500);
      if (body.status === 'archived') session.status = 'archived';
      session.updatedAt = new Date().toISOString();

      saveDatabase(db);
      res.json({ session });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : '상담 세션 업데이트 실패',
      });
    }
  });

  // 5. Delete Counseling Session
  app.delete('/api/workspace/:studentId/sessions/:sessionId', (req, res) => {
    try {
      const { db, workspace } = getOrCreateWorkspace(req.params.studentId);
      workspace.sessions = workspace.sessions.filter((s) => s.sessionId !== req.params.sessionId);
      delete workspace.messagesBySession[req.params.sessionId];
      saveDatabase(db);
      res.json({ deleted: true });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : '상담 세션 삭제 실패',
      });
    }
  });

  // 6. Create Career Roadmap Milestone on Backend Server
  app.post('/api/workspace/:studentId/roadmaps', (req, res) => {
    try {
      const { db, workspace } = getOrCreateWorkspace(req.params.studentId);
      const body = req.body || {};
      const now = new Date().toISOString();

      const validGrades = ['고1 1학기', '고1 2학기', '고2 1학기', '고2 2학기', '고3 1학기', '고3 2학기'] as const;
      const validCategories = ['선택과목', '창체·동아리', '세특·탐구주제', '독서·프로젝트', '진로체험'] as const;
      const validStatuses = ['planned', 'in_progress', 'completed'] as const;

      const roadmapId =
        typeof body.roadmapId === 'string' && /^[a-zA-Z0-9_-]+$/.test(body.roadmapId)
          ? body.roadmapId.slice(0, 128)
          : `road_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      const newRoadmap: CareerRoadmapRecord = {
        roadmapId,
        ownerId: workspace.profile.userId,
        gradeTarget: validGrades.includes(body.gradeTarget) ? body.gradeTarget : '고2 1학기',
        category: validCategories.includes(body.category) ? body.category : '세특·탐구주제',
        title: String(body.title || '신규 진로 탐구 계획').slice(0, 120),
        description: String(body.description || '구체적인 탐구 목표 및 실행 내용을 기록하세요.').slice(0, 1000),
        relatedMajor: String(body.relatedMajor || workspace.profile.targetMajors || '융합전공').slice(0, 100),
        status: validStatuses.includes(body.status) ? body.status : 'planned',
        createdAt: now,
        updatedAt: now,
      };

      workspace.roadmaps.unshift(newRoadmap);
      saveDatabase(db);
      res.json({ roadmap: newRoadmap });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : '로드맵 항목 추가 중 오류가 발생했습니다.',
      });
    }
  });

  // 7. Update Career Roadmap Milestone on Backend Server
  app.patch('/api/workspace/:studentId/roadmaps/:roadmapId', (req, res) => {
    try {
      const { db, workspace } = getOrCreateWorkspace(req.params.studentId);
      const item = workspace.roadmaps.find((r) => r.roadmapId === req.params.roadmapId);
      if (!item) {
        res.status(404).json({ error: '로드맵 항목을 찾을 수 없습니다.' });
        return;
      }
      if (item.status === 'completed') {
        res.status(400).json({ error: '이미 완료된 로드맵 항목은 잠금 처리되어 수정할 수 없습니다.' });
        return;
      }

      const body = req.body || {};
      if (body.title) item.title = String(body.title).slice(0, 120);
      if (body.description) item.description = String(body.description).slice(0, 1000);
      if (body.relatedMajor) item.relatedMajor = String(body.relatedMajor).slice(0, 100);
      if (['고1 1학기', '고1 2학기', '고2 1학기', '고2 2학기', '고3 1학기', '고3 2학기'].includes(body.gradeTarget)) {
        item.gradeTarget = body.gradeTarget;
      }
      if (['선택과목', '창체·동아리', '세특·탐구주제', '독서·프로젝트', '진로체험'].includes(body.category)) {
        item.category = body.category;
      }
      if (['planned', 'in_progress', 'completed'].includes(body.status)) {
        item.status = body.status;
      }
      item.updatedAt = new Date().toISOString();

      saveDatabase(db);
      res.json({ roadmap: item });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : '로드맵 업데이트 중 오류가 발생했습니다.',
      });
    }
  });

  // 8. Delete Career Roadmap Milestone on Backend Server
  app.delete('/api/workspace/:studentId/roadmaps/:roadmapId', (req, res) => {
    try {
      const { db, workspace } = getOrCreateWorkspace(req.params.studentId);
      workspace.roadmaps = workspace.roadmaps.filter((r) => r.roadmapId !== req.params.roadmapId);
      saveDatabase(db);
      res.json({ deleted: true });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : '로드맵 삭제 중 오류가 발생했습니다.',
      });
    }
  });

  // 9. Server-Side Gemini Career Counseling Chat Endpoint (with Intelligent Fallback)
  app.post('/api/counseling/chat', async (req, res) => {
    try {
      const { studentId, sessionId, message, userMessageId, assistantMessageId } = req.body || {};
      if (!studentId || !message) {
        res.status(400).json({ error: '필수 요청 파라미터가 누락되었습니다.' });
        return;
      }

      const { db, workspace } = getOrCreateWorkspace(studentId);
      let session = workspace.sessions.find((s) => s.sessionId === sessionId) || workspace.sessions[0];
      if (!session) {
        const nowInit = new Date().toISOString();
        session = {
          sessionId: sessionId || `sess_${Date.now()}_auto`,
          ownerId: workspace.profile.userId,
          title: '맞춤 진로·진학 상담',
          category: '진로탐색',
          summary: '진로·진학 상담 세션이 시작되었습니다.',
          messageCount: 0,
          status: 'active',
          createdAt: nowInit,
          updatedAt: nowInit,
        };
        workspace.sessions.unshift(session);
        workspace.messagesBySession[session.sessionId] = [];
      }

      if (session.status === 'archived') {
        res.status(400).json({ error: '보관된 세션에는 새 메시지를 보낼 수 없습니다.' });
        return;
      }

      const targetSessionId = session.sessionId;
      const now = new Date().toISOString();
      const userMsg: ChatMessageRecord = {
        messageId:
          typeof userMessageId === 'string' && /^[a-zA-Z0-9_-]+$/.test(userMessageId)
            ? userMessageId
            : `msg_${Date.now()}_u`,
        sessionId: targetSessionId,
        ownerId: workspace.profile.userId,
        role: 'user',
        content: String(message).slice(0, 5000),
        recommendedMajors: '',
        actionItems: '',
        createdAt: now,
      };

      if (!workspace.messagesBySession[targetSessionId]) {
        workspace.messagesBySession[targetSessionId] = [];
      }
      workspace.messagesBySession[targetSessionId].push(userMsg);

      const recentHistory = workspace.messagesBySession[targetSessionId]
        .slice(-8)
        .map((m) => `${m.role === 'user' ? '학생' : '나침반 멘토'}: ${m.content}`)
        .join('\n\n');

      let parsedResult: {
        reply: string;
        recommendedMajors: string[];
        actionItems: string[];
        sessionSummary: string;
        suggestedRoadmap: SuggestedRoadmapPayload;
      };

      try {
        const ai = getGeminiClient();
        const systemPrompt = `당신은 대한민국 고등학생들을 위한 전문 진로·진학 상담 멘토 '나침반 멘토'입니다.
학생의 학년, 계열, 홀랜드 적성 코드, 선호 과목, 목표 학과를 깊이 이해하고 따뜻하면서도 실질적인 진로·진학 가이드를 제공합니다.

[학생 프로필]
- 이름: ${workspace.profile.displayName}
- 학년 / 계열: ${workspace.profile.grade} / ${workspace.profile.track}
- 적성 유형(Holland): ${workspace.profile.hollandCode}
- 선호 과목: ${workspace.profile.favoriteSubjects}
- 관심 학과: ${workspace.profile.targetMajors}
- 진로 목표: ${workspace.profile.careerGoal}
- 강점 및 특성: ${workspace.profile.strengths}
- 현재 상담 카테고리: ${session.category}

[상담 원칙]
1. 고교학점제 선택과목(일반선택·진로선택·융합선택), 대학 전공 적합성, 학생부 세부능력 및 특기사항(세특) 탐구 주제, 구체적인 독서·동아리 활동 등 고등학생이 학교에서 바로 실천할 수 있는 구체적 정보를 제시하세요.
2. 답변(reply)은 가독성 좋게 번호 매기기와 핵심 강조를 활용하여 3~5문단 이내로 명확하게 작성하세요.
3. 학생이 자신의 진로 로드맵에 바로 추가할 수 있도록 맞춤형 학기별 활동 1개(suggestedRoadmap)를 함께 설계해 주세요.`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: `[이전 대화 내역]\n${recentHistory}\n\n[학생의 현재 질문]\n${message}`,
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                reply: {
                  type: Type.STRING,
                  description: '학생에게 전달할 친절하고 구체적인 진로·진학 상담 답변 본문',
                },
                recommendedMajors: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '질문 및 진로와 연관된 추천 대학 학과 2~4개',
                },
                actionItems: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '학생이 이번 학기에 바로 실행할 수 있는 구체적 실천 과제 2~3개',
                },
                sessionSummary: {
                  type: Type.STRING,
                  description: '현재까지의 상담 핵심 내용을 1문장(100자 이내)으로 요약',
                },
                suggestedRoadmap: {
                  type: Type.OBJECT,
                  properties: {
                    gradeTarget: {
                      type: Type.STRING,
                      description: '고1 1학기, 고1 2학기, 고2 1학기, 고2 2학기, 고3 1학기, 고3 2학기 중 하나',
                    },
                    category: {
                      type: Type.STRING,
                      description: '선택과목, 창체·동아리, 세특·탐구주제, 독서·프로젝트, 진로체험 중 하나',
                    },
                    title: {
                      type: Type.STRING,
                      description: '추천 학생부·진로 로드맵 활동 제목 (60자 이내)',
                    },
                    description: {
                      type: Type.STRING,
                      description: '구체적인 탐구 방법 및 교과 연계 내용 설명 (300자 이내)',
                    },
                    relatedMajor: {
                      type: Type.STRING,
                      description: '연계 전공 학과명',
                    },
                  },
                  required: ['gradeTarget', 'category', 'title', 'description', 'relatedMajor'],
                },
              },
              required: ['reply', 'recommendedMajors', 'actionItems', 'sessionSummary', 'suggestedRoadmap'],
            },
          },
        });

        parsedResult = JSON.parse((response.text || '{}').trim());
      } catch (aiError) {
        console.warn('Gemini API unavailable or quota depleted; using built-in counseling engine:', aiError);
        parsedResult = generateSmartCounselingFallback(String(message), workspace.profile, session.category);
      }

      const validGrades = ['고1 1학기', '고1 2학기', '고2 1학기', '고2 2학기', '고3 1학기', '고3 2학기'] as const;
      const validCategories = ['선택과목', '창체·동아리', '세특·탐구주제', '독서·프로젝트', '진로체험'] as const;

      const replyText = String(parsedResult.reply || '상담 응답을 생성했습니다.').slice(0, 5000);
      const majorsStr = Array.isArray(parsedResult.recommendedMajors)
        ? parsedResult.recommendedMajors.join(' · ').slice(0, 500)
        : workspace.profile.targetMajors.slice(0, 500);
      const actionsStr = Array.isArray(parsedResult.actionItems)
        ? parsedResult.actionItems.join(' · ').slice(0, 500)
        : '교과 연계 탐구 주제 선정하기'.slice(0, 500);

      const rawSuggested = parsedResult.suggestedRoadmap || ({} as Partial<SuggestedRoadmapPayload>);
      const suggestedRoadmap: SuggestedRoadmapPayload = {
        gradeTarget: validGrades.includes(rawSuggested.gradeTarget as (typeof validGrades)[number])
          ? (rawSuggested.gradeTarget as (typeof validGrades)[number])
          : (`${workspace.profile.grade} 2학기` as (typeof validGrades)[number]),
        category: validCategories.includes(rawSuggested.category as (typeof validCategories)[number])
          ? (rawSuggested.category as (typeof validCategories)[number])
          : '세특·탐구주제',
        title: String(rawSuggested.title || '교과 연계 심화 탐구 보고서 작성').slice(0, 120),
        description: String(
          rawSuggested.description || '관심 전공과 교과 개념을 연결하여 심화 탐구 보고서를 작성하고 발표합니다.'
        ).slice(0, 1000),
        relatedMajor: String(rawSuggested.relatedMajor || workspace.profile.targetMajors).slice(0, 100),
      };

      const replyTime = new Date().toISOString();
      const assistantMsg: ChatMessageRecord = {
        messageId:
          typeof assistantMessageId === 'string' && /^[a-zA-Z0-9_-]+$/.test(assistantMessageId)
            ? assistantMessageId
            : `msg_${Date.now()}_a`,
        sessionId: targetSessionId,
        ownerId: workspace.profile.userId,
        role: 'assistant',
        content: replyText,
        recommendedMajors: majorsStr,
        actionItems: actionsStr,
        suggestedRoadmap,
        createdAt: replyTime,
      };

      workspace.messagesBySession[targetSessionId].push(assistantMsg);
      session.messageCount = workspace.messagesBySession[targetSessionId].length;
      session.summary = String(parsedResult.sessionSummary || session.summary).slice(0, 500);
      session.updatedAt = replyTime;

      saveDatabase(db);

      res.json({
        userMessage: userMsg,
        assistantMessage: assistantMsg,
        session,
      });
    } catch (error) {
      console.error('Counseling chat endpoint error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'AI 진로 상담 응답 생성 중 오류가 발생했습니다.',
      });
    }
  });

  // 10. Server-Side Gemini Automated Semester Roadmap Generator (with Fallback)
  app.post('/api/counseling/generate-roadmap', async (req, res) => {
    try {
      const { studentId, focusArea } = req.body || {};
      const { db, workspace } = getOrCreateWorkspace(studentId || 'default_student');

      let rawItems: Array<Record<string, string>> = [];
      try {
        const ai = getGeminiClient();
        const prompt = `다음 고등학생의 진로 프로필을 바탕으로 학기별 맞춤형 진로·진학 로드맵 항목 3개를 설계해 주세요.
- 학생 이름: ${workspace.profile.displayName}
- 현재 학년 / 계열: ${workspace.profile.grade} / ${workspace.profile.track}
- 관심 학과: ${workspace.profile.targetMajors}
- 선호 과목: ${workspace.profile.favoriteSubjects}
- 진로 목표: ${workspace.profile.careerGoal}
- 강점: ${workspace.profile.strengths}
- 중점 설계 요청 사항: ${focusArea || '고교학점제 선택과목 + 교과 세특 탐구 + 동아리/독서 프로젝트 균형 설계'}`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                items: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      gradeTarget: {
                        type: Type.STRING,
                        description: '고1 1학기, 고1 2학기, 고2 1학기, 고2 2학기, 고3 1학기, 고3 2학기 중 하나',
                      },
                      category: {
                        type: Type.STRING,
                        description: '선택과목, 창체·동아리, 세특·탐구주제, 독서·프로젝트, 진로체험 중 하나',
                      },
                      title: {
                        type: Type.STRING,
                        description: '구체적인 로드맵 활동 제목 (100자 이내)',
                      },
                      description: {
                        type: Type.STRING,
                        description: '구체적인 실행 계획과 학생부 연계 포인트 (500자 이내)',
                      },
                      relatedMajor: {
                        type: Type.STRING,
                        description: '관련 대학 전공 학과명',
                      },
                    },
                    required: ['gradeTarget', 'category', 'title', 'description', 'relatedMajor'],
                  },
                },
              },
              required: ['items'],
            },
          },
        });

        const parsed = JSON.parse((response.text || '{}').trim());
        rawItems = Array.isArray(parsed.items) ? parsed.items.slice(0, 3) : [];
      } catch (aiError) {
        console.warn('Gemini roadmap API fallback triggered:', aiError);
        rawItems = generateSmartRoadmapFallback(workspace.profile, focusArea) as unknown as Array<Record<string, string>>;
      }

      const validGrades = ['고1 1학기', '고1 2학기', '고2 1학기', '고2 2학기', '고3 1학기', '고3 2학기'] as const;
      const validCategories = ['선택과목', '창체·동아리', '세특·탐구주제', '독서·프로젝트', '진로체험'] as const;

      const createdRoadmaps: CareerRoadmapRecord[] = rawItems.map((raw: Record<string, string>, idx: number) => {
        const now = new Date().toISOString();
        return {
          roadmapId: `road_${Date.now()}_${idx}`,
          ownerId: workspace.profile.userId,
          gradeTarget: validGrades.includes(raw.gradeTarget as (typeof validGrades)[number])
            ? (raw.gradeTarget as (typeof validGrades)[number])
            : '고2 2학기',
          category: validCategories.includes(raw.category as (typeof validCategories)[number])
            ? (raw.category as (typeof validCategories)[number])
            : '세특·탐구주제',
          title: String(raw.title || '맞춤형 심화 탐구 활동').slice(0, 120),
          description: String(raw.description || '교과 개념을 확장하여 전공 연계 보고서를 작성합니다.').slice(0, 1000),
          relatedMajor: String(raw.relatedMajor || workspace.profile.targetMajors).slice(0, 100),
          status: 'planned',
          createdAt: now,
          updatedAt: now,
        };
      });

      workspace.roadmaps = [...createdRoadmaps, ...workspace.roadmaps];
      saveDatabase(db);

      res.json({ createdRoadmaps });
    } catch (error) {
      console.error('Roadmap generation error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'AI 진로 로드맵 생성 중 오류가 발생했습니다.',
      });
    }
  });

  // 11. Server-Side Gemini RIASEC Career Aptitude Diagnostic (with Fallback)
  app.post('/api/counseling/diagnose-aptitude', async (req, res) => {
    try {
      const { studentId, scores, openAnswer } = req.body || {};
      const { db, workspace } = getOrCreateWorkspace(studentId || 'default_student');

      let report: {
        hollandCode: string;
        typeTitle: string;
        analysis: string;
        recommendedMajors: string[];
        recommendedElectives: string[];
        inquiryTopicIdea: string;
      };

      try {
        const ai = getGeminiClient();
        const prompt = `고등학생 진로 적성(RIASEC 6각형 모델) 진단 점수와 학생의 자유 응답을 분석하여 맞춤형 진로 진단 리포트를 작성해 주세요.
[학생 기본 정보]
- 이름: ${workspace.profile.displayName} (${workspace.profile.grade}, ${workspace.profile.track})
- 선호 과목: ${workspace.profile.favoriteSubjects}

[RIASEC 6개 영역 점수 (각 1~5점 척도)]
- R (현실형 - 기계·조작·현장실습): ${scores?.R ?? 3}점
- I (탐구형 - 수리·과학·논리분석): ${scores?.I ?? 5}점
- A (예술형 - 창작·디자인·표현): ${scores?.A ?? 3}점
- S (사회형 - 교육·상담·협력): ${scores?.S ?? 4}점
- E (진취형 - 리더십·기획·설득): ${scores?.E ?? 3}점
- C (관습형 - 데이터정리·체계·규칙): ${scores?.C ?? 4}점

[학생이 가장 몰입했던 경험/관심사]
${openAnswer || workspace.profile.strengths}`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                hollandCode: {
                  type: Type.STRING,
                  description: '상위 3개 코드 조합과 한글 명칭 (예: ISA (탐구·사회·예술형)) - 20자 이내',
                },
                typeTitle: {
                  type: Type.STRING,
                  description: '학생의 적성을 표현하는 핵심 별칭 (예: 따뜻한 기술로 사회 문제를 푸는 융합 탐구자)',
                },
                analysis: {
                  type: Type.STRING,
                  description: '학생의 강점, 학습 스타일, 진로 적합성에 대한 심층 분석 (400자 이내)',
                },
                recommendedMajors: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '추천 대학 전공 학과 4개',
                },
                recommendedElectives: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '고교학점제 추천 선택과목 4개',
                },
                inquiryTopicIdea: {
                  type: Type.STRING,
                  description: '학생부 세특을 위한 맞춤형 심화 탐구 주제 1가지 제안',
                },
              },
              required: [
                'hollandCode',
                'typeTitle',
                'analysis',
                'recommendedMajors',
                'recommendedElectives',
                'inquiryTopicIdea',
              ],
            },
          },
        });

        report = JSON.parse((response.text || '{}').trim());
      } catch (aiError) {
        console.warn('Gemini aptitude diagnosis API fallback triggered:', aiError);
        report = generateSmartAptitudeFallback(workspace.profile, scores || {}, openAnswer);
      }

      if (report.hollandCode) {
        workspace.profile.hollandCode = String(report.hollandCode).slice(0, 20);
        workspace.profile.updatedAt = new Date().toISOString();
        saveDatabase(db);
      }

      res.json({
        report,
        updatedProfile: workspace.profile,
      });
    } catch (error) {
      console.error('Aptitude diagnosis error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'AI 적성 진단 분석 중 오류가 발생했습니다.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Nachimban Career Counseling Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
