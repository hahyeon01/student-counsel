import {
  auth,
  db,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  serverTimestamp,
  handleFirestoreError,
  OperationType,
  sanitizeId,
  clampText,
} from '../firebase';
import {
  StudentProfile,
  CounselingSession,
  ChatMessage,
  CareerRoadmapItem,
} from '../types';

function isVerifiedUser(): boolean {
  return Boolean(auth.currentUser && auth.currentUser.emailVerified);
}

export async function syncProfileToFirestore(profile: StudentProfile): Promise<void> {
  if (!isVerifiedUser() || !auth.currentUser) return;
  const uid = auth.currentUser.uid;
  const path = `studentProfiles/${uid}`;
  const docRef = doc(db, 'studentProfiles', uid);

  try {
    const existingSnap = await getDoc(docRef);
    if (!existingSnap.exists()) {
      await setDoc(docRef, {
        userId: uid,
        displayName: clampText(profile.displayName, 1, 60, '학생'),
        grade: ['고1', '고2', '고3'].includes(profile.grade) ? profile.grade : '고2',
        track: ['미정/통합', '인문·사회', '자연·공학', '예체능', '융합·IT'].includes(profile.track)
          ? profile.track
          : '미정/통합',
        hollandCode: clampText(profile.hollandCode, 1, 20, 'IRA'),
        favoriteSubjects: clampText(profile.favoriteSubjects, 1, 200, '수학, 정보'),
        targetMajors: clampText(profile.targetMajors, 1, 200, '컴퓨터공학과'),
        careerGoal: clampText(profile.careerGoal, 1, 300, '진로 탐색 중'),
        strengths: clampText(profile.strengths, 1, 300, '성실한 탐구 태도'),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(docRef, {
        displayName: clampText(profile.displayName, 1, 60, '학생'),
        grade: ['고1', '고2', '고3'].includes(profile.grade) ? profile.grade : '고2',
        track: ['미정/통합', '인문·사회', '자연·공학', '예체능', '융합·IT'].includes(profile.track)
          ? profile.track
          : '미정/통합',
        hollandCode: clampText(profile.hollandCode, 1, 20, 'IRA'),
        favoriteSubjects: clampText(profile.favoriteSubjects, 1, 200, '수학, 정보'),
        targetMajors: clampText(profile.targetMajors, 1, 200, '컴퓨터공학과'),
        careerGoal: clampText(profile.careerGoal, 1, 300, '진로 탐색 중'),
        strengths: clampText(profile.strengths, 1, 300, '성실한 탐구 태도'),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function createSessionInFirestore(
  session: CounselingSession,
  initialMessages: ChatMessage[]
): Promise<void> {
  if (!isVerifiedUser() || !auth.currentUser) return;
  const uid = auth.currentUser.uid;
  const sessionId = sanitizeId(session.sessionId);
  const sessionPath = `counselingSessions/${sessionId}`;

  try {
    await setDoc(doc(db, 'counselingSessions', sessionId), {
      sessionId,
      ownerId: uid,
      title: clampText(session.title, 1, 120, '새 진로 상담'),
      category: ['진로탐색', '학과선택', '고교학점제·과목선택', '학생부·세특설계', '학습·멘탈코칭'].includes(
        session.category
      )
        ? session.category
        : '진로탐색',
      summary: clampText(session.summary, 1, 500, '상담 세션 시작'),
      messageCount: Math.max(0, Math.min(1000, Math.floor(session.messageCount || 1))),
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, sessionPath);
  }

  for (const msg of initialMessages) {
    await createMessageInFirestore(sessionId, msg);
  }
}

export async function updateSessionProgressInFirestore(session: CounselingSession): Promise<void> {
  if (!isVerifiedUser() || !auth.currentUser) return;
  const sessionId = sanitizeId(session.sessionId);
  const sessionPath = `counselingSessions/${sessionId}`;
  const docRef = doc(db, 'counselingSessions', sessionId);

  try {
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      await createSessionInFirestore(session, []);
      return;
    }
    if (snap.data()?.status === 'archived') return;

    await updateDoc(docRef, {
      title: clampText(session.title, 1, 120, '진로 상담'),
      summary: clampText(session.summary, 1, 500, '상담 진행 중'),
      messageCount: Math.max(0, Math.min(1000, Math.floor(session.messageCount || 1))),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, sessionPath);
  }
}

export async function archiveSessionInFirestore(sessionIdRaw: string): Promise<void> {
  if (!isVerifiedUser() || !auth.currentUser) return;
  const sessionId = sanitizeId(sessionIdRaw);
  const sessionPath = `counselingSessions/${sessionId}`;
  const docRef = doc(db, 'counselingSessions', sessionId);

  try {
    const snap = await getDoc(docRef);
    if (!snap.exists() || snap.data()?.status === 'archived') return;
    await updateDoc(docRef, {
      status: 'archived',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, sessionPath);
  }
}

export async function deleteSessionInFirestore(sessionIdRaw: string): Promise<void> {
  if (!isVerifiedUser() || !auth.currentUser) return;
  const sessionId = sanitizeId(sessionIdRaw);
  const sessionPath = `counselingSessions/${sessionId}`;

  try {
    const msgQuery = query(
      collection(db, 'counselingSessions', sessionId, 'messages'),
      where('ownerId', '==', auth.currentUser.uid)
    );
    const msgSnaps = await getDocs(msgQuery);
    for (const mDoc of msgSnaps.docs) {
      await deleteDoc(doc(db, 'counselingSessions', sessionId, 'messages', mDoc.id));
    }
    await deleteDoc(doc(db, 'counselingSessions', sessionId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, sessionPath);
  }
}

export async function createMessageInFirestore(sessionIdRaw: string, msg: ChatMessage): Promise<void> {
  if (!isVerifiedUser() || !auth.currentUser) return;
  const uid = auth.currentUser.uid;
  const sessionId = sanitizeId(sessionIdRaw);
  const messageId = sanitizeId(msg.messageId);
  const msgPath = `counselingSessions/${sessionId}/messages/${messageId}`;

  try {
    await setDoc(doc(db, 'counselingSessions', sessionId, 'messages', messageId), {
      messageId,
      sessionId,
      ownerId: uid,
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: clampText(msg.content, 1, 5000, '내용 없음'),
      recommendedMajors: (msg.recommendedMajors ?? '').slice(0, 500),
      actionItems: (msg.actionItems ?? '').slice(0, 500),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, msgPath);
  }
}

export async function createRoadmapInFirestore(item: CareerRoadmapItem): Promise<void> {
  if (!isVerifiedUser() || !auth.currentUser) return;
  const uid = auth.currentUser.uid;
  const roadmapId = sanitizeId(item.roadmapId);
  const path = `careerRoadmaps/${roadmapId}`;

  try {
    await setDoc(doc(db, 'careerRoadmaps', roadmapId), {
      roadmapId,
      ownerId: uid,
      gradeTarget: ['고1 1학기', '고1 2학기', '고2 1학기', '고2 2학기', '고3 1학기', '고3 2학기'].includes(
        item.gradeTarget
      )
        ? item.gradeTarget
        : '고2 1학기',
      category: ['선택과목', '창체·동아리', '세특·탐구주제', '독서·프로젝트', '진로체험'].includes(item.category)
        ? item.category
        : '세특·탐구주제',
      title: clampText(item.title, 1, 120, '진로 로드맵 과제'),
      description: clampText(item.description, 1, 1000, '탐구 목표 및 실행 계획'),
      relatedMajor: clampText(item.relatedMajor, 1, 100, '관심 학과'),
      status: ['planned', 'in_progress', 'completed'].includes(item.status) ? item.status : 'planned',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateRoadmapStatusInFirestore(
  roadmapIdRaw: string,
  status: 'planned' | 'in_progress' | 'completed'
): Promise<void> {
  if (!isVerifiedUser() || !auth.currentUser) return;
  const roadmapId = sanitizeId(roadmapIdRaw);
  const path = `careerRoadmaps/${roadmapId}`;
  const docRef = doc(db, 'careerRoadmaps', roadmapId);

  try {
    const snap = await getDoc(docRef);
    if (!snap.exists() || snap.data()?.status === 'completed') return;
    await updateDoc(docRef, {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteRoadmapInFirestore(roadmapIdRaw: string): Promise<void> {
  if (!isVerifiedUser() || !auth.currentUser) return;
  const roadmapId = sanitizeId(roadmapIdRaw);
  const path = `careerRoadmaps/${roadmapId}`;

  try {
    await deleteDoc(doc(db, 'careerRoadmaps', roadmapId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function syncAllWorkspaceToFirestore(
  profile: StudentProfile,
  sessions: CounselingSession[],
  messagesBySession: Record<string, ChatMessage[]>,
  roadmaps: CareerRoadmapItem[]
): Promise<void> {
  if (!isVerifiedUser() || !auth.currentUser) return;
  await syncProfileToFirestore(profile);

  for (const session of sessions) {
    const sessionRef = doc(db, 'counselingSessions', sanitizeId(session.sessionId));
    try {
      const snap = await getDoc(sessionRef);
      if (!snap.exists()) {
        await createSessionInFirestore(session, messagesBySession[session.sessionId] || []);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `counselingSessions/${session.sessionId}`);
    }
  }

  for (const item of roadmaps) {
    const roadRef = doc(db, 'careerRoadmaps', sanitizeId(item.roadmapId));
    try {
      const snap = await getDoc(roadRef);
      if (!snap.exists()) {
        await createRoadmapInFirestore(item);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `careerRoadmaps/${item.roadmapId}`);
    }
  }
}
