export interface MajorCurriculumGuide {
  id: string;
  majorName: string;
  cluster: '자연·공학' | '인문·사회' | '융합·IT' | '의약·생명' | '예체능·디자인';
  coreDescription: string;
  generalElectives: string;
  careerElectives: string;
  inquiryKeywords: string[];
  sampleSeteukTopic: string;
  careerPaths: string;
}

export const MAJOR_CURRICULUM_GUIDES: MajorCurriculumGuide[] = [
  {
    id: 'cs-ai',
    majorName: '컴퓨터공학 · 인공지능학과',
    cluster: '융합·IT',
    coreDescription: '알고리즘, 소프트웨어 설계, 머신러닝 및 데이터 처리 원리를 탐구하여 지능형 시스템을 구축하는 전공입니다.',
    generalElectives: '수학I · 수학II · 확률과 통계 · 물리학I · 정보',
    careerElectives: '미적분 · 기하 · 인공지능 기초 · 데이터 과학',
    inquiryKeywords: ['경사하강법 최적화', '그래프 탐색 알고리즘', '설명 가능한 AI(XAI)', '컴퓨터 비전'],
    sampleSeteukTopic: '확률과 통계의 조건부확률(베이즈 정리)을 활용한 스팸 필터링 및 초기 질병 예측 분류 모델의 정확도 한계 분석',
    careerPaths: 'AI 리서치 엔지니어 · 백엔드 아키텍트 · 데이터 사이언티스트 · 로보틱스 소프트웨어 개발자',
  },
  {
    id: 'bio-med',
    majorName: '생명공학 · 의생명과학과',
    cluster: '의약·생명',
    coreDescription: '생명 현상의 분자적 메커니즘을 규명하고 유전자 가위, 신약 개발, 바이오 헬스케어 기술을 연구하는 전공입니다.',
    generalElectives: '수학I · 수학II · 확률과 통계 · 화학I · 생명과학I',
    careerElectives: '미적분 · 화학II · 생명과학II · 융합과학',
    inquiryKeywords: ['CRISPR-Cas9 유전자가위', 'mRNA 백신 전달체', '효소 반응 속도론', '단백질 구조 예측'],
    sampleSeteukTopic: '화학I의 동적 평형과 완충 용액 원리를 활용한 혈액 내 pH 항상성 유지 및 보어 효과(Bohr Effect) 산소 해리 곡선 탐구',
    careerPaths: '바이오 신약 연구원 · 유전체 데이터 분석가 · 임상시험 전문가 · 의공학 연구원',
  },
  {
    id: 'semi-elec',
    majorName: '반도체공학 · 전자전기공학부',
    cluster: '자연·공학',
    coreDescription: '나노 단위 반도체 소자 공정, 집적회로 설계, 차세대 전력 및 통신 시스템을 연구하는 첨단 공학 전공입니다.',
    generalElectives: '수학I · 수학II · 확률과 통계 · 물리학I · 화학I',
    careerElectives: '미적분 · 기하 · 물리학II · 화학II · 공학 일반',
    inquiryKeywords: ['에너지 띠 이론과 다이오드', 'EUV 노광 공정', 'NPU 저전력 설계', '양자 터널링 현상'],
    sampleSeteukTopic: '물리학I의 고체 에너지 띠 이론과 불순물 반도체의 전기 전도도 변화를 활용한 미세 공정 누설 전류 제어 방안 탐구',
    careerPaths: '반도체 소자·공정 엔지니어 · IC 회로 설계 엔지니어 · 임베디드 시스템 연구원 · 전장 시스템 개발자',
  },
  {
    id: 'biz-econ',
    majorName: '경영학 · 경제금융학부',
    cluster: '인문·사회',
    coreDescription: '시장 자원 배분의 효율성, 기업 전략, 금융 리스크 관리 및 계량 데이터 기반 의사결정을 탐구하는 전공입니다.',
    generalElectives: '수학I · 수학II · 확률과 통계 · 경제 · 사회·문화',
    careerElectives: '미적분 · 경제 수학 · 사회문제 탐구 · 데이터 과학',
    inquiryKeywords: ['행동경제학과 넛지', 'ESG 경영 성과 분석', '한계효용과 가격차별', '금리 변동과 자산시장'],
    sampleSeteukTopic: '수학II의 도함수와 극대·극소 개념을 경제 교과의 한계수입(MR)·한계비용(MC) 곡선에 적용한 구독형 플랫폼 최적 가격 설계',
    careerPaths: '경영 컨설턴트 · 금융 퀀트 애널리스트 · 프로덕트 매니저(PM) · 공인회계사 · ESG 전략 기획자',
  },
  {
    id: 'media-comm',
    majorName: '미디어커뮤니케이션 · 사회학과',
    cluster: '인문·사회',
    coreDescription: '디지털 미디어 환경의 여론 형성, 콘텐츠 스토리텔링, 알고리즘 편향과 사회 구조적 변화를 분석하는 전공입니다.',
    generalElectives: '화법과 작문 · 확률과 통계 · 사회·문화 · 생활과 윤리 · 정치와 법',
    careerElectives: '사회문제 탐구 · 고전 읽기 · 미디어 콘텐츠 일반 · 심리학',
    inquiryKeywords: ['필터 버블과 확증 편향', '디지털 리터러시', '공론장 이론', '문화 수용자 분석'],
    sampleSeteukTopic: '사회·문화의 양적·질적 연구 방법을 활용하여 청소년 숏폼 알고리즘 추천이 뉴스 소비 다양성에 미치는 영향 설문 분석',
    careerPaths: '콘텐츠 프로듀서 · 미디어 데이터 분석가 · 브랜드 커뮤니케이션 디렉터 · 사회조사 연구원',
  },
  {
    id: 'ux-design',
    majorName: '산업디자인 · 디지털미디어디자인학과',
    cluster: '예체능·디자인',
    coreDescription: '인간 중심 디자인 사고(Design Thinking)와 인터랙션 기술을 결합해 사용자 경험(UX/UI)과 제품 생태계를 설계합니다.',
    generalElectives: '미술 · 정보 · 사회·문화 · 생활과 윤리',
    careerElectives: '미술 창작 · 디자인 일반 · 심리학 · 인공지능 기초',
    inquiryKeywords: ['유니버설 디자인', '인지심리학과 어포던스', '디자인 시스템', '접근성(Accessibility) 설계'],
    sampleSeteukTopic: '심리학의 게슈탈트 시지각 원리와 힉의 법칙(Hick’s Law)을 적용한 고령층 키오스크 UI 화면 복잡도 개선 프로토타입 제작',
    careerPaths: 'UX/UI 프로덕트 디자이너 · 인터랙션 디자이너 · 서비스 경험 기획자 · 모빌리티 인테리어 디자이너',
  },
];

