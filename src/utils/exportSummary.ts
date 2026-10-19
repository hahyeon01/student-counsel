import {
  StudentProfile,
  CounselingSession,
  ChatMessage,
  CareerRoadmapItem,
} from '../types';

export function buildSummaryText(
  profile: StudentProfile | null,
  session: CounselingSession | null,
  messages: ChatMessage[],
  roadmaps: CareerRoadmapItem[]
): string {
  const dateStr = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const aiMessages = messages.filter((m) => m.role === 'assistant');

  const lines: string[] = [
    '====================================================================',
    '  나침반 (Nachimban) - 고등학생 AI 진로·진학 상담 및 로드맵 요약 리포트',
    `  발행일: ${dateStr}`,
    '====================================================================',
    '',
  ];

  if (profile) {
    lines.push('[1. 학생 진로 프로필]');
    lines.push(`- 이름 / 학년·계열: ${profile.displayName} (${profile.grade} · ${profile.track})`);
    lines.push(`- 홀랜드(RIASEC) 적성 코드: ${profile.hollandCode}`);
    lines.push(`- 선호·강점 과목: ${profile.favoriteSubjects}`);
    lines.push(`- 희망 대학 학과: ${profile.targetMajors}`);
    lines.push(`- 진로 비전 및 목표: ${profile.careerGoal}`);
    lines.push(`- 탐구 강점·특성: ${profile.strengths}`);
    lines.push('');
  }

  if (session) {
    lines.push('[2. 상담 세션 핵심 요약]');
    lines.push(`- 상담 제목: ${session.title}`);
    lines.push(`- 상담 영역: ${session.category}`);
    lines.push(`- 핵심 요약: ${session.summary}`);
    lines.push('');
  }

  lines.push('[3. AI 멘토 핵심 상담 내용 및 실천 가이드]');
  if (aiMessages.length === 0) {
    lines.push('- 생성된 AI 상담 응답이 아직 없습니다.');
    lines.push('');
  } else {
    aiMessages.forEach((msg, idx) => {
      const timeStr = new Date(msg.createdAt).toLocaleString('ko-KR');
      lines.push(`--- AI 핵심 가이드 #${idx + 1} (${timeStr}) ---`);
      lines.push(msg.content.trim());
      if (msg.recommendedMajors) {
        lines.push(`* 연계 추천 학과: ${msg.recommendedMajors}`);
      }
      if (msg.actionItems) {
        lines.push(`* 이번 학기 실천 과제: ${msg.actionItems}`);
      }
      if (msg.suggestedRoadmap) {
        lines.push(
          `* AI 제안 로드맵: [${msg.suggestedRoadmap.gradeTarget} / ${msg.suggestedRoadmap.category}] ${msg.suggestedRoadmap.title} - ${msg.suggestedRoadmap.description}`
        );
      }
      lines.push('');
    });
  }

  lines.push('[4. 학기별 고교 진로·세특 로드맵 항목]');
  if (roadmaps.length === 0) {
    lines.push('- 등록된 진로 로드맵 항목이 없습니다.');
  } else {
    roadmaps.forEach((item, idx) => {
      const statusLabel =
        item.status === 'completed'
          ? '완료 확정'
          : item.status === 'in_progress'
          ? '진행 중'
          : '예정됨';
      lines.push(
        `${idx + 1}. [${item.gradeTarget} | ${item.category} | ${statusLabel}] ${item.title}`
      );
      lines.push(`   - 연계 전공: ${item.relatedMajor}`);
      lines.push(`   - 세부 계획: ${item.description}`);
    });
  }

  lines.push('');
  lines.push('====================================================================');
  lines.push('  본 리포트는 나침반(Nachimban) AI 진로·진학 상담 스튜디오에서 생성되었습니다.');
  lines.push('====================================================================');

  return lines.join('\n');
}

function sanitizeFilename(raw: string): string {
  return raw.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40) || '상담요약';
}

