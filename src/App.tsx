import React, { useState, useEffect, useRef, useMemo } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  Send,
  Plus,
  Compass,
  BookOpen,
  Calendar,
  Sliders,
  Trash2,
  Archive,
  Check,
  Sparkles,
  Search,
  LogIn,
  LogOut,
  Save,
  ArrowRight,
  Lock,
  Share2,
  FileText,
  Download,
  Copy,
  X,
} from 'lucide-react';
import { auth, signInWithGoogle, logOutFirebase, sanitizeId } from './firebase';
import {
  StudentProfile,
  CounselingSession,
  ChatMessage,
  CareerRoadmapItem,
  CounselingCategory,
  GradeLevel,
  AcademicTrack,
  SemesterTarget,
  RoadmapCategory,
  RoadmapStatus,
  SuggestedRoadmapDraft,
  AptitudeReport,
} from './types';
import { MAJOR_CURRICULUM_GUIDES, QUICK_COUNSELING_PROMPTS } from './data/curriculumData';
import {
  syncProfileToFirestore,
  createSessionInFirestore,
  updateSessionProgressInFirestore,
  archiveSessionInFirestore,
  deleteSessionInFirestore,
  createMessageInFirestore,
  createRoadmapInFirestore,
  updateRoadmapStatusInFirestore,
  deleteRoadmapInFirestore,
  syncAllWorkspaceToFirestore,
} from './services/storageService';
import {
  buildSummaryText,
  exportSummaryAsTxt,
  exportSummaryAsPdf,
} from './utils/exportSummary';
import counselorAvatarUrl from './assets/images/counselor_avatar_1791460475989.jpg';
import heroCompassUrl from './assets/images/hero_career_compass_1791460493819.jpg';
import majorBannerUrl from './assets/images/major_exploration_banner_1791460511502.jpg';

type ActiveSection = 'counseling' | 'curriculum' | 'roadmap' | 'diagnostic';

const COUNSELING_CATEGORIES: CounselingCategory[] = [
  '진로탐색',
  '학과선택',
  '고교학점제·과목선택',
  '학생부·세특설계',
  '학습·멘탈코칭',
];

const SEMESTERS: SemesterTarget[] = [
  '고1 1학기',
  '고1 2학기',
  '고2 1학기',
  '고2 2학기',
  '고3 1학기',
  '고3 2학기',
];

const ROADMAP_CATEGORIES: RoadmapCategory[] = [
  '선택과목',
  '창체·동아리',
  '세특·탐구주제',
  '독서·프로젝트',
  '진로체험',
];

interface UnifiedMessageMatch {
  sessionId: string;
  sessionTitle: string;
  sessionCategory: CounselingCategory;
  messageId: string;
  role: 'user' | 'assistant';
  content: string;
  recommendedMajors: string;
  actionItems: string;
  createdAt: string;
}

function renderHighlightedSnippet(text: string, keyword: string): React.ReactNode {
  const cleanKeyword = keyword.trim();
  if (!cleanKeyword) return text;

  const lowerText = text.toLowerCase();
  const lowerKey = cleanKeyword.toLowerCase();
  const matchIdx = lowerText.indexOf(lowerKey);

  // Extract a readable window around the first match if the message is long
  let snippet = text;
  if (text.length > 220 && matchIdx !== -1) {
    const start = Math.max(0, matchIdx - 70);
    const end = Math.min(text.length, matchIdx + cleanKeyword.length + 110);
    snippet = `${start > 0 ? '...' : ''}${text.slice(start, end)}${end < text.length ? '...' : ''}`;
  } else if (text.length > 220) {
    snippet = `${text.slice(0, 220)}...`;
  }

  const escaped = cleanKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = snippet.split(new RegExp(`(${escaped})`, 'gi'));

  return parts.map((part, idx) =>
    part.toLowerCase() === lowerKey ? (
      <mark key={idx} className="bg-[#BAE6FD] text-[#0F172A] font-semibold px-0.5 rounded-xs">
        {part}
      </mark>
    ) : (
      <React.Fragment key={idx}>{part}</React.Fragment>
    )
  );
}

