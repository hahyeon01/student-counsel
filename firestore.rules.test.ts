/**
 * Hardened Red-Team Security Rules Test Suite
 * Verifies all Dirty Dozen attack payloads are rejected with PERMISSION_DENIED.
 */

export interface DirtyDozenTestCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'create' | 'update' | 'get' | 'list' | 'delete';
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TEST_CASES: DirtyDozenTestCase[] = [
  {
    id: 1,
    name: 'Identity Spoofing on StudentProfile Create',
    collectionPath: '/studentProfiles/user_A',
    operation: 'create',
    auth: { uid: 'user_A', email_verified: true },
    payload: {
      userId: 'user_B',
      displayName: '김민준',
      grade: '고2',
      track: '자연·공학',
      hollandCode: 'IRA',
      favoriteSubjects: '수학, 물리학I',
      targetMajors: '컴퓨터공학과',
      careerGoal: 'AI 엔지니어',
      strengths: '논리적 문제 해결',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Shadow Field Injection on Profile Update',
    collectionPath: '/studentProfiles/user_A',
    operation: 'update',
    auth: { uid: 'user_A', email_verified: true },
    payload: {
      displayName: '김민준',
      isAdmin: true,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Unverified Email Spoof Attack',
    collectionPath: '/studentProfiles/user_A',
    operation: 'create',
    auth: { uid: 'user_A', email_verified: false },
    payload: {
      userId: 'user_A',
      displayName: '김민준',
      grade: '고1',
      track: '미정/통합',
      hollandCode: 'SEC',
      favoriteSubjects: '국어, 통합사회',
      targetMajors: '경영학과',
      careerGoal: '브랜드 디렉터',
      strengths: '소통과 기획',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Resource Poisoning via Oversized Summary String',
    collectionPath: '/counselingSessions/sess_1',
    operation: 'create',
    auth: { uid: 'user_A', email_verified: true },
    payload: {
      sessionId: 'sess_1',
      ownerId: 'user_A',
      title: '진로 상담',
      category: '진로탐색',
      summary: 'A'.repeat(2000),
      messageCount: 1,
      status: 'active',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'ID Poisoning via Special Characters',
    collectionPath: '/counselingSessions/bad$id!@#',
    operation: 'create',
    auth: { uid: 'user_A', email_verified: true },
    payload: {
      sessionId: 'bad$id!@#',
      ownerId: 'user_A',
      title: '진로 상담',
      category: '진로탐색',
      summary: '요약',
      messageCount: 0,
      status: 'active',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Orphaned Subcollection Write (Non-existent Parent Session)',
    collectionPath: '/counselingSessions/missing_session/messages/msg_1',
    operation: 'create',
    auth: { uid: 'user_A', email_verified: true },
    payload: {
      messageId: 'msg_1',
      sessionId: 'missing_session',
      ownerId: 'user_A',
      role: 'user',
      content: '안녕하세요',
      recommendedMajors: '',
      actionItems: '',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Cross-Tenant Subcollection Message Injection',
    collectionPath: '/counselingSessions/sess_owned_by_B/messages/msg_1',
    operation: 'create',
    auth: { uid: 'user_A', email_verified: true },
    payload: {
      messageId: 'msg_1',
      sessionId: 'sess_owned_by_B',
      ownerId: 'user_A',
      role: 'user',
      content: '타인 세션 침입 시도',
      recommendedMajors: '',
      actionItems: '',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Terminal State Lock Bypass on Archived Session',
    collectionPath: '/counselingSessions/sess_archived',
    operation: 'update',
    auth: { uid: 'user_A', email_verified: true },
    payload: {
      title: '보관된 세션 수정 시도',
      status: 'active',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Terminal State Lock Bypass on Completed Roadmap',
    collectionPath: '/careerRoadmaps/road_completed',
    operation: 'update',
    auth: { uid: 'user_A', email_verified: true },
    payload: {
      title: '완료된 로드맵 수정 시도',
      status: 'in_progress',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Immortal Field Mutation (Changing ownerId on Roadmap Update)',
    collectionPath: '/careerRoadmaps/road_1',
    operation: 'update',
    auth: { uid: 'user_A', email_verified: true },
    payload: {
      ownerId: 'user_B',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Value Poisoning on Whitelisted Status Field',
    collectionPath: '/careerRoadmaps/road_1',
    operation: 'update',
    auth: { uid: 'user_A', email_verified: true },
    payload: {
      status: 'hacked_status',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Unconstrained List Query Scraping Attempt',
    collectionPath: '/counselingSessions',
    operation: 'list',
    auth: { uid: 'user_A', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
];