export function exportSummaryAsTxt(
  profile: StudentProfile | null,
  session: CounselingSession | null,
  messages: ChatMessage[],
  roadmaps: CareerRoadmapItem[]
): void {
  const textContent = buildSummaryText(profile, session, messages, roadmaps);
  // Prepend UTF-8 BOM so Korean characters render properly across all OS text editors
  const blob = new Blob(['\uFEFF' + textContent], {
    type: 'text/plain;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const titlePart = sanitizeFilename(session?.title || '진로상담');
  link.href = url;
  link.download = `나침반_요약공유_${titlePart}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Wraps Korean/Latin text lines to fit within maxWidth on a 2D canvas context.
 */
function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = text.split('\n');
  const wrappedLines: string[] = [];

  for (const para of paragraphs) {
    if (!para.trim()) {
      wrappedLines.push('');
      continue;
    }
    let currentLine = '';
    for (const char of para) {
      const testLine = currentLine + char;
      if (ctx.measureText(testLine).width > maxWidth && currentLine.length > 0) {
        wrappedLines.push(currentLine);
        currentLine = char;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      wrappedLines.push(currentLine);
    }
  }
  return wrappedLines;
}

/**
 * Builds a valid multi-page PDF 1.4 binary from an array of JPEG data URLs (A4 595.28 x 841.89 pt).
 */
function buildPdfFromJpegPages(
  pages: Array<{ jpegBytes: Uint8Array; widthPx: number; heightPx: number }>
): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let byteOffset = 0;

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    byteOffset += bytes.byteLength;
  };

  const pushStr = (str: string) => {
    pushBytes(encoder.encode(str));
  };

  const startObj = (id: number) => {
    offsets[id] = byteOffset;
    pushStr(`${id} 0 obj\n`);
  };

  const endObj = () => {
    pushStr('\nendobj\n');
  };

  // PDF Header
  pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  // Object 1: Catalog
  startObj(1);
  pushStr('<< /Type /Catalog /Pages 2 0 R >>');
  endObj();

  // Each page uses 3 objects: Page (3 + i*3), ContentStream (4 + i*3), ImageXObject (5 + i*3)
  const pageObjIds = pages.map((_, i) => 3 + i * 3);

  // Object 2: Pages
  startObj(2);
  pushStr(
    `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`
  );
  endObj();

  const pdfPageWidth = 595.28;
  const pdfPageHeight = 841.89;

  pages.forEach((p, i) => {
    const pageObjId = 3 + i * 3;
    const contentObjId = 4 + i * 3;
    const imageObjId = 5 + i * 3;
    const imgName = `/Im${i + 1}`;

    // Page Object
    startObj(pageObjId);
    pushStr(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfPageWidth} ${pdfPageHeight}] /Resources << /XObject << ${imgName} ${imageObjId} 0 R >> >> /Contents ${contentObjId} 0 R >>`
    );
    endObj();

    // Content Stream Object
    const contentStream = `q\n${pdfPageWidth} 0 0 ${pdfPageHeight} 0 0 cm\n${imgName} Do\nQ\n`;
    const contentBytes = encoder.encode(contentStream);
    startObj(contentObjId);
    pushStr(`<< /Length ${contentBytes.byteLength} >>\nstream\n`);
    pushBytes(contentBytes);
    pushStr('\nendstream');
    endObj();

    // Image XObject (DCTDecode JPEG)
    startObj(imageObjId);
    pushStr(
      `<< /Type /XObject /Subtype /Image /Width ${p.widthPx} /Height ${p.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpegBytes.byteLength} >>\nstream\n`
    );
    pushBytes(p.jpegBytes);
    pushStr('\nendstream');
    endObj();
  });

  const totalObjs = 2 + pages.length * 3;
  const xrefOffset = byteOffset;
  pushStr(`xref\n0 ${totalObjs + 1}\n`);
  pushStr('0000000000 65535 f \n');
  for (let id = 1; id <= totalObjs; id++) {
    const offStr = String(offsets[id] || 0).padStart(10, '0');
    pushStr(`${offStr} 00000 n \n`);
  }

  pushStr(
    `trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  );

  const output = new Uint8Array(byteOffset);
  let cursor = 0;
  for (const chunk of chunks) {
    output.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  return output;
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function exportSummaryAsPdf(
  profile: StudentProfile | null,
  session: CounselingSession | null,
  messages: ChatMessage[],
  roadmaps: CareerRoadmapItem[]
): Promise<void> {
  const pageWidth = 1240; // High-DPI A4 width
  const pageHeight = 1754; // High-DPI A4 height
  const marginX = 96;
  const contentWidth = pageWidth - marginX * 2;

  interface RenderBlock {
    kind: 'sectionTitle' | 'subHeader' | 'body' | 'meta' | 'spacer';
    text: string;
  }

  const blocks: RenderBlock[] = [];
  const aiMessages = messages.filter((m) => m.role === 'assistant');

  if (profile) {
    blocks.push({ kind: 'sectionTitle', text: '01. 학생 진로 프로필 요약' });
    blocks.push({
      kind: 'meta',
      text: `${profile.displayName}  ·  ${profile.grade}  ·  ${profile.track}  ·  적성코드 ${profile.hollandCode}`,
    });
    blocks.push({
      kind: 'body',
      text: `선호 과목: ${profile.favoriteSubjects}\n목표 학과: ${profile.targetMajors}\n진로 목표: ${profile.careerGoal}\n핵심 강점: ${profile.strengths}`,
    });
    blocks.push({ kind: 'spacer', text: '' });
  }

  if (session) {
    blocks.push({ kind: 'sectionTitle', text: '02. 상담 세션 핵심 요약' });
    blocks.push({
      kind: 'subHeader',
      text: `[${session.category}] ${session.title}`,
    });
    blocks.push({
      kind: 'body',
      text: session.summary,
    });
    blocks.push({ kind: 'spacer', text: '' });
  }

  blocks.push({ kind: 'sectionTitle', text: '03. AI 멘토 핵심 상담 내용 발췌' });
  if (aiMessages.length === 0) {
    blocks.push({ kind: 'body', text: '생성된 AI 상담 응답이 아직 없습니다.' });
  } else {
    aiMessages.forEach((msg, idx) => {
      const timeStr = new Date(msg.createdAt).toLocaleString('ko-KR');
      blocks.push({
        kind: 'subHeader',
        text: `AI 상담 가이드 #${idx + 1} (${timeStr})`,
      });
      blocks.push({
        kind: 'body',
        text: msg.content.replace(/\*\*/g, ''),
      });
      if (msg.recommendedMajors) {
        blocks.push({
          kind: 'meta',
          text: `연계 추천 학과: ${msg.recommendedMajors}`,
        });
      }
      if (msg.actionItems) {
        blocks.push({
          kind: 'meta',
          text: `이번 학기 실천 과제: ${msg.actionItems}`,
        });
      }
      if (msg.suggestedRoadmap) {
        blocks.push({
          kind: 'meta',
          text: `제안 로드맵 (${msg.suggestedRoadmap.gradeTarget} · ${msg.suggestedRoadmap.category}): ${msg.suggestedRoadmap.title} — ${msg.suggestedRoadmap.description}`,
        });
      }
      blocks.push({ kind: 'spacer', text: '' });
    });
  }

  blocks.push({ kind: 'sectionTitle', text: '04. 학기별 고교 진로·세특 로드맵 항목' });
  if (roadmaps.length === 0) {
    blocks.push({ kind: 'body', text: '등록된 진로 로드맵 항목이 없습니다.' });
  } else {
    roadmaps.forEach((item, idx) => {
      const statusText =
        item.status === 'completed'
          ? '완료 확정'
          : item.status === 'in_progress'
          ? '진행 중'
          : '예정됨';
      blocks.push({
        kind: 'subHeader',
        text: `${idx + 1}. [${item.gradeTarget} · ${item.category} · ${statusText}] ${item.title}`,
      });
      blocks.push({
        kind: 'meta',
        text: `연계 전공: ${item.relatedMajor}`,
      });
      blocks.push({
        kind: 'body',
        text: item.description,
      });
      blocks.push({ kind: 'spacer', text: '' });
    });
  }

  const canvases: HTMLCanvasElement[] = [];

  const createNewPageCanvas = (pageIndex: number): {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    cursorY: number;
  } => {
    const canvas = document.createElement('canvas');
    canvas.width = pageWidth;
    canvas.height = pageHeight;
    const ctx = canvas.getContext('2d')!;

    // White Paper Background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, pageWidth, pageHeight);

    // Top Accent Header Bar
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, pageWidth, 125);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 32px "Noto Sans KR", "Plus Jakarta Sans", sans-serif';
    ctx.fillText('나침반 (Nachimban) 진로·진학 상담 및 로드맵 요약 리포트', marginX, 68);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '400 20px "Noto Sans KR", sans-serif';
    const dateStr = new Date().toLocaleDateString('ko-KR');
    ctx.fillText(`발행일: ${dateStr}  ·  페이지 ${pageIndex + 1}`, marginX, 102);

    // Footer
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(marginX, pageHeight - 85);
    ctx.lineTo(pageWidth - marginX, pageHeight - 85);
    ctx.stroke();

    ctx.fillStyle = '#64748B';
    ctx.font = '400 18px "Noto Sans KR", sans-serif';
    ctx.fillText(
      '나침반 (Nachimban) 고등학생 AI 진로·진학 상담 센터 · 맞춤형 학생부 및 고교학점제 로드맵',
      marginX,
      pageHeight - 48
    );

    canvases.push(canvas);
    return { canvas, ctx, cursorY: 180 };
  };

  let currentPage = createNewPageCanvas(0);
  const bottomLimit = pageHeight - 120;

  const ensureSpace = (neededHeight: number) => {
    if (currentPage.cursorY + neededHeight > bottomLimit) {
      currentPage = createNewPageCanvas(canvases.length);
    }
  };

  for (const block of blocks) {
    if (block.kind === 'spacer') {
      currentPage.cursorY += 22;
      continue;
    }

    if (block.kind === 'sectionTitle') {
      ensureSpace(70);
      const { ctx } = currentPage;
      ctx.fillStyle = '#F0F9FF';
      ctx.fillRect(marginX, currentPage.cursorY - 28, contentWidth, 48);
      ctx.fillStyle = '#0284C7';
      ctx.fillRect(marginX, currentPage.cursorY - 28, 6, 48);

      ctx.fillStyle = '#0F172A';
      ctx.font = '700 25px "Noto Sans KR", sans-serif';
      ctx.fillText(block.text, marginX + 20, currentPage.cursorY + 4);
      currentPage.cursorY += 46;
      continue;
    }

    if (block.kind === 'subHeader') {
      const { ctx } = currentPage;
      ctx.font = '700 22px "Noto Sans KR", sans-serif';
      const lines = wrapCanvasText(ctx, block.text, contentWidth);
      for (const line of lines) {
        ensureSpace(34);
        currentPage.ctx.font = '700 22px "Noto Sans KR", sans-serif';
        currentPage.ctx.fillStyle = '#0F172A';
        currentPage.ctx.fillText(line, marginX, currentPage.cursorY);
        currentPage.cursorY += 34;
      }
      currentPage.cursorY += 4;
      continue;
    }

    if (block.kind === 'meta') {
      const { ctx } = currentPage;
      ctx.font = '600 19px "Noto Sans KR", sans-serif';
      const lines = wrapCanvasText(ctx, block.text, contentWidth);
      for (const line of lines) {
        ensureSpace(30);
        currentPage.ctx.font = '600 19px "Noto Sans KR", sans-serif';
        currentPage.ctx.fillStyle = '#0284C7';
        currentPage.ctx.fillText(line, marginX, currentPage.cursorY);
        currentPage.cursorY += 30;
      }
      currentPage.cursorY += 4;
      continue;
    }

    if (block.kind === 'body') {
      const { ctx } = currentPage;
      ctx.font = '400 20px "Noto Sans KR", sans-serif';
      const lines = wrapCanvasText(ctx, block.text, contentWidth);
      for (const line of lines) {
        ensureSpace(32);
        currentPage.ctx.font = '400 20px "Noto Sans KR", sans-serif';
        currentPage.ctx.fillStyle = '#334155';
        currentPage.ctx.fillText(line, marginX, currentPage.cursorY);
        currentPage.cursorY += 32;
      }
      currentPage.cursorY += 8;
    }
  }

  const jpegPages = canvases.map((c) => {
    const dataUrl = c.toDataURL('image/jpeg', 0.92);
    return {
      jpegBytes: dataUrlToUint8Array(dataUrl),
      widthPx: c.width,
      heightPx: c.height,
    };
  });

  const pdfBytes = buildPdfFromJpegPages(jpegPages);
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const titlePart = sanitizeFilename(session?.title || '진로상담');
  link.href = url;
  link.download = `나침반_요약공유_${titlePart}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