export const QUICK_COUNSELING_PROMPTS: {
  category: '진로탐색' | '학과선택' | '고교학점제·과목선택' | '학생부·세특설계' | '학습·멘탈코칭';
  label: string;
  prompt: string;
}[] = [
  {
    category: '고교학점제·과목선택',
    label: '고2·고3 선택과목 조합 추천',
    prompt: '내 희망 전공을 기준으로 고2·고3 때 반드시 이수해야 할 일반선택·진로선택 과목 조합과 그 이유를 알려줘.',
  },
  {
    category: '학생부·세특설계',
    label: '교과 연계 세특 심화 탐구 주제',
    prompt: '내가 좋아하는 과목과 목표 학과를 연결해서 차별화할 수 있는 학생부 세부능력 및 특기사항(세특) 탐구 주제 3가지를 설계해 줘.',
  },
  {
    category: '학과선택',
    label: '비슷한 학과 간 차이점 비교',
    prompt: '내가 관심 있는 학과들의 커리큘럼 차이와 졸업 후 실제 진출 분야, 그리고 고등학교 때 준비해야 할 역량 차이를 비교해 줘.',
  },
  {
    category: '진로탐색',
    label: '아직 꿈이 명확하지 않을 때 탐색법',
    prompt: '좋아하는 과목은 있는데 아직 구체적인 직업이나 학과를 못 정했어. 내 강점을 바탕으로 어떤 분야부터 탐색하면 좋을까?',
  },
  {
    category: '학습·멘탈코칭',
    label: '내신과 진로 활동 시간 배분 전략',
    prompt: '내신 시험 준비와 동아리·세특 보고서 작성을 병행하느라 시간이 부족해. 학기 중 효율적인 시간 관리와 멘탈 관리 루틴을 짜줘.',
  },
];