export default function App() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('counseling');
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [studentId, setStudentId] = useState<string>('student_default_kr');

  // Workspace State (Synced with Express Backend Server + Firebase Firestore)
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [sessions, setSessions] = useState<CounselingSession[]>([]);
  const [messagesBySession, setMessagesBySession] = useState<Record<string, ChatMessage[]>>({});
  const [roadmaps, setRoadmaps] = useState<CareerRoadmapItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');

  // UI & Loading States
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState<boolean>(true);
  const [isSendingChat, setIsSendingChat] = useState<boolean>(false);
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);
  const [isGeneratingRoadmap, setIsGeneratingRoadmap] = useState<boolean>(false);
  const [isDiagnosing, setIsDiagnosing] = useState<boolean>(false);
  const [feedbackBanner, setFeedbackBanner] = useState<{ type: 'nominal' | 'error'; text: string } | null>(null);

  // Image Fallback States (Zero-Broken-Image Policy)
  const [avatarFailed, setAvatarFailed] = useState<boolean>(false);
  const [heroImgFailed, setHeroImgFailed] = useState<boolean>(false);
  const [majorImgFailed, setMajorImgFailed] = useState<boolean>(false);

  // Counseling Studio Filters & Inputs
  const [sessionFilterCategory, setSessionFilterCategory] = useState<string>('전체');
  const [sessionSearchQuery, setSessionSearchQuery] = useState<string>('');
  const [chatInput, setChatInput] = useState<string>('');
  const [newSessionCategory, setNewSessionCategory] = useState<CounselingCategory>('진로탐색');
  const [newSessionTitle, setNewSessionTitle] = useState<string>('');
  const [showNewSessionForm, setShowNewSessionForm] = useState<boolean>(false);

  // NEW 1: Unified Counseling Search ('상담 통합 검색') across all session messages
  const [unifiedSearchQuery, setUnifiedSearchQuery] = useState<string>('');
  const [unifiedSearchRoleFilter, setUnifiedSearchRoleFilter] = useState<'all' | 'assistant' | 'user'>('all');
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  // NEW 2: Summary Share & Export ('요약 공유') Modal State
  const [showSummaryShareModal, setShowSummaryShareModal] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [copiedSummary, setCopiedSummary] = useState<boolean>(false);

  // Curriculum Explorer Filters
  const [selectedCluster, setSelectedCluster] = useState<string>('전체');
  const [curriculumSearch, setCurriculumSearch] = useState<string>('');

  // Roadmap Filters & New Item Form
  const [roadmapStatusFilter, setRoadmapStatusFilter] = useState<'all' | RoadmapStatus>('all');
  const [roadmapSemesterFilter, setRoadmapSemesterFilter] = useState<string>('전체');
  const [newRoadmapDraft, setNewRoadmapDraft] = useState<SuggestedRoadmapDraft>({
    gradeTarget: '고2 2학기',
    category: '세특·탐구주제',
    title: '',
    description: '',
    relatedMajor: '',
  });
  const [aiRoadmapFocus, setAiRoadmapFocus] = useState<string>('');

  // RIASEC Diagnostic State
  const [riasecScores, setRiasecScores] = useState<Record<'R' | 'I' | 'A' | 'S' | 'E' | 'C', number>>({
    R: 3,
    I: 5,
    A: 3,
    S: 4,
    E: 3,
    C: 4,
  });
  const [diagnosticNote, setDiagnosticNote] = useState<string>(
    '수학적 원리와 데이터 분석을 활용해 실제 사람들의 건강이나 일상 문제를 해결하는 프로젝트를 할 때 가장 큰 흥미를 느낍니다.'
  );
  const [aptitudeReport, setAptitudeReport] = useState<AptitudeReport | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const notify = (text: string, type: 'nominal' | 'error' = 'nominal') => {
    setFeedbackBanner({ type, text });
    window.setTimeout(() => {
      setFeedbackBanner((prev) => (prev?.text === text ? null : prev));
    }, 4000);
  };

  // Track Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (user) {
        setStudentId(sanitizeId(user.uid));
      } else {
        setStudentId('student_default_kr');
      }
    });
    return () => unsubscribe();
  }, []);

  // Load workspace from Backend Server whenever studentId changes
  useEffect(() => {
    let cancelled = false;
    async function fetchWorkspace() {
      setIsLoadingWorkspace(true);
      try {
        const res = await fetch(`/api/workspace/${encodeURIComponent(studentId)}`);
        if (!res.ok) {
          throw new Error('서버에서 학생 진로 데이터를 불러오지 못했습니다.');
        }
        const data = await res.json();
        if (cancelled) return;

        setProfile(data.profile);
        setSessions(data.sessions || []);
        setMessagesBySession(data.messagesBySession || {});
        setRoadmaps(data.roadmaps || []);
        if (data.sessions && data.sessions.length > 0) {
          setActiveSessionId(data.sessions[0].sessionId);
        }

        // If authenticated with Google, also ensure Firestore has this workspace synced
        if (auth.currentUser && auth.currentUser.emailVerified && data.profile) {
          await syncAllWorkspaceToFirestore(
            data.profile,
            data.sessions || [],
            data.messagesBySession || {},
            data.roadmaps || []
          );
        }
      } catch (err) {
        if (!cancelled) {
          notify(err instanceof Error ? err.message : '데이터 로드 오류', 'error');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingWorkspace(false);
        }
      }
    }
    fetchWorkspace();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  useEffect(() => {
    if (!highlightedMessageId) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeSessionId, messagesBySession, highlightedMessageId]);

  const activeSession = sessions.find((s) => s.sessionId === activeSessionId) || sessions[0] || null;
  const activeMessages = activeSession ? messagesBySession[activeSession.sessionId] || [] : [];

  // Unified Search across ALL sessions & messages ('상담 통합 검색')
  const unifiedSearchResults = useMemo<UnifiedMessageMatch[]>(() => {
    const q = unifiedSearchQuery.trim().toLowerCase();
    if (!q) return [];

    const matches: UnifiedMessageMatch[] = [];
    for (const sess of sessions) {
      const msgs = messagesBySession[sess.sessionId] || [];
      for (const msg of msgs) {
        if (unifiedSearchRoleFilter !== 'all' && msg.role !== unifiedSearchRoleFilter) {
          continue;
        }
        const searchableText = [
          msg.content,
          msg.recommendedMajors,
          msg.actionItems,
          msg.suggestedRoadmap?.title || '',
          msg.suggestedRoadmap?.description || '',
          sess.title,
        ]
          .join(' ')
          .toLowerCase();

        if (searchableText.includes(q)) {
          matches.push({
            sessionId: sess.sessionId,
            sessionTitle: sess.title,
            sessionCategory: sess.category,
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
    return matches;
  }, [unifiedSearchQuery, unifiedSearchRoleFilter, sessions, messagesBySession]);

  const handleJumpToSearchedMessage = (sessionId: string, messageId: string) => {
    setActiveSessionId(sessionId);
    setHighlightedMessageId(messageId);
    window.setTimeout(() => {
      const el = document.getElementById(`msg-${messageId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 120);
    window.setTimeout(() => {
      setHighlightedMessageId((prev) => (prev === messageId ? null : prev));
    }, 3500);
  };

  // Summary Export Handlers ('요약 공유')
  const handleDownloadTxtSummary = () => {
    try {
      exportSummaryAsTxt(profile, activeSession, activeMessages, roadmaps);
      notify('상담 핵심 요약과 진로 로드맵이 텍스트(.txt) 파일로 저장되었습니다.');
    } catch (err) {
      notify(err instanceof Error ? err.message : '텍스트 내보내기 중 오류가 발생했습니다.', 'error');
    }
  };

  const handleDownloadPdfSummary = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      await exportSummaryAsPdf(profile, activeSession, activeMessages, roadmaps);
      notify('상담 핵심 요약과 진로 로드맵이 PDF(.pdf) 파일로 저장되었습니다.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'PDF 내보내기 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleCopySummaryText = async () => {
    try {
      const text = buildSummaryText(profile, activeSession, activeMessages, roadmaps);
      await navigator.clipboard.writeText(text);
      setCopiedSummary(true);
      notify('상담 핵심 요약과 로드맵 리포트가 클립보드에 복사되었습니다.');
      window.setTimeout(() => setCopiedSummary(false), 2500);
    } catch {
      notify('클립보드 복사에 실패했습니다. 파일 내보내기를 이용해 주세요.', 'error');
    }
  };

  // Handlers
  const handleGoogleAuth = async () => {
    try {
      if (firebaseUser) {
        await logOutFirebase();
        notify('로그아웃되었습니다. 기본 로컬 서버 모드로 전환됩니다.');
      } else {
        await signInWithGoogle();
        notify('Google 계정이 연동되어 백엔드 서버 및 클라우드 DB에 실시간 저장됩니다.');
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : '로그인 처리 중 오류가 발생했습니다.', 'error');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setIsSavingProfile(true);
    try {
      const res = await fetch(`/api/workspace/${encodeURIComponent(studentId)}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '프로필 저장 실패');
      setProfile(data.profile);

      if (firebaseUser) {
        await syncProfileToFirestore(data.profile);
      }
      notify('학생 진로 프로필이 백엔드 서버와 데이터베이스에 저장되었습니다.');
    } catch (err) {
      notify(err instanceof Error ? err.message : '프로필 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleCreateSession = async (
    customCategory?: CounselingCategory,
    customTitle?: string,
    initialQuestion?: string
  ) => {
    const category = customCategory || newSessionCategory;
    const title = (customTitle || newSessionTitle || `${category} 집중 상담`).trim();
    const generatedSessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    try {
      const res = await fetch(`/api/workspace/${encodeURIComponent(studentId)}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: generatedSessionId,
          category,
          title,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '세션 생성 실패');

      const createdSession: CounselingSession = data.session;
      const initialMsgs: ChatMessage[] = data.messages || [];

      setSessions((prev) => [createdSession, ...prev]);
      setMessagesBySession((prev) => ({
        ...prev,
        [createdSession.sessionId]: initialMsgs,
      }));
      setActiveSessionId(createdSession.sessionId);
      setNewSessionTitle('');
      setShowNewSessionForm(false);
      setActiveSection('counseling');

      if (firebaseUser) {
        await createSessionInFirestore(createdSession, initialMsgs);
      }

      if (initialQuestion) {
        await sendCounselingMessage(initialQuestion, createdSession.sessionId);
      } else {
        notify(`'${createdSession.title}' 상담 세션이 생성되어 서버에 저장되었습니다.`);
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : '상담 세션 생성 오류', 'error');
    }
  };

  const handleArchiveSession = async (sessionId: string) => {
    try {
      const res = await fetch(
        `/api/workspace/${encodeURIComponent(studentId)}/sessions/${encodeURIComponent(sessionId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'archived' }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '보관 실패');

      setSessions((prev) => prev.map((s) => (s.sessionId === sessionId ? data.session : s)));
      if (firebaseUser) {
        await archiveSessionInFirestore(sessionId);
      }
      notify('상담 세션이 보관(잠금) 상태로 전환되었습니다.');
    } catch (err) {
      notify(err instanceof Error ? err.message : '보관 처리 오류', 'error');
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      const res = await fetch(
        `/api/workspace/${encodeURIComponent(studentId)}/sessions/${encodeURIComponent(sessionId)}`,
        {
          method: 'DELETE',
        }
      );
      if (!res.ok) throw new Error('세션 삭제 실패');

      const remaining = sessions.filter((s) => s.sessionId !== sessionId);
      setSessions(remaining);
      setMessagesBySession((prev) => {
        const next = { ...prev };
        delete next[sessionId];
        return next;
      });
      if (activeSessionId === sessionId) {
        setActiveSessionId(remaining[0]?.sessionId || '');
      }
      if (firebaseUser) {
        await deleteSessionInFirestore(sessionId);
      }
      notify('상담 세션이 삭제되었습니다.');
    } catch (err) {
      notify(err instanceof Error ? err.message : '세션 삭제 오류', 'error');
    }
  };

  const sendCounselingMessage = async (rawText?: string, targetSessionId?: string) => {
    const textToSend = (rawText ?? chatInput).trim();
    const sid = targetSessionId || activeSession?.sessionId;
    if (!textToSend || !sid || isSendingChat) return;

    if (!rawText) {
      setChatInput('');
    }
    setIsSendingChat(true);

    const userMessageId = `msg_${Date.now()}_u`;
    const assistantMessageId = `msg_${Date.now()}_a`;

    // Optimistic UI append for user message
    const optimisticUserMsg: ChatMessage = {
      messageId: userMessageId,
      sessionId: sid,
      ownerId: studentId,
      role: 'user',
      content: textToSend,
      recommendedMajors: '',
      actionItems: '',
      createdAt: new Date().toISOString(),
    };

    setMessagesBySession((prev) => ({
      ...prev,
      [sid]: [...(prev[sid] || []), optimisticUserMsg],
    }));

    try {
      const res = await fetch('/api/counseling/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          sessionId: sid,
          message: textToSend,
          userMessageId,
          assistantMessageId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'AI 상담 응답 생성에 실패했습니다.');
      }

      const savedUserMsg: ChatMessage = data.userMessage;
      const savedAssistantMsg: ChatMessage = data.assistantMessage;
      const updatedSession: CounselingSession = data.session;
      const finalSid = updatedSession.sessionId || sid;

      setMessagesBySession((prev) => {
        const list = (prev[finalSid] || []).filter((m) => m.messageId !== userMessageId);
        return {
          ...prev,
          [finalSid]: [...list, savedUserMsg, savedAssistantMsg],
        };
      });
      setSessions((prev) => {
        const exists = prev.some((s) => s.sessionId === finalSid);
        return exists
          ? prev.map((s) => (s.sessionId === finalSid ? updatedSession : s))
          : [updatedSession, ...prev];
      });
      if (activeSessionId !== finalSid) {
        setActiveSessionId(finalSid);
      }

      if (firebaseUser) {
        await updateSessionProgressInFirestore(updatedSession);
        await createMessageInFirestore(finalSid, savedUserMsg);
        await createMessageInFirestore(finalSid, savedAssistantMsg);
      }
    } catch (err) {
      // Remove failed optimistic user message so chat state remains accurate
      setMessagesBySession((prev) => ({
        ...prev,
        [sid]: (prev[sid] || []).filter((m) => m.messageId !== userMessageId),
      }));
      notify(err instanceof Error ? err.message : 'AI 상담 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleAddRoadmapItem = async (draft: SuggestedRoadmapDraft) => {
    if (!draft.title.trim()) {
      notify('로드맵 활동 제목을 입력해 주세요.', 'error');
      return;
    }
    const roadmapId = `road_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    try {
      const res = await fetch(`/api/workspace/${encodeURIComponent(studentId)}/roadmaps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...draft,
          roadmapId,
          status: 'planned',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '로드맵 저장 실패');

      const created: CareerRoadmapItem = data.roadmap;
      setRoadmaps((prev) => [created, ...prev]);
      if (firebaseUser) {
        await createRoadmapInFirestore(created);
      }
      setNewRoadmapDraft({
        gradeTarget: '고2 2학기',
        category: '세특·탐구주제',
        title: '',
        description: '',
        relatedMajor: profile?.targetMajors || '',
      });
      notify(`'${created.title}' 항목이 학기별 진로 로드맵에 저장되었습니다.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : '로드맵 저장 오류', 'error');
    }
  };

  const handleUpdateRoadmapStatus = async (roadmapId: string, nextStatus: RoadmapStatus) => {
    try {
      const res = await fetch(
        `/api/workspace/${encodeURIComponent(studentId)}/roadmaps/${encodeURIComponent(roadmapId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextStatus }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '상태 변경 실패');

      setRoadmaps((prev) => prev.map((r) => (r.roadmapId === roadmapId ? data.roadmap : r)));
      if (firebaseUser) {
        await updateRoadmapStatusInFirestore(roadmapId, nextStatus);
      }
      notify('로드맵 진행 상태가 서버에 업데이트되었습니다.');
    } catch (err) {
      notify(err instanceof Error ? err.message : '로드맵 업데이트 오류', 'error');
    }
  };

  const handleDeleteRoadmap = async (roadmapId: string) => {
    try {
      const res = await fetch(
        `/api/workspace/${encodeURIComponent(studentId)}/roadmaps/${encodeURIComponent(roadmapId)}`,
        {
          method: 'DELETE',
        }
      );
      if (!res.ok) throw new Error('삭제 실패');

      setRoadmaps((prev) => prev.filter((r) => r.roadmapId !== roadmapId));
      if (firebaseUser) {
        await deleteRoadmapInFirestore(roadmapId);
      }
      notify('로드맵 항목이 삭제되었습니다.');
    } catch (err) {
      notify(err instanceof Error ? err.message : '로드맵 삭제 오류', 'error');
    }
  };

  const handleGenerateAiRoadmaps = async () => {
    if (isGeneratingRoadmap) return;
    setIsGeneratingRoadmap(true);
    try {
      const res = await fetch('/api/counseling/generate-roadmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          focusArea: aiRoadmapFocus,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI 로드맵 생성 실패');

      const createdList: CareerRoadmapItem[] = data.createdRoadmaps || [];
      setRoadmaps((prev) => [...createdList, ...prev]);

      if (firebaseUser) {
        for (const item of createdList) {
          await createRoadmapInFirestore(item);
        }
      }
      setAiRoadmapFocus('');
      notify(`AI가 학생 프로필에 맞춘 학기별 진로 로드맵 ${createdList.length}건을 설계하여 저장했습니다.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'AI 로드맵 설계 오류', 'error');
    } finally {
      setIsGeneratingRoadmap(false);
    }
  };

  const handleRunAptitudeDiagnostic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDiagnosing) return;
    setIsDiagnosing(true);
    try {
      const res = await fetch('/api/counseling/diagnose-aptitude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          scores: riasecScores,
          openAnswer: diagnosticNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '적성 진단 실패');

      setAptitudeReport(data.report);
      if (data.updatedProfile) {
        setProfile(data.updatedProfile);
        if (firebaseUser) {
          await syncProfileToFirestore(data.updatedProfile);
        }
      }
      notify('RIASEC 진로 적성 진단 결과가 분석되어 학생 프로필에 반영되었습니다.');
    } catch (err) {
      notify(err instanceof Error ? err.message : '적성 진단 분석 오류', 'error');
    } finally {
      setIsDiagnosing(false);
    }
  };

  // Filtered Lists
  const filteredSessions = sessions.filter((s) => {
    const matchesCat = sessionFilterCategory === '전체' || s.category === sessionFilterCategory;
    const matchesQuery =
      !sessionSearchQuery.trim() ||
      s.title.toLowerCase().includes(sessionSearchQuery.toLowerCase()) ||
      s.summary.toLowerCase().includes(sessionSearchQuery.toLowerCase());
    return matchesCat && matchesQuery;
  });

  const filteredMajors = MAJOR_CURRICULUM_GUIDES.filter((m) => {
    const matchesCluster = selectedCluster === '전체' || m.cluster === selectedCluster;
    const matchesQuery =
      !curriculumSearch.trim() ||
      m.majorName.toLowerCase().includes(curriculumSearch.toLowerCase()) ||
      m.generalElectives.toLowerCase().includes(curriculumSearch.toLowerCase()) ||
      m.careerElectives.toLowerCase().includes(curriculumSearch.toLowerCase()) ||
      m.sampleSeteukTopic.toLowerCase().includes(curriculumSearch.toLowerCase());
    return matchesCluster && matchesQuery;
  });

  const filteredRoadmaps = roadmaps.filter((r) => {
    const matchesStatus = roadmapStatusFilter === 'all' || r.status === roadmapStatusFilter;
    const matchesSemester = roadmapSemesterFilter === '전체' || r.gradeTarget === roadmapSemesterFilter;
    return matchesStatus && matchesSemester;
  });

  const completedRoadmapCount = roadmaps.filter((r) => r.status === 'completed').length;
  const inProgressRoadmapCount = roadmaps.filter((r) => r.status === 'in_progress').length;
  const totalMessagesCount = Object.values(messagesBySession).reduce((acc, list) => acc + list.length, 0);

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-3.5 bg-white border-b border-[#E2E8F0]">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('counseling');
          }}
          className="font-display text-xl font-semibold tracking-tight text-[#0F172A] whitespace-nowrap"
        >
          나침반 Nachimban
        </a>

        {/* Zone 2: 4 clean single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#475569]">
          <button
            type="button"
            onClick={() => setActiveSection('counseling')}
            className={`py-1 transition-colors whitespace-nowrap border-b-2 ${
              activeSection === 'counseling'
                ? 'border-[#0284C7] text-[#0F172A] font-semibold'
                : 'border-transparent hover:text-[#0F172A]'
            }`}
          >
            상담 스튜디오
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('curriculum')}
            className={`py-1 transition-colors whitespace-nowrap border-b-2 ${
              activeSection === 'curriculum'
                ? 'border-[#0284C7] text-[#0F172A] font-semibold'
                : 'border-transparent hover:text-[#0F172A]'
            }`}
          >
            고교학점제·학과 탐색
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('roadmap')}
            className={`py-1 transition-colors whitespace-nowrap border-b-2 ${
              activeSection === 'roadmap'
                ? 'border-[#0284C7] text-[#0F172A] font-semibold'
                : 'border-transparent hover:text-[#0F172A]'
            }`}
          >
            학기별 진로 로드맵
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('diagnostic')}
            className={`py-1 transition-colors whitespace-nowrap border-b-2 ${
              activeSection === 'diagnostic'
                ? 'border-[#0284C7] text-[#0F172A] font-semibold'
                : 'border-transparent hover:text-[#0F172A]'
            }`}
          >
            적성·흥미 진단
          </button>
        </nav>

        {/* Zone 3: 1-2 primary actions */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleGoogleAuth}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-[#334155] bg-[#F1F5F9] hover:bg-[#E2E8F0] rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {firebaseUser ? (
              <>
                <LogOut className="w-3.5 h-3.5" />
                <span>클라우드 연동됨 ({firebaseUser.displayName || '학생'})</span>
              </>
            ) : (
              <>
                <LogIn className="w-3.5 h-3.5" />
                <span>Google 계정 동기화</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveSection('counseling');
              setShowNewSessionForm(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0284C7] hover:bg-[#0369A1] rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>새 진로 상담</span>
          </button>
        </div>
      </header>

      {/* Mobile Navigation Bar (Single-Line Controls) */}
      <div className="md:hidden flex items-center gap-2 px-4 py-2 bg-white border-b border-[#E2E8F0] overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveSection('counseling')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
            activeSection === 'counseling' ? 'bg-[#0284C7] text-white' : 'text-[#475569]'
          }`}
        >
          상담 스튜디오
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('curriculum')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
            activeSection === 'curriculum' ? 'bg-[#0284C7] text-white' : 'text-[#475569]'
          }`}
        >
          고교학점제·학과 탐색
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('roadmap')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
            activeSection === 'roadmap' ? 'bg-[#0284C7] text-white' : 'text-[#475569]'
          }`}
        >
          학기별 진로 로드맵
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('diagnostic')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
            activeSection === 'diagnostic' ? 'bg-[#0284C7] text-white' : 'text-[#475569]'
          }`}
        >
          적성·흥미 진단
        </button>
      </div>

      {/* Accessible Non-Hue-Only Notification Banner */}
      {feedbackBanner && (
        <div
          role="status"
          className={`px-6 py-2.5 text-xs font-medium border-b flex items-center justify-between ${
            feedbackBanner.type === 'nominal'
              ? 'bg-[#F0FDF4] text-[#065F46] border-[#BBF7D0]'
              : 'bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]'
          }`}
        >
          <span>
            {feedbackBanner.type === 'nominal' ? '● 저장 완료 — ' : '▲ 오류 안내 — '}
            {feedbackBanner.text}
          </span>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="text-xs underline ml-4 whitespace-nowrap"
          >
            닫기
          </button>
        </div>
      )}

      {/* Main Content Viewport (1440px Baseline Container) */}
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-6">
        {isLoadingWorkspace ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-3 h-[680px] bg-white border border-[#E2E8F0] rounded-xl p-5 animate-pulse" />
            <div className="lg:col-span-6 h-[680px] bg-white border border-[#E2E8F0] rounded-xl p-5 animate-pulse" />
            <div className="lg:col-span-3 h-[680px] bg-white border border-[#E2E8F0] rounded-xl p-5 animate-pulse" />
          </div>
        ) : (
          <>
            {/* SECTION 1: COUNSELING STUDIO */}
            {activeSection === 'counseling' && (
              <div className="space-y-6">
                {/* Unified Counseling Message Search Bar ('상담 통합 검색') */}
                <section
                  aria-label="상담 통합 검색"
                  className="bg-white border border-[#E2E8F0] rounded-xl p-4 sm:p-5 space-y-4"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-[#64748B]">
                        <span className="font-semibold text-[#0284C7]">상담 통합 검색</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          전체 <span className="font-mono tabular-nums font-semibold">{sessions.length}</span>개 세션 /{' '}
                          <span className="font-mono tabular-nums font-semibold">{totalMessagesCount}</span>개 메시지 대상
                        </span>
                      </div>
                      <h2 className="text-sm sm:text-base font-semibold text-[#0F172A] mt-0.5">
                        모든 상담 세션의 대화 내용·추천 학과·실천 과제 통합 키워드 검색
                      </h2>
                    </div>

                    {/* Interactive Role Filter Controls */}
                    <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-lg self-start md:self-auto">
                      {[
                        { key: 'all', label: '전체 메시지' },
                        { key: 'assistant', label: 'AI 멘토 답변' },
                        { key: 'user', label: '나의 질문' },
                      ].map((tab) => (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setUnifiedSearchRoleFilter(tab.key as 'all' | 'assistant' | 'user')}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                            unifiedSearchRoleFilter === tab.key
                              ? 'bg-white text-[#0F172A] shadow-xs'
                              : 'text-[#64748B] hover:text-[#0F172A]'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[240px]">
                      <Search className="w-4 h-4 text-[#0284C7] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={unifiedSearchQuery}
                        onChange={(e) => setUnifiedSearchQuery(e.target.value)}
                        placeholder="전체 상담 기록에서 키워드 검색 (예: 미적분, 기하, 경사하강법, 베이즈, 인공지능, 세특)..."
                        className="w-full pl-10 pr-9 py-2.5 text-xs sm:text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#0284C7]"
                      />
                      {unifiedSearchQuery && (
                        <button
                          type="button"
                          title="검색어 지우기"
                          onClick={() => setUnifiedSearchQuery('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A]"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Quick Search Keyword Shortcuts */}
                    <div className="flex items-center gap-1.5 overflow-x-auto">
                      <span className="text-xs text-[#64748B] whitespace-nowrap">자주 찾는 키워드:</span>
                      {['세특', '선택과목', '경사하강법', '베이즈', '인공지능'].map((kw) => (
                        <button
                          key={kw}
                          type="button"
                          onClick={() => setUnifiedSearchQuery(kw)}
                          className="px-2.5 py-1.5 text-xs font-medium text-[#334155] bg-[#F1F5F9] hover:bg-[#E2E8F0] rounded-md transition-colors whitespace-nowrap shrink-0"
                        >
                          {kw}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Unified Search Results Panel */}
                  {unifiedSearchQuery.trim() !== '' && (
                    <div className="pt-3 border-t border-[#E2E8F0] space-y-3">
                      <div className="flex items-center justify-between text-xs text-[#475569]">
                        <span>
                          키워드 <strong className="text-[#0284C7]">&ldquo;{unifiedSearchQuery}&rdquo;</strong> 통합 검색 결과 총{' '}
                          <span className="font-mono tabular-nums font-semibold text-[#0F172A]">
                            {unifiedSearchResults.length}
                          </span>
                          건
                        </span>
                        <button
                          type="button"
                          onClick={() => setUnifiedSearchQuery('')}
                          className="text-xs text-[#64748B] hover:text-[#0F172A] underline whitespace-nowrap"
                        >
                          검색 결과 닫기
                        </button>
                      </div>

                      {unifiedSearchResults.length === 0 ? (
                        <div className="py-6 text-center bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                          <p className="text-xs text-[#64748B]">
                            일치하는 상담 메시지 내용이 없습니다. 다른 교과명이나 전공 키워드로 검색해 보세요.
                          </p>
                        </div>
                      ) : (
                        <div className="divide-y divide-[#E2E8F0] max-h-[280px] overflow-y-auto bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-4">
                          {unifiedSearchResults.map((match) => (
                            <div
                              key={`${match.sessionId}_${match.messageId}`}
                              className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                            >
                              <div className="space-y-1 min-w-0 flex-1">
                                {/* Zero-Pill Unboxed Metadata */}
                                <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#64748B]">
                                  <span className="font-semibold text-[#0284C7]">{match.sessionCategory}</span>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-medium text-[#0F172A] truncate">{match.sessionTitle}</span>
                                  <span aria-hidden="true">·</span>
                                  <span>{match.role === 'assistant' ? '나침반 멘토 답변' : '나의 질문'}</span>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono tabular-nums">
                                    {new Date(match.createdAt).toLocaleDateString('ko-KR')}
                                  </span>
                                </div>

                                <p className="text-xs text-[#334155] leading-relaxed">
                                  {renderHighlightedSnippet(match.content, unifiedSearchQuery)}
                                </p>

                                {(match.recommendedMajors || match.actionItems) && (
                                  <div className="text-xs text-[#64748B] truncate">
                                    {match.recommendedMajors && (
                                      <span>
                                        추천 학과: {renderHighlightedSnippet(match.recommendedMajors, unifiedSearchQuery)}
                                      </span>
                                    )}
                                    {match.recommendedMajors && match.actionItems && <span aria-hidden="true"> · </span>}
                                    {match.actionItems && (
                                      <span>
                                        실천 과제: {renderHighlightedSnippet(match.actionItems, unifiedSearchQuery)}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => handleJumpToSearchedMessage(match.sessionId, match.messageId)}
                                className="px-3 py-1.5 text-xs font-semibold text-[#0284C7] bg-white border border-[#BAE6FD] hover:bg-[#F0F9FF] rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
                              >
                                해당 대화로 이동
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Left Column: Counseling Sessions List */}
                  <section className="lg:col-span-3 bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-semibold text-[#0F172A]">진로 상담 기록</h2>
                        <p className="text-xs text-[#64748B] mt-0.5">
                          총 <span className="font-mono tabular-nums font-semibold">{sessions.length}</span>개 세션 저장됨
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowNewSessionForm((prev) => !prev)}
                        className="px-3 py-1.5 text-xs font-medium text-[#0284C7] bg-[#F0F9FF] hover:bg-[#E0F2FE] rounded-lg transition-colors whitespace-nowrap"
                      >
                        {showNewSessionForm ? '취소' : '+ 주제별 상담'}
                      </button>
                    </div>

                    {showNewSessionForm && (
                      <div className="pt-3 border-t border-[#E2E8F0] flex flex-col gap-3">
                        <label className="text-xs font-medium text-[#334155]">
                          상담 영역 선택
                          <select
                            value={newSessionCategory}
                            onChange={(e) => setNewSessionCategory(e.target.value as CounselingCategory)}
                            className="mt-1 w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                          >
                            {COUNSELING_CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-xs font-medium text-[#334155]">
                          상담 제목
                          <input
                            type="text"
                            value={newSessionTitle}
                            onChange={(e) => setNewSessionTitle(e.target.value)}
                            placeholder="예: 고2 2학기 수학·정보 세특 설계"
                            maxLength={120}
                            className="mt-1 w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => handleCreateSession()}
                          className="w-full py-2 text-xs font-semibold text-white bg-[#0284C7] hover:bg-[#0369A1] rounded-lg transition-colors whitespace-nowrap"
                        >
                          상담방 개설 및 저장
                        </button>
                      </div>
                    )}

                    {/* Session List Filter Input */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={sessionSearchQuery}
                        onChange={(e) => setSessionSearchQuery(e.target.value)}
                        placeholder="세션 제목·요약 필터..."
                        className="w-full pl-8 pr-3 py-2 text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#0284C7]"
                      />
                    </div>

                    <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-lg overflow-x-auto">
                      {['전체', '고교학점제·과목선택', '학생부·세특설계', '학과선택', '진로탐색'].map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setSessionFilterCategory(cat)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                            sessionFilterCategory === cat
                              ? 'bg-white text-[#0F172A] shadow-xs'
                              : 'text-[#64748B] hover:text-[#0F172A]'
                          }`}
                        >
                          {cat === '고교학점제·과목선택'
                            ? '과목선택'
                            : cat === '학생부·세특설계'
                            ? '세특설계'
                            : cat}
                        </button>
                      ))}
                    </div>

                    {/* Session Items (Zero-Pill Unboxed Metadata) */}
                    <div className="flex flex-col divide-y divide-[#F1F5F9] max-h-[480px] overflow-y-auto">
                      {filteredSessions.length === 0 ? (
                        <div className="py-8 text-center">
                          <p className="text-xs text-[#64748B]">조건에 맞는 상담 세션이 없습니다.</p>
                          <button
                            type="button"
                            onClick={() => handleCreateSession('진로탐색', '나만의 첫 진로 탐색 상담')}
                            className="mt-3 px-3 py-1.5 text-xs font-medium text-[#0284C7] hover:underline"
                          >
                            + 첫 상담 세션 시작하기
                          </button>
                        </div>
                      ) : (
                        filteredSessions.map((sess) => {
                          const isSelected = activeSession?.sessionId === sess.sessionId;
                          return (
                            <div
                              key={sess.sessionId}
                              className={`py-3.5 px-3 transition-colors rounded-lg ${
                                isSelected ? 'bg-[#F0F9FF]' : 'hover:bg-[#F8FAFC]'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => setActiveSessionId(sess.sessionId)}
                                  className="text-left flex-1 min-w-0"
                                >
                                  {/* Unboxed static metadata with · separator */}
                                  <div className="flex items-center gap-1.5 text-xs text-[#64748B] truncate">
                                    <span className="font-medium text-[#0284C7]">{sess.category}</span>
                                    <span aria-hidden="true">·</span>
                                    <span className="font-mono tabular-nums">{sess.messageCount}개 대화</span>
                                    <span aria-hidden="true">·</span>
                                    <span>{sess.status === 'archived' ? '보관됨' : '진행중'}</span>
                                  </div>
                                  <h3 className="text-sm font-semibold text-[#0F172A] mt-1 truncate">
                                    {sess.title}
                                  </h3>
                                  <p className="text-xs text-[#475569] mt-1 line-clamp-2">{sess.summary}</p>
                                </button>

                                <div className="flex items-center gap-1 shrink-0">
                                  {sess.status !== 'archived' && (
                                    <button
                                      type="button"
                                      title="상담 보관(잠금)"
                                      onClick={() => handleArchiveSession(sess.sessionId)}
                                      className="p-1.5 text-[#64748B] hover:text-[#0F172A] rounded"
                                    >
                                      <Archive className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    title="상담 삭제"
                                    onClick={() => handleDeleteSession(sess.sessionId)}
                                    className="p-1.5 text-[#64748B] hover:text-[#DC2626] rounded"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </section>

                  {/* Center Column: Interactive AI Career Counseling Stage */}
                  <section className="lg:col-span-6 bg-white border border-[#E2E8F0] rounded-xl flex flex-col min-h-[680px] max-h-[760px]">
                    {/* Mentor Header with Top-Right '요약 공유' Action */}
                    <div className="p-5 border-b border-[#E2E8F0] flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-11 h-11 rounded-full overflow-hidden border border-[#E2E8F0] shrink-0 bg-[#E0F2FE] flex items-center justify-center">
                          {!avatarFailed ? (
                            <img
                              src={counselorAvatarUrl}
                              alt="나침반 AI 진로 멘토 프로필"
                              referrerPolicy="no-referrer"
                              onError={() => setAvatarFailed(true)}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Compass className="w-5 h-5 text-[#0284C7]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-xs text-[#64748B]">
                            <span>나침반 진로·진학 멘토</span>
                            <span aria-hidden="true">·</span>
                            <span>{activeSession?.category || '맞춤 상담'}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {activeSession?.status === 'archived' ? '▲ 보관 완료(읽기 전용)' : '● 실시간 상담 가능'}
                            </span>
                          </div>
                          <h1 className="text-base font-semibold text-[#0F172A] truncate mt-0.5">
                            {activeSession?.title || '새 상담 세션을 선택하거나 시작하세요'}
                          </h1>
                        </div>
                      </div>

                      {/* Top-Right Controls: '요약 공유' Button + Roadmap Link */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setShowSummaryShareModal(true)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0F172A] bg-[#F1F5F9] hover:bg-[#E2E8F0] rounded-lg transition-colors whitespace-nowrap shrink-0"
                        >
                          <Share2 className="w-3.5 h-3.5 text-[#0284C7]" />
                          <span>요약 공유</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveSection('roadmap')}
                          className="px-2.5 py-1.5 text-xs font-medium text-[#0284C7] hover:underline whitespace-nowrap shrink-0"
                        >
                          로드맵(<span className="font-mono tabular-nums">{roadmaps.length}</span>)
                        </button>
                      </div>
                    </div>

                    {/* Quick Topic Starters */}
                    <div className="px-5 py-2.5 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center gap-2 overflow-x-auto">
                      <span className="text-xs font-medium text-[#64748B] whitespace-nowrap shrink-0">추천 질문:</span>
                      {QUICK_COUNSELING_PROMPTS.map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          disabled={isSendingChat || activeSession?.status === 'archived'}
                          onClick={() => sendCounselingMessage(item.prompt)}
                          className="px-2.5 py-1 text-xs text-[#334155] bg-white border border-[#CBD5E1] hover:border-[#0284C7] hover:text-[#0284C7] rounded-md transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>

                    {/* Chat Messages Stream */}
                    <div className="flex-1 p-5 overflow-y-auto space-y-5">
                      {activeMessages.map((msg) => {
                        const isUser = msg.role === 'user';
                        const isHighlighted = highlightedMessageId === msg.messageId;
                        return (
                          <div
                            id={`msg-${msg.messageId}`}
                            key={msg.messageId}
                            className={`flex flex-col transition-all ${isUser ? 'items-end' : 'items-start'} ${
                              isHighlighted ? 'ring-2 ring-[#0284C7] rounded-xl p-1.5 bg-[#F0F9FF]/60' : ''
                            }`}
                          >
                            <div className="flex items-center gap-2 text-xs text-[#64748B] mb-1.5">
                              <span className="font-medium text-[#334155]">
                                {isUser ? profile?.displayName || '학생' : '나침반 멘토'}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                {new Date(msg.createdAt).toLocaleTimeString('ko-KR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>

                            <div
                              className={`max-w-[90%] rounded-xl px-4 py-3.5 text-sm leading-relaxed whitespace-pre-wrap ${
                                isUser
                                  ? 'bg-[#0F172A] text-white'
                                  : 'bg-[#F8FAFC] text-[#0F172A] border border-[#E2E8F0]'
                              }`}
                            >
                              {msg.content}

                              {/* Assistant Structured Follow-up Metadata & 1-Click Roadmap Card */}
                              {!isUser && (msg.recommendedMajors || msg.actionItems || msg.suggestedRoadmap) && (
                                <div className="mt-4 pt-3.5 border-t border-[#E2E8F0] space-y-3 text-xs">
                                  {msg.recommendedMajors && (
                                    <div>
                                      <span className="font-semibold text-[#0F172A]">연계 추천 학과: </span>
                                      <span className="text-[#0284C7]">{msg.recommendedMajors}</span>
                                    </div>
                                  )}

                                  {msg.actionItems && (
                                    <div>
                                      <span className="font-semibold text-[#0F172A]">이번 학기 실천 과제: </span>
                                      <span className="text-[#475569]">{msg.actionItems}</span>
                                    </div>
                                  )}

                                  {msg.suggestedRoadmap && (
                                    <div className="pt-2 border-t border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="text-xs text-[#64748B]">
                                          <span>맞춤 로드맵 제안</span>
                                          <span aria-hidden="true"> · </span>
                                          <span className="font-semibold text-[#0284C7]">
                                            {msg.suggestedRoadmap.gradeTarget}
                                          </span>
                                          <span aria-hidden="true"> · </span>
                                          <span>{msg.suggestedRoadmap.category}</span>
                                        </div>
                                        <p className="text-xs font-semibold text-[#0F172A] mt-0.5">
                                          {msg.suggestedRoadmap.title}
                                        </p>
                                        <p className="text-xs text-[#475569] mt-0.5">
                                          {msg.suggestedRoadmap.description}
                                        </p>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          msg.suggestedRoadmap && handleAddRoadmapItem(msg.suggestedRoadmap)
                                        }
                                        className="px-3 py-2 text-xs font-semibold text-white bg-[#0284C7] hover:bg-[#0369A1] rounded-lg transition-colors whitespace-nowrap shrink-0"
                                      >
                                        + 내 로드맵에 저장
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {isSendingChat && (
                        <div className="flex flex-col items-start">
                          <div className="text-xs text-[#64748B] mb-1">나침반 멘토 · 분석 중...</div>
                          <div className="px-4 py-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs text-[#475569]">
                            학생의 희망 전공과 고교학점제 선택과목·세특 데이터를 바탕으로 맞춤형 가이드를 작성하고 있습니다...
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>

                    {/* Message Input Form */}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        sendCounselingMessage();
                      }}
                      className="p-4 border-t border-[#E2E8F0] bg-white flex items-center gap-3"
                    >
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        disabled={isSendingChat || activeSession?.status === 'archived'}
                        placeholder={
                          activeSession?.status === 'archived'
                            ? '보관된 상담 세션입니다. 새 진로 상담을 시작해 주세요.'
                            : '고민 중인 학과, 선택과목 조합, 세특 탐구 주제를 자유롭게 질문해 보세요...'
                        }
                        maxLength={5000}
                        className="flex-1 px-4 py-2.5 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#0284C7] disabled:opacity-60"
                      />
                      <button
                        type="submit"
                        disabled={isSendingChat || !chatInput.trim() || activeSession?.status === 'archived'}
                        className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-[#0284C7] hover:bg-[#0369A1] rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>질문 전송</span>
                      </button>
                    </form>
                  </section>

                  {/* Right Column: Student Career Profile Card & Editor */}
                  <section className="lg:col-span-3 bg-white border border-[#E2E8F0] rounded-xl p-5">
                    <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
                      <div>
                        <h2 className="text-base font-semibold text-[#0F172A]">나의 진로 프로필</h2>
                        <p className="text-xs text-[#64748B] mt-0.5">AI 맞춤 상담의 기준 데이터로 활용됩니다</p>
                      </div>
                    </div>

                    {profile && (
                      <form onSubmit={handleSaveProfile} className="mt-4 space-y-3.5">
                        <div>
                          <label className="block text-xs font-medium text-[#334155]">이름 / 닉네임</label>
                          <input
                            type="text"
                            value={profile.displayName}
                            onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                            maxLength={60}
                            required
                            className="mt-1 w-full px-3 py-1.5 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-xs font-medium text-[#334155]">현재 학년</label>
                            <select
                              value={profile.grade}
                              onChange={(e) => setProfile({ ...profile, grade: e.target.value as GradeLevel })}
                              className="mt-1 w-full px-2.5 py-1.5 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                            >
                              <option value="고1">고1</option>
                              <option value="고2">고2</option>
                              <option value="고3">고3</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-[#334155]">희망 계열</label>
                            <select
                              value={profile.track}
                              onChange={(e) => setProfile({ ...profile, track: e.target.value as AcademicTrack })}
                              className="mt-1 w-full px-2.5 py-1.5 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                            >
                              <option value="미정/통합">미정/통합</option>
                              <option value="인문·사회">인문·사회</option>
                              <option value="자연·공학">자연·공학</option>
                              <option value="융합·IT">융합·IT</option>
                              <option value="예체능">예체능</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-[#334155]">홀랜드(RIASEC) 적성 코드</label>
                            <button
                              type="button"
                              onClick={() => setActiveSection('diagnostic')}
                              className="text-xs text-[#0284C7] hover:underline"
                            >
                              적성 진단하기
                            </button>
                          </div>
                          <input
                            type="text"
                            value={profile.hollandCode}
                            onChange={(e) => setProfile({ ...profile, hollandCode: e.target.value })}
                            maxLength={20}
                            className="mt-1 w-full px-3 py-1.5 text-xs font-mono bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-[#334155]">선호·강점 교과목</label>
                          <input
                            type="text"
                            value={profile.favoriteSubjects}
                            onChange={(e) => setProfile({ ...profile, favoriteSubjects: e.target.value })}
                            maxLength={200}
                            className="mt-1 w-full px-3 py-1.5 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-[#334155]">목표 대학 학과</label>
                          <input
                            type="text"
                            value={profile.targetMajors}
                            onChange={(e) => setProfile({ ...profile, targetMajors: e.target.value })}
                            maxLength={200}
                            className="mt-1 w-full px-3 py-1.5 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-[#334155]">진로 비전 및 꿈</label>
                          <textarea
                            rows={2}
                            value={profile.careerGoal}
                            onChange={(e) => setProfile({ ...profile, careerGoal: e.target.value })}
                            maxLength={300}
                            className="mt-1 w-full px-3 py-1.5 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-[#334155]">나의 탐구 강점·특성</label>
                          <textarea
                            rows={2}
                            value={profile.strengths}
                            onChange={(e) => setProfile({ ...profile, strengths: e.target.value })}
                            maxLength={300}
                            className="mt-1 w-full px-3 py-1.5 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={isSavingProfile}
                          className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-white bg-[#0F172A] hover:bg-[#1E293B] rounded-lg transition-colors whitespace-nowrap"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>{isSavingProfile ? '서버에 저장 중...' : '진로 프로필 저장'}</span>
                        </button>
                      </form>
                    )}
                  </section>
                </div>
              </div>
            )}

            {/* SECTION 2: HIGH SCHOOL CREDIT SYSTEM & MAJOR EXPLORER */}
            {activeSection === 'curriculum' && (
              <div className="space-y-8">
                {/* Two-Zone Educational Header Stage */}
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                  <div className="lg:col-span-7 space-y-3">
                    <div className="text-xs text-[#0284C7] font-semibold">
                      2022 개정 교육과정 · 고교학점제 전공 연계 가이드
                    </div>
                    <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[#0F172A]">
                      희망 학과별 핵심 권장과목 및 세특 탐구 설계도
                    </h1>
                    <p className="text-sm text-[#475569] max-w-2xl">
                      대학 전공마다 고등학교에서 이수하기를 권장하는 일반선택·진로선택 과목이 다릅니다. 관심 계열을 선택해 필수 이수 과목과 학생부 세부능력 및 특기사항(세특) 심화 주제를 확인하고, 바로 AI 멘토와 상담을 이어가세요.
                    </p>

                    <div className="pt-2 flex flex-wrap items-center gap-3">
                      <div className="relative flex-1 min-w-[240px]">
                        <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={curriculumSearch}
                          onChange={(e) => setCurriculumSearch(e.target.value)}
                          placeholder="학과명, 선택과목(예: 미적분, 기하, 화학II), 탐구 키워드 검색..."
                          className="w-full pl-9 pr-4 py-2 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#0284C7]"
                        />
                      </div>

                      <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-lg overflow-x-auto">
                        {['전체', '융합·IT', '자연·공학', '의약·생명', '인문·사회', '예체능·디자인'].map((cluster) => (
                          <button
                            key={cluster}
                            type="button"
                            onClick={() => setSelectedCluster(cluster)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                              selectedCluster === cluster
                                ? 'bg-white text-[#0F172A] shadow-xs'
                                : 'text-[#64748B] hover:text-[#0F172A]'
                            }`}
                          >
                            {cluster}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-5">
                    <div className="aspect-4/3 rounded-lg overflow-hidden border border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-center">
                      {!majorImgFailed ? (
                        <img
                          src={majorBannerUrl}
                          alt="고교학점제 전공 연계 아키텍처 다이어그램"
                          referrerPolicy="no-referrer"
                          onError={() => setMajorImgFailed(true)}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="p-6 text-center">
                          <BookOpen className="w-8 h-8 text-[#0284C7] mx-auto mb-2" />
                          <p className="text-xs font-medium text-[#475569]">전공 계열별 선택과목 및 세특 연계 맵</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Major Curriculum Grid (Single-Elevation Cards, Unboxed Metadata) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {filteredMajors.map((guide) => (
                    <article
                      key={guide.id}
                      className="bg-white border border-[#E2E8F0] rounded-xl p-6 flex flex-col justify-between gap-5"
                    >
                      <div className="space-y-3">
                        {/* Unboxed Metadata Line */}
                        <div className="flex items-center gap-2 text-xs text-[#64748B]">
                          <span className="font-semibold text-[#0284C7]">{guide.cluster}</span>
                          <span aria-hidden="true">·</span>
                          <span>고교학점제 핵심 권장 트랙</span>
                        </div>

                        <h2 className="text-lg font-semibold text-[#0F172A]">{guide.majorName}</h2>
                        <p className="text-sm text-[#475569]">{guide.coreDescription}</p>

                        <div className="pt-3 border-t border-[#F1F5F9] space-y-2 text-xs">
                          <div>
                            <span className="font-semibold text-[#0F172A]">권장 일반선택과목: </span>
                            <span className="text-[#334155]">{guide.generalElectives}</span>
                          </div>
                          <div>
                            <span className="font-semibold text-[#0F172A]">권장 진로·융합선택과목: </span>
                            <span className="text-[#0284C7] font-medium">{guide.careerElectives}</span>
                          </div>
                          <div>
                            <span className="font-semibold text-[#0F172A]">핵심 탐구 키워드: </span>
                            <span className="text-[#475569]">{guide.inquiryKeywords.join(' · ')}</span>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-[#F1F5F9]">
                          <div className="text-xs font-semibold text-[#0F172A] mb-1">
                            교과 연계 세특(세부능력 및 특기사항) 예시 주제
                          </div>
                          <p className="text-xs text-[#334155] leading-relaxed">{guide.sampleSeteukTopic}</p>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleAddRoadmapItem({
                              gradeTarget: `${profile?.grade || '고2'} 2학기` as SemesterTarget,
                              category: '세특·탐구주제',
                              title: `[${guide.majorName}] 심화 세특 탐구`,
                              description: guide.sampleSeteukTopic,
                              relatedMajor: guide.majorName,
                            })
                          }
                          className="px-3.5 py-2 text-xs font-medium text-[#0F172A] bg-[#F1F5F9] hover:bg-[#E2E8F0] rounded-lg transition-colors whitespace-nowrap"
                        >
                          + 이 세특 주제를 내 로드맵에 저장
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleCreateSession(
                              '고교학점제·과목선택',
                              `${guide.majorName} 진학 맞춤 과목·세특 상담`,
                              `${guide.majorName} 진학을 목표로 하고 있어. 현재 내 선호 과목(${profile?.favoriteSubjects})을 고려했을 때 어떤 진로선택과목과 세특 주제를 준비하면 좋을지 구체적으로 설계해 줘.`
                            )
                          }
                          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0284C7] hover:bg-[#0369A1] rounded-lg transition-colors whitespace-nowrap"
                        >
                          <span>이 전공으로 AI 상담 시작</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}

            {/* SECTION 3: SEMESTER-BY-SEMESTER CAREER ROADMAP */}
            {activeSection === 'roadmap' && (
              <div className="space-y-8">
                {/* Editorial Hero Banner with Measured Scrim */}
                <div className="relative rounded-xl overflow-hidden border border-[#E2E8F0] bg-[#0F172A] min-h-[220px] flex items-end">
                  {!heroImgFailed && (
                    <img
                      src={heroCompassUrl}
                      alt="고등학생 학기별 진로 로드맵 플래너"
                      referrerPolicy="no-referrer"
                      onError={() => setHeroImgFailed(true)}
                      className="absolute inset-0 w-full h-full object-cover opacity-55"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent" />

                  <div className="relative z-10 p-6 sm:p-8 w-full flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                    <div className="space-y-2 text-white">
                      <div className="flex items-center gap-2 text-xs text-slate-300">
                        <span>{profile?.displayName}의 학생부·진로 설계</span>
                        <span aria-hidden="true">·</span>
                        <span>목표 학과: {profile?.targetMajors}</span>
                      </div>
                      <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-wide">
                        학기별 고교 진로·세특 로드맵
                      </h1>
                      <p className="text-xs sm:text-sm text-slate-200 max-w-2xl">
                        고1부터 고3까지 학기별 선택과목, 동아리, 세특 탐구 주제, 독서 프로젝트를 체계적으로 기록하고 백엔드 서버와 클라우드에 영구 보관하세요.
                      </p>
                    </div>

                    <div className="flex items-center gap-6 text-white shrink-0">
                      <div>
                        <div className="text-xs text-slate-300">전체 계획</div>
                        <div className="text-2xl font-mono tabular-nums font-semibold">{roadmaps.length}건</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-300">진행 중</div>
                        <div className="text-2xl font-mono tabular-nums font-semibold text-[#38BDF8]">
                          {inProgressRoadmapCount}건
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-300">이수·완료</div>
                        <div className="text-2xl font-mono tabular-nums font-semibold text-[#34D399]">
                          {completedRoadmapCount}건
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* AI Roadmap Auto-Generator + Manual Entry Bar */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Left 5 cols: AI Generation + Manual Form */}
                  <div className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-6">
                    <div className="space-y-3 pb-6 border-b border-[#E2E8F0]">
                      <div className="flex items-center justify-between">
                        <h2 className="text-base font-semibold text-[#0F172A]">AI 맞춤 로드맵 3건 자동 설계</h2>
                        <Sparkles className="w-4 h-4 text-[#0284C7]" />
                      </div>
                      <p className="text-xs text-[#64748B]">
                        현재 프로필({profile?.grade} · {profile?.targetMajors})에 맞춰 선택과목, 세특 탐구, 창체 활동 3가지를 한 번에 생성하고 서버에 저장합니다.
                      </p>
                      <input
                        type="text"
                        value={aiRoadmapFocus}
                        onChange={(e) => setAiRoadmapFocus(e.target.value)}
                        placeholder="강조할 키워드 (예: 의료 AI 윤리, 반도체 물리 심화, 비워두면 자동)"
                        className="w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                      />
                      <button
                        type="button"
                        disabled={isGeneratingRoadmap}
                        onClick={handleGenerateAiRoadmaps}
                        className="w-full py-2.5 text-xs font-semibold text-white bg-[#0284C7] hover:bg-[#0369A1] rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
                      >
                        {isGeneratingRoadmap ? 'AI가 학기별 로드맵을 설계 중입니다...' : 'AI 맞춤 로드맵 3건 생성 및 저장'}
                      </button>
                    </div>

                    {/* Manual Roadmap Creation Form */}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleAddRoadmapItem(newRoadmapDraft);
                      }}
                      className="space-y-3.5"
                    >
                      <h3 className="text-sm font-semibold text-[#0F172A]">직접 로드맵 항목 추가</h3>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-xs font-medium text-[#334155]">목표 학기</label>
                          <select
                            value={newRoadmapDraft.gradeTarget}
                            onChange={(e) =>
                              setNewRoadmapDraft({
                                ...newRoadmapDraft,
                                gradeTarget: e.target.value as SemesterTarget,
                              })
                            }
                            className="mt-1 w-full px-2.5 py-2 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                          >
                            {SEMESTERS.map((sem) => (
                              <option key={sem} value={sem}>
                                {sem}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#334155]">활동 영역</label>
                          <select
                            value={newRoadmapDraft.category}
                            onChange={(e) =>
                              setNewRoadmapDraft({
                                ...newRoadmapDraft,
                                category: e.target.value as RoadmapCategory,
                              })
                            }
                            className="mt-1 w-full px-2.5 py-2 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                          >
                            {ROADMAP_CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-[#334155]">활동·탐구 제목</label>
                        <input
                          type="text"
                          value={newRoadmapDraft.title}
                          onChange={(e) => setNewRoadmapDraft({ ...newRoadmapDraft, title: e.target.value })}
                          placeholder="예: 미적분 세특 - 경사하강법 수렴 속도 비교 실험"
                          maxLength={120}
                          required
                          className="mt-1 w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-[#334155]">연계 목표 전공</label>
                        <input
                          type="text"
                          value={newRoadmapDraft.relatedMajor}
                          onChange={(e) => setNewRoadmapDraft({ ...newRoadmapDraft, relatedMajor: e.target.value })}
                          placeholder={profile?.targetMajors || '예: 컴퓨터공학과'}
                          maxLength={100}
                          className="mt-1 w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-[#334155]">구체적 실행 계획 및 탐구 내용</label>
                        <textarea
                          rows={3}
                          value={newRoadmapDraft.description}
                          onChange={(e) => setNewRoadmapDraft({ ...newRoadmapDraft, description: e.target.value })}
                          placeholder="교과 개념과 전공 관심사를 어떻게 연결할지 구체적으로 작성하세요."
                          maxLength={1000}
                          required
                          className="mt-1 w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full py-2.5 text-xs font-semibold text-white bg-[#0F172A] hover:bg-[#1E293B] rounded-lg transition-colors whitespace-nowrap"
                      >
                        + 로드맵에 추가 및 서버 저장
                      </button>
                    </form>
                  </div>

                  {/* Right 7 cols: Roadmap List & Interactive Filters */}
                  <div className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#E2E8F0]">
                      <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-lg">
                        {[
                          { key: 'all', label: '전체 상태' },
                          { key: 'planned', label: '예정됨' },
                          { key: 'in_progress', label: '진행 중' },
                          { key: 'completed', label: '완료 확정' },
                        ].map((tab) => (
                          <button
                            key={tab.key}
                            type="button"
                            onClick={() => setRoadmapStatusFilter(tab.key as 'all' | RoadmapStatus)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                              roadmapStatusFilter === tab.key
                                ? 'bg-white text-[#0F172A] shadow-xs'
                                : 'text-[#64748B] hover:text-[#0F172A]'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      <select
                        value={roadmapSemesterFilter}
                        onChange={(e) => setRoadmapSemesterFilter(e.target.value)}
                        className="px-3 py-1.5 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                      >
                        <option value="전체">모든 학기 보기</option>
                        {SEMESTERS.map((sem) => (
                          <option key={sem} value={sem}>
                            {sem}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="divide-y divide-[#E2E8F0]">
                      {filteredRoadmaps.length === 0 ? (
                        <div className="py-12 text-center space-y-3">
                          <Calendar className="w-8 h-8 text-[#94A3B8] mx-auto" />
                          <p className="text-sm text-[#64748B]">해당 조건의 진로 로드맵 항목이 없습니다.</p>
                          <button
                            type="button"
                            onClick={handleGenerateAiRoadmaps}
                            className="px-4 py-2 text-xs font-semibold text-white bg-[#0284C7] rounded-lg"
                          >
                            AI 맞춤 로드맵 자동 설계하기
                          </button>
                        </div>
                      ) : (
                        filteredRoadmaps.map((item) => (
                          <div key={item.roadmapId} className="py-4 first:pt-0 last:pb-0 flex flex-col gap-2.5">
                            <div className="flex items-start justify-between gap-4">
                              <div className="space-y-1">
                                {/* Zero-Pill Unboxed Metadata Line */}
                                <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B]">
                                  <span className="font-semibold text-[#0F172A]">{item.gradeTarget}</span>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-medium text-[#0284C7]">{item.category}</span>
                                  <span aria-hidden="true">·</span>
                                  <span>연계 전공: {item.relatedMajor}</span>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-medium">
                                    {item.status === 'completed'
                                      ? '● 완료 확정(잠금)'
                                      : item.status === 'in_progress'
                                      ? '▲ 진행 중'
                                      : '○ 예정됨'}
                                  </span>
                                </div>

                                <h3 className="text-base font-semibold text-[#0F172A]">{item.title}</h3>
                                <p className="text-xs sm:text-sm text-[#475569] leading-relaxed">
                                  {item.description}
                                </p>
                              </div>

                              <button
                                type="button"
                                title="항목 삭제"
                                onClick={() => handleDeleteRoadmap(item.roadmapId)}
                                className="p-1.5 text-[#94A3B8] hover:text-[#DC2626] rounded shrink-0"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="flex items-center justify-between pt-1">
                              <span className="text-xs text-[#94A3B8] font-mono tabular-nums">
                                최종 저장: {new Date(item.updatedAt).toLocaleDateString('ko-KR')}
                              </span>

                              <div className="flex items-center gap-2">
                                {item.status === 'planned' && (
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateRoadmapStatus(item.roadmapId, 'in_progress')}
                                    className="px-3 py-1.5 text-xs font-medium text-[#0284C7] bg-[#F0F9FF] hover:bg-[#E0F2FE] rounded-md transition-colors whitespace-nowrap"
                                  >
                                    진행 시작하기
                                  </button>
                                )}
                                {item.status !== 'completed' ? (
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateRoadmapStatus(item.roadmapId, 'completed')}
                                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-[#059669] hover:bg-[#047857] rounded-md transition-colors whitespace-nowrap"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>이수·완료 확정</span>
                                  </button>
                                ) : (
                                  <span className="flex items-center gap-1 text-xs text-[#059669] font-medium">
                                    <Lock className="w-3.5 h-3.5" />
                                    <span>학생부 로드맵 기록 완료</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 4: INTERACTIVE RIASEC CAREER APTITUDE DIAGNOSTIC */}
            {activeSection === 'diagnostic' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left 6 cols: Interactive Sliders & Radar Polygon Stage */}
                <section className="lg:col-span-6 bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-6">
                  <div>
                    <div className="text-xs font-semibold text-[#0284C7]">홀랜드(RIASEC) 6각형 진로 적성 시뮬레이터</div>
                    <h1 className="font-display text-2xl font-semibold text-[#0F172A] mt-1">
                      나의 진로 흥미·적성 6대 영역 진단
                    </h1>
                    <p className="text-xs sm:text-sm text-[#475569] mt-1">
                      각 영역의 설명을 읽고 나에게 해당되는 정도를 1점~5점 슬라이더로 조절해 보세요. 진단 결과는 백엔드 서버와 나의 진로 프로필에 즉시 반영됩니다.
                    </p>
                  </div>

                  {/* Interactive SVG Hexagon Radar Diagram */}
                  <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 flex flex-col items-center">
                    <svg viewBox="0 0 260 220" className="w-full max-w-[300px] h-auto">
                      {/* Background Hexagon Rings */}
                      {[1, 2, 3, 4, 5].map((level) => {
                        const r = level * 16;
                        const pts = [0, 1, 2, 3, 4, 5]
                          .map((i) => {
                            const angle = (Math.PI / 3) * i - Math.PI / 2;
                            return `${130 + r * Math.cos(angle)},${110 + r * Math.sin(angle)}`;
                          })
                          .join(' ');
                        return (
                          <polygon
                            key={level}
                            points={pts}
                            fill="none"
                            stroke="#CBD5E1"
                            strokeWidth="1"
                            strokeDasharray={level === 5 ? undefined : '2 2'}
                          />
                        );
                      })}

                      {/* Active Student Polygon */}
                      <polygon
                        points={(['R', 'I', 'A', 'S', 'E', 'C'] as const)
                          .map((key, i) => {
                            const r = (riasecScores[key] || 1) * 16;
                            const angle = (Math.PI / 3) * i - Math.PI / 2;
                            return `${130 + r * Math.cos(angle)},${110 + r * Math.sin(angle)}`;
                          })
                          .join(' ')}
                        fill="rgba(2, 132, 199, 0.22)"
                        stroke="#0284C7"
                        strokeWidth="2.5"
                      />

                      {/* Axis Labels */}
                      {[
                        { key: 'R', label: 'R 현실형', x: 130, y: 16 },
                        { key: 'I', label: 'I 탐구형', x: 222, y: 62 },
                        { key: 'A', label: 'A 예술형', x: 222, y: 164 },
                        { key: 'S', label: 'S 사회형', x: 130, y: 208 },
                        { key: 'E', label: 'E 진취형', x: 38, y: 164 },
                        { key: 'C', label: 'C 관습형', x: 38, y: 62 },
                      ].map((node) => (
                        <text
                          key={node.key}
                          x={node.x}
                          y={node.y}
                          textAnchor="middle"
                          className="text-[10px] font-semibold fill-[#0F172A]"
                        >
                          {node.label} ({riasecScores[node.key as keyof typeof riasecScores]})
                        </text>
                      ))}
                    </svg>
                  </div>

                  {/* Labeled Sliders with Explicit Value & Unit */}
                  <form onSubmit={handleRunAptitudeDiagnostic} className="space-y-4">
                    {(
                      [
                        {
                          key: 'R',
                          name: 'R 현실형 (Realistic)',
                          desc: '기계·장비 조작, 실험 실습, 구체적인 사물 제작 활동 선호',
                        },
                        {
                          key: 'I',
                          name: 'I 탐구형 (Investigative)',
                          desc: '수학·과학적 원리 규명, 데이터 분석, 논리적 심화 탐구 선호',
                        },
                        {
                          key: 'A',
                          name: 'A 예술형 (Artistic)',
                          desc: '창의적 표현, UX/UI 시각 디자인, 스토리텔링 및 예술 창작 선호',
                        },
                        {
                          key: 'S',
                          name: 'S 사회형 (Social)',
                          desc: '타인과의 공감, 교육·상담, 의료·복지 및 공동체 문제 해결 선호',
                        },
                        {
                          key: 'E',
                          name: 'E 진취형 (Enterprising)',
                          desc: '프로젝트 기획, 리더십 발휘, 토론·설득 및 비즈니스 혁신 선호',
                        },
                        {
                          key: 'C',
                          name: 'C 관습형 (Conventional)',
                          desc: '체계적인 자료 정리, 통계·금융 데이터 관리, 정확한 규칙 준수 선호',
                        },
                      ] as const
                    ).map((axis) => (
                      <div key={axis.key} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <label htmlFor={`slider-${axis.key}`} className="font-semibold text-[#0F172A]">
                            {axis.name}
                          </label>
                          <span className="font-mono tabular-nums font-semibold text-[#0284C7]">
                            점수: {riasecScores[axis.key]} / 5점
                          </span>
                        </div>
                        <p className="text-xs text-[#64748B]">{axis.desc}</p>
                        <input
                          id={`slider-${axis.key}`}
                          type="range"
                          min={1}
                          max={5}
                          step={1}
                          value={riasecScores[axis.key]}
                          onChange={(e) =>
                            setRiasecScores({
                              ...riasecScores,
                              [axis.key]: Number(e.target.value),
                            })
                          }
                          className="w-full accent-[#0284C7] cursor-pointer"
                        />
                      </div>
                    ))}

                    <div>
                      <label className="block text-xs font-semibold text-[#0F172A]">
                        최근 가장 몰입했던 교과 활동이나 관심 주제
                      </label>
                      <textarea
                        rows={2}
                        value={diagnosticNote}
                        onChange={(e) => setDiagnosticNote(e.target.value)}
                        className="mt-1 w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isDiagnosing}
                      className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-semibold text-white bg-[#0284C7] hover:bg-[#0369A1] rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
                    >
                      <Sliders className="w-4 h-4" />
                      <span>
                        {isDiagnosing ? 'AI가 적성 리포트를 분석하고 있습니다...' : 'AI 진로 적성 리포트 생성 및 프로필 반영'}
                      </span>
                    </button>
                  </form>
                </section>

                {/* Right 6 cols: AI Diagnostic Result & Actionable Career Design */}
                <section className="lg:col-span-6 bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-6">
                  <div className="border-b border-[#E2E8F0] pb-4">
                    <div className="text-xs text-[#64748B]">
                      <span>현재 저장된 적성 코드</span>
                      <span aria-hidden="true"> · </span>
                      <span className="font-mono font-semibold text-[#0284C7]">{profile?.hollandCode}</span>
                    </div>
                    <h2 className="text-lg font-semibold text-[#0F172A] mt-1">
                      AI 맞춤형 진로·전공·선택과목 진단 결과
                    </h2>
                  </div>

                  {!aptitudeReport ? (
                    <div className="py-12 text-center space-y-3">
                      <Compass className="w-9 h-9 text-[#0284C7] mx-auto" />
                      <p className="text-sm font-medium text-[#0F172A]">
                        좌측의 6대 적성 슬라이더를 조절하고 진단 버튼을 눌러보세요.
                      </p>
                      <p className="text-xs text-[#64748B] max-w-md mx-auto">
                        AI가 학생의 흥미 프로파일과 선호 과목을 종합 분석하여 최적의 대학 학과, 고교학점제 선택과목, 학생부 세특 탐구 주제를 도출합니다.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <div className="p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl space-y-2">
                        <div className="text-xs text-[#0284C7] font-mono font-semibold">
                          도출된 적성 코드: {aptitudeReport.hollandCode}
                        </div>
                        <h3 className="text-base font-semibold text-[#0F172A]">{aptitudeReport.typeTitle}</h3>
                        <p className="text-xs sm:text-sm text-[#334155] leading-relaxed">{aptitudeReport.analysis}</p>
                      </div>

                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-[#0F172A]">추천 대학 전공 학과</h4>
                        <p className="text-xs sm:text-sm text-[#0284C7] font-medium">
                          {aptitudeReport.recommendedMajors.join(' · ')}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-[#0F172A]">고교학점제 추천 선택과목</h4>
                        <p className="text-xs sm:text-sm text-[#334155]">
                          {aptitudeReport.recommendedElectives.join(' · ')}
                        </p>
                      </div>

                      <div className="p-4 bg-[#F0F9FF] border border-[#BAE6FD] rounded-xl space-y-3">
                        <div className="text-xs font-semibold text-[#0369A1]">
                          추천 학생부 세특(세부능력 및 특기사항) 탐구 주제
                        </div>
                        <p className="text-xs sm:text-sm text-[#0F172A] leading-relaxed">
                          {aptitudeReport.inquiryTopicIdea}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() =>
                              handleAddRoadmapItem({
                                gradeTarget: `${profile?.grade || '고2'} 2학기` as SemesterTarget,
                                category: '세특·탐구주제',
                                title: `[적성진단 연계] ${aptitudeReport.typeTitle} 심화 탐구`,
                                description: aptitudeReport.inquiryTopicIdea,
                                relatedMajor: aptitudeReport.recommendedMajors[0] || profile?.targetMajors || '융합전공',
                              })
                            }
                            className="px-3.5 py-2 text-xs font-semibold text-white bg-[#0284C7] hover:bg-[#0369A1] rounded-lg transition-colors whitespace-nowrap"
                          >
                            + 이 탐구 주제를 내 로드맵에 저장
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleCreateSession(
                                '학생부·세특설계',
                                `${aptitudeReport.hollandCode} 적성 기반 세특 구체화 상담`,
                                `적성 진단에서 '${aptitudeReport.hollandCode} - ${aptitudeReport.typeTitle}' 결과가 나왔고, 추천 탐구 주제는 '${aptitudeReport.inquiryTopicIdea}'야. 이 주제로 실제 학생부 세특 보고서 목차와 실험/조사 방법을 구체적으로 짜줘.`
                              )
                            }
                            className="px-3.5 py-2 text-xs font-medium text-[#0F172A] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-lg transition-colors whitespace-nowrap"
                          >
                            이 결과로 AI 멘토와 심화 상담하기
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              </div>
            )}
          </>
        )}
      </main>

      {/* Summary Share & Export Modal ('요약 공유') */}
      {showSummaryShareModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="summary-share-title"
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs text-[#64748B]">
                  <span className="font-semibold text-[#0284C7]">상담 핵심 요약 및 로드맵 공유</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeSession?.category || '진로상담'}</span>
                </div>
                <h2 id="summary-share-title" className="text-base font-semibold text-[#0F172A] mt-0.5">
                  {activeSession?.title || 'AI 진로 상담 및 학기별 로드맵 리포트'}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setShowSummaryShareModal(false)}
                className="p-1.5 text-[#64748B] hover:text-[#0F172A] rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Preview Body */}
            <div className="flex-1 p-6 overflow-y-auto space-y-5 text-xs sm:text-sm">
              {/* 1. Core Session Summary */}
              <div className="p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl space-y-1.5">
                <div className="text-xs font-semibold text-[#0284C7]">01. 상담 세션 핵심 요약</div>
                <p className="text-sm font-medium text-[#0F172A]">
                  {activeSession?.summary || '진행 중인 상담 세션 요약입니다.'}
                </p>
                {profile && (
                  <p className="text-xs text-[#64748B]">
                    학생 프로필: {profile.displayName} · {profile.grade} · {profile.track} · 희망 학과:{' '}
                    {profile.targetMajors}
                  </p>
                )}
              </div>

              {/* 2. AI Generated Core Counseling Insights */}
              <div className="space-y-3">
                <div className="text-xs font-semibold text-[#0F172A]">
                  02. AI 멘토 생성 핵심 상담 내용 ({activeMessages.filter((m) => m.role === 'assistant').length}건)
                </div>
                <div className="divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-xl px-4">
                  {activeMessages
                    .filter((m) => m.role === 'assistant')
                    .map((msg, idx) => (
                      <div key={msg.messageId} className="py-3.5 space-y-1.5">
                        <div className="flex items-center gap-2 text-xs text-[#64748B]">
                          <span className="font-semibold text-[#0F172A]">AI 핵심 가이드 #{idx + 1}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {new Date(msg.createdAt).toLocaleString('ko-KR')}
                          </span>
                        </div>
                        <p className="text-xs text-[#334155] whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        {msg.recommendedMajors && (
                          <div className="text-xs text-[#0284C7] font-medium">
                            연계 추천 학과: {msg.recommendedMajors}
                          </div>
                        )}
                        {msg.actionItems && (
                          <div className="text-xs text-[#475569]">실천 과제: {msg.actionItems}</div>
                        )}
                      </div>
                    ))}
                </div>
              </div>

              {/* 3. Student Career Roadmap Items */}
              <div className="space-y-3">
                <div className="text-xs font-semibold text-[#0F172A]">
                  03. 학기별 진로·세특 로드맵 항목 ({roadmaps.length}건)
                </div>
                {roadmaps.length === 0 ? (
                  <p className="text-xs text-[#64748B]">저장된 진로 로드맵 항목이 없습니다.</p>
                ) : (
                  <div className="divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-xl px-4">
                    {roadmaps.map((item) => (
                      <div key={item.roadmapId} className="py-3 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#64748B]">
                          <span className="font-semibold text-[#0F172A]">{item.gradeTarget}</span>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#0284C7] font-medium">{item.category}</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.relatedMajor}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {item.status === 'completed'
                              ? '완료 확정'
                              : item.status === 'in_progress'
                              ? '진행 중'
                              : '예정됨'}
                          </span>
                        </div>
                        <div className="text-xs font-semibold text-[#0F172A]">{item.title}</div>
                        <div className="text-xs text-[#475569]">{item.description}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer: PDF / TXT / Copy Actions */}
            <div className="px-6 py-4 bg-[#F8FAFC] border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleCopySummaryText}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F1F5F9] rounded-lg transition-colors whitespace-nowrap"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copiedSummary ? '● 클립보드 복사 완료' : '요약 텍스트 복사'}</span>
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleDownloadTxtSummary}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#0F172A] bg-white border border-[#CBD5E1] hover:bg-[#F1F5F9] rounded-lg transition-colors whitespace-nowrap"
                >
                  <FileText className="w-3.5 h-3.5 text-[#0284C7]" />
                  <span>텍스트(.txt) 내보내기</span>
                </button>

                <button
                  type="button"
                  disabled={isExportingPdf}
                  onClick={handleDownloadPdfSummary}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0284C7] hover:bg-[#0369A1] rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{isExportingPdf ? 'PDF 생성 중...' : 'PDF(.pdf) 내보내기'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clean Editorial Footer (No Ornamental Telemetry Tickers) */}
      <footer className="mt-12 border-t border-[#E2E8F0] bg-white py-6 px-6">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#64748B]">
          <div>
            <span className="font-semibold text-[#0F172A]">나침반 (Nachimban)</span>
            <span aria-hidden="true"> · </span>
            <span>고등학생 맞춤형 AI 진로·진학 상담 및 학생부 로드맵 워크스페이스</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setActiveSection('counseling')}
              className="hover:text-[#0F172A] transition-colors"
            >
              상담 스튜디오
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('curriculum')}
              className="hover:text-[#0F172A] transition-colors"
            >
              고교학점제 가이드
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('roadmap')}
              className="hover:text-[#0F172A] transition-colors"
            >
              학기별 진로 로드맵
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
