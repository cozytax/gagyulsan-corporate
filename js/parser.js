/* =====================================================================
 *  parser.js — 손익계산서·재무상태표 PDF → 구조화 데이터
 *  pdf.js 로 텍스트를 뽑아 줄 단위로 재구성한다. 문서 종류(손익계산서/재무상태표)는 본문 키워드로 자동 판별.
 *  지원 양식: 세무프로그램(더존·세무사랑 등) 출력 손익계산서·재무상태표
 *    - 비교식 (당기 | 전기 2열) 및 단일기(당기 1열) 모두 지원
 *    - 계정명은 글자 사이가 띄워져 있어도(균등배치) 공백 제거 후 인식
 *  반환값의 type: 'pl'(손익계산서) | 'bs'(재무상태표)
 * ===================================================================== */
(function () {
  'use strict';

  const ROMAN = /^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫIVX]+\s*[.．]?\s*/;
  const NUM_RE = /^[-△▲(]?[\d,]+\)?$/;
  const RATIO_RE = /^[-△▲(]?\d+\.\d+%?\)?$/;   // 비율(%) 열: 100.00, 6.36 — 금액도 계정명도 아님

  function toNumber(tok) {
    let s = tok.replace(/,/g, '');
    let neg = false;
    if (/^[(△▲-]/.test(s)) { neg = true; s = s.replace(/^[(△▲-]/, '').replace(/\)$/, ''); }
    const n = parseInt(s, 10);
    if (isNaN(n)) return null;
    return neg ? -n : n;
  }

  function normalizeLabel(raw) {
    return raw.replace(/\s+/g, '').replace(ROMAN, '').replace(/^\(\d{1,2}\)/, '').replace(/^[①②③④⑤⑥⑦⑧⑨⑩]/, '').replace(/^[.．·]+/, '').trim();
  }

  /* ---------- 재무상태표 주요 항목 키 ---------- */
  function bsMajorKey(norm) {
    const n = norm.replace(/[()]/g, '');
    if (/^유동자산/.test(n)) return 'curAssets';
    if (/^당좌자산/.test(n)) return 'quickAssets';
    if (/^재고자산/.test(n)) return 'inventory';
    if (/^기타(비유동|고정)자산/.test(n)) return 'otherNonCur';
    if (/^(비유동|고정)자산/.test(n)) return 'nonCurAssets';
    if (/^투자자산/.test(n)) return 'investAssets';
    if (/^유형자산/.test(n)) return 'ppe';
    if (/^무형자산/.test(n)) return 'intangible';
    if (/^자산총계/.test(n)) return 'totalAssets';
    if (/^유동부채/.test(n)) return 'curLiab';
    if (/^(비유동|고정)부채/.test(n)) return 'nonCurLiab';
    if (/^부채총계/.test(n)) return 'totalLiab';
    if (/^자본금$/.test(n)) return 'capital';
    if (/^자본잉여금/.test(n)) return 'capSurplus';
    if (/^자본조정/.test(n)) return 'capAdj';
    if (/^기타포괄손익누계액/.test(n)) return 'oci';
    if (/^이익잉여금/.test(n)) return 'retained';
    if (/^(미처리)?결손금/.test(n)) return 'deficit';
    if (/^자본총계/.test(n)) return 'totalEquity';
    if (/^부채(및|와|과)자본총계/.test(n)) return 'totalLiabEq';
    return null;
  }
  // 재무상태표 기간 헤더: "제5기 2026년 06월 30일 현재" (기수가 큰 쪽 = 당기)
  const BS_PERIOD_RE = /제\s*(\d+)\s*\(?\s*(당|전)?\s*\)?\s*기[^\d]{0,4}(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*현재/g;
  function parseBsPeriods(fullText) {
    const t = fullText.replace(/\s+/g, '');
    const re = new RegExp(BS_PERIOD_RE.source, 'g'); const found = []; let m;
    while ((m = re.exec(t)) !== null) {
      const per = { termNo: +m[1], hint: m[2] || null, year: +m[3], endMonth: +m[4], endDay: +m[5] };
      if (!found.some(f => f.year === per.year && f.endMonth === per.endMonth && f.termNo === per.termNo)) found.push(per);
    }
    found.sort((a, b) => (b.termNo - a.termNo) || (b.year - a.year) || (b.endMonth - a.endMonth));
    const out = {};
    if (found[0]) out.cur = { ...found[0], kind: 'cur' };
    if (found[1]) out.prev = { ...found[1], kind: 'prev' };
    return out;
  }
  // 문서 종류 판별
  function detectType(fullText) {
    const t = fullText.replace(/\s+/g, '');
    const bsScore = (/재무상태표|대차대조표/.test(t) ? 2 : 0) + (/자산총계/.test(t) ? 1 : 0) + (/부채총계/.test(t) ? 1 : 0) + (/자본총계/.test(t) ? 1 : 0)
      + (/일현재/.test(t) ? 1 : 0) + (['보통예금', '외상매출금', '미지급금', '예수금', '임차보증금', '감가상각누계액', '자본금', '외상매입금'].filter(k => t.includes(k)).length >= 4 ? 1 : 0);
    const plScore = (/손익계산서/.test(t) ? 2 : 0) + (/매출총이익|영업이익|영업손실|당기순이익|당기순손실/.test(t) ? 1 : 0) + (/판매비와관리비|판매비및관리비/.test(t) ? 1 : 0)
      + (/부터.{0,12}까지/.test(t) ? 1 : 0) + (['급여', '복리후생비', '여비교통비', '통신비', '지급수수료', '매출원가', '매출액'].filter(k => t.includes(k)).length >= 3 ? 1 : 0);
    return bsScore > plScore ? 'bs' : 'pl';
  }

  // 주요 항목 판별 — 정규화된 계정명으로 키를 돌려준다
  function majorKey(norm) {
    const n = norm.replace(/[()]/g, '');
    if (/차감전/.test(n)) return 'pretax';
    if (/^당기순/.test(n)) return 'net';
    if (/^매출총/.test(n)) return 'gross';
    if (/^판매비/.test(n) || /^판관비/.test(n)) return 'sga';
    if (/^영업외수익/.test(n)) return 'nonOpInc';
    if (/^영업외비용/.test(n)) return 'nonOpExp';
    if (/^영업(이익|손실|손익)/.test(n)) return 'op';
    if (/^매출원가/.test(n)) return 'cogs';
    if (/^매출(액|고)?$/.test(n)) return 'sales';
    if (/^(법인세|소득세)(등|비용|차감)?$/.test(n)) return 'tax';
    return null;
  }

  // 한 페이지의 텍스트 아이템을 줄로 묶는다
  function buildLines(items) {
    const toks = [];
    for (const it of items) {
      const str = (it.str || '').trim();
      if (!str) continue;
      const x = it.transform[4], y = it.transform[5];
      toks.push({ str, x, y, w: it.width || 0, h: it.height || 0 });
    }
    toks.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const t of toks) {
      const last = lines[lines.length - 1];
      const tol = Math.max(2.5, (t.h || 10) * 0.45);
      if (last && Math.abs(last.y - t.y) <= tol) last.toks.push(t);
      else lines.push({ y: t.y, toks: [t] });
    }
    // pdf.js 는 글자 하나하나를 따로 주는 경우가 많다 → 바짝 붙은 조각은 한 토큰으로 합친다
    for (const l of lines) {
      l.toks.sort((a, b) => a.x - b.x);
      const merged = [];
      for (const t of l.toks) {
        const last = merged[merged.length - 1];
        const gapTol = Math.max(1.2, (t.h || 10) * 0.28);
        if (last && (t.x - (last.x + last.w)) < gapTol && !(/^[\d,.\-△▲()]+$/.test(last.str) !== /^[\d,.\-△▲()]+$/.test(t.str))) {
          last.str += t.str; last.w = (t.x + t.w) - last.x; last.h = Math.max(last.h, t.h);
        } else merged.push({ ...t });
      }
      l.toks = merged;
    }
    return lines;
  }

  function lineText(l) { return l.toks.map(t => t.str).join(''); }

  // 기간 헤더 파싱: "제4(당)기 2026년 1월 1일부터 2026년 6월30일까지"
  const PERIOD_RE = /제\s*(\d+)\s*\(?\s*(당|전)\s*\)?\s*기[^\d]{0,6}(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*부터\s*(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*까지/g;

  function parsePeriods(fullText) {
    const out = {};
    let m;
    const t = fullText.replace(/\s+/g, '');
    const re = new RegExp(PERIOD_RE.source, 'g');
    while ((m = re.exec(t)) !== null) {
      const kind = m[2] === '당' ? 'cur' : 'prev';
      if (out[kind]) continue;
      const sy = +m[3], sm = +m[4], ey = +m[6], em = +m[7], ed = +m[8];
      let months = (ey - sy) * 12 + (em - sm) + 1;
      if (ed < 15 && months > 1) months -= 1; // 6월 3일까지 같은 경우: 5개월로 본다
      out[kind] = { termNo: +m[1], kind, year: ey, startMonth: sm, endMonth: em, endDay: ed, months };
    }
    return out;
  }

  function parseCompany(fullText) {
    const t = fullText.replace(/\s+/g, '');
    const m = t.match(/(?:회사명|상호|업체명|법인명|사업자명)[:：]?(.{1,40}?)(?:\(단위|단위|사업자등록|사업자번호|대표자|$)/);
    if (m) return m[1].trim();
    return '';
  }

  /**
   * 메인 파서
   * @param {ArrayBuffer} buf
   * @param {string} fileName
   * @returns {Promise<Statement>}
   */
  async function parsePdf(buf, fileName) {
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let allLines = [];
    let fullText = '';
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const lines = buildLines(tc.items);
      fullText += lines.map(lineText).join('\n') + '\n';
      allLines = allLines.concat(lines.map(l => ({ ...l, page: p })));
    }
    const type = detectType(fullText);
    if (type === 'bs') return parseBS(allLines, fullText, fileName);
    return parsePL(allLines, fullText, fileName);
  }

  /* 금액 열(당기/전기) 위치를 머리글에서 찾는다 — 손익계산서·재무상태표 공용 */
  function findColumns(allLines) {
    let curCenter = null, prevCenter = null;
    for (const l of allLines) {
      const txt = lineText(l).replace(/\s+/g, '');
      if (/당\)?기/.test(txt) && /전\)?기/.test(txt) && !/부터|현재/.test(txt)) {
        for (const t of l.toks) {
          const s = t.str.replace(/\s+/g, '');
          if (/당\)?기|\(당/.test(s) && curCenter === null) curCenter = t.x + t.w / 2;
          if (/전\)?기|\(전/.test(s) && prevCenter === null) prevCenter = t.x + t.w / 2;
        }
        if (curCenter !== null && prevCenter !== null) break;
      }
    }
    const amountCols = [];
    for (const l of allLines) {
      const txt = lineText(l).replace(/\s+/g, '');
      if (!/^(금액(비율\(%\))?){1,3}$/.test(txt)) continue;
      let start = null;
      for (const t of l.toks) {
        const st = t.str.replace(/\s+/g, '');
        if (st.startsWith('금')) start = t.x;
        if (st.endsWith('액') && start !== null) { amountCols.push({ x0: start, x1: t.x + t.w, c: (start + t.x + t.w) / 2 }); start = null; }
      }
      if (amountCols.length) break;
    }
    return { curCenter, prevCenter, amountCols };
  }

  /* ---------- 재무상태표 ---------- */
  function parseBS(allLines, fullText, fileName) {
    const periods = parseBsPeriods(fullText);
    const company = parseCompany(fullText);
    const { curCenter, prevCenter, amountCols } = findColumns(allLines);
    const colByHeader = amountCols.length >= 2;
    const splitByNearest = (curCenter !== null && prevCenter !== null);
    const hasPrev = !!periods.prev || colByHeader || splitByNearest;
    let pageMidX = null;
    if (hasPrev && !colByHeader && !splitByNearest) {
      const xs = [];
      for (const l of allLines) for (const t of l.toks) if (NUM_RE.test(t.str)) xs.push(t.x + t.w);
      if (xs.length) { xs.sort((a, b) => a - b); pageMidX = (xs[0] + xs[xs.length - 1]) / 2; }
    }
    const items = []; let section = null; const seen = {};
    for (const l of allLines) {
      const labelToks = [], numToks = [];
      for (const t of l.toks) (NUM_RE.test(t.str) ? numToks : labelToks).push(t);
      if (!numToks.length || !labelToks.length) continue;
      const rawLabel = labelToks.map(t => t.str).join('');
      const norm = normalizeLabel(rawLabel).replace(/원$/, '');
      if (!norm || /^(과목|금액|단위|회사명)/.test(norm)) continue;
      if (/현재|[당전]\)?기[:：]?$|^\(?(당기|전기)[:：]/.test(norm)) continue;   // 기간 머리글·"당기: 1,234원" 줄 제외
      let cur = null, prev = null;
      for (const t of numToks) {
        const v = toNumber(t.str); if (v === null) continue;
        const cx = t.x + t.w / 2; let isPrev = false;
        if (hasPrev) {
          if (colByHeader) { let best = 0; amountCols.forEach((c, i) => { if (Math.abs(cx - c.c) < Math.abs(cx - amountCols[best].c)) best = i; }); isPrev = best >= 1; }
          else if (splitByNearest) isPrev = Math.abs(cx - prevCenter) < Math.abs(cx - curCenter);
          else if (pageMidX !== null) isPrev = cx > pageMidX;
        }
        if (isPrev) prev = v; else cur = v;   // 같은 열에 둘(감가상각누계액·차감액)이면 오른쪽(순액) 우선
      }
      if (cur === null && prev === null) continue;
      const stripped = rawLabel.replace(/\s+/g, '');
      const marked = ROMAN.test(stripped) || /^\(\d{1,2}\)|^[①②③④⑤⑥⑦⑧⑨⑩]/.test(stripped);
      let key = bsMajorKey(norm);
      // '자본금'·'재고자산' 처럼 대분류와 세부 계정 이름이 같을 수 있다 → 표시(Ⅰ. ① (1))가 있거나 처음 나온 것만 대분류
      const isMajor = key !== null && (marked || /총계$/.test(norm) || !seen[key]);
      if (!isMajor) key = null;
      if (key) seen[key] = true;
      if (key === 'deficit') { if (cur !== null) cur = -Math.abs(cur); if (prev !== null) prev = -Math.abs(prev); key = 'retained'; }
      if (isMajor) section = key || norm;
      items.push({ label: norm, key, level: isMajor ? 'major' : 'detail', section: isMajor ? null : section, cur, prev });
    }
    const out = [];
    const mk = (kind) => {
      const per = periods[kind];
      if (!per && kind === 'prev') return null;
      const vals = items.map(it => ({ label: it.label, key: it.key, level: it.level, section: it.section, value: it[kind] })).filter(it => it.value !== null && it.value !== undefined);
      if (!vals.length) return null;
      return { kind, year: per ? per.year : null, endMonth: per ? per.endMonth : null, endDay: per ? per.endDay : null, termNo: per ? per.termNo : null, items: vals };
    };
    const curP = mk('cur'); if (curP) out.push(curP);
    const prevP = hasPrev ? mk('prev') : null; if (prevP) out.push(prevP);
    return { type: 'bs', fileName, company, periods: out, lineCount: allLines.length, rawText: fullText };
  }

  /* ---------- 손익계산서 ---------- */
  function parsePL(allLines, fullText, fileName) {
    const periods = parsePeriods(fullText);
    const company = parseCompany(fullText);
    let hasPrev = !!periods.prev;

    // 열 기준점: "(당)기" "(전)기" 헤더 x 중심
    let curCenter = null, prevCenter = null;
    for (const l of allLines) {
      const txt = lineText(l).replace(/\s+/g, '');
      if (/당\)?기/.test(txt) && /전\)?기/.test(txt) && !/부터/.test(txt)) {
        // 토큰을 합쳐 '당' '전' 위치를 찾는다
        let acc = '';
        for (const t of l.toks) {
          const s = t.str.replace(/\s+/g, '');
          if (/당\)?기|\(당/.test(s) && curCenter === null) curCenter = t.x + t.w / 2;
          if (/전\)?기|\(전/.test(s) && prevCenter === null) prevCenter = t.x + t.w / 2;
          acc += s;
        }
        if (curCenter !== null && prevCenter !== null) break;
      }
    }
    // '금 액' 머리글 위치로 금액 열(당기/전기)을 잡는다 — 신설 1기처럼 '(전)기' 머리글 없이 전기 열이 0으로 찍힌 양식 대응
    const amountCols = [];
    for (const l of allLines) {
      const txt = lineText(l).replace(/\s+/g, '');
      if (!/^(금액(비율\(%\))?){1,3}$/.test(txt)) continue;
      let start = null;
      for (const t of l.toks) {
        const st = t.str.replace(/\s+/g, '');
        if (st.startsWith('금')) start = t.x;
        if (st.endsWith('액') && start !== null) { amountCols.push({ x0: start, x1: t.x + t.w, c: (start + t.x + t.w) / 2 }); start = null; }
      }
      if (amountCols.length) break;
    }
    const colByHeader = amountCols.length >= 2;
    if (colByHeader) hasPrev = true;           // 금액 열이 둘이면 전기 열이 있는 양식 (기간 문구가 없어도)
    // 헤더를 못 찾으면 숫자 위치로 추정(오른쪽 절반 = 전기)
    const splitByNearest = (curCenter !== null && prevCenter !== null);
    let pageMidX = null;
    if (!colByHeader && !splitByNearest && hasPrev) {
      const xs = [];
      for (const l of allLines) for (const t of l.toks) if (NUM_RE.test(t.str)) xs.push(t.x + t.w);
      if (xs.length) { xs.sort((a, b) => a - b); pageMidX = (xs[0] + xs[xs.length - 1]) / 2; }
    }

    const items = [];
    let section = null;
    const entityHints = { corp: 0, indiv: 0 };

    // 계정명 들여쓰기 기준: 숫자가 있는 줄 중 가장 왼쪽 계정명 x = 대분류 위치
    let minLabelX = Infinity;
    for (const l of allLines) {
      const hasNum = l.toks.some(t => NUM_RE.test(t.str) && !RATIO_RE.test(t.str));
      const first = l.toks.find(t => !NUM_RE.test(t.str) && !RATIO_RE.test(t.str));
      if (hasNum && first) minLabelX = Math.min(minLabelX, first.x);
    }

    for (const l of allLines) {
      const labelToks = [], numToks = [];
      for (const t of l.toks) { if (RATIO_RE.test(t.str)) continue; (NUM_RE.test(t.str) ? numToks : labelToks).push(t); }
      if (!numToks.length || !labelToks.length) continue;
      const rawLabel = labelToks.map(t => t.str).join('');
      const norm = normalizeLabel(rawLabel);
      if (!norm || /^(과목|금액|단위|회사명)/.test(norm)) continue;
      if (/부터|까지|[당전]\)\s*기/.test(norm)) continue;

      let cur = null, prev = null;
      for (const t of numToks) {
        const v = toNumber(t.str);
        if (v === null) continue;
        const cx = t.x + t.w / 2;
        let isPrev = false;
        if (hasPrev) {
          if (colByHeader) { let best = 0; amountCols.forEach((c, i) => { if (Math.abs(cx - c.c) < Math.abs(cx - amountCols[best].c)) best = i; }); isPrev = best >= 1; }
          else if (splitByNearest) isPrev = Math.abs(cx - prevCenter) < Math.abs(cx - curCenter);
          else if (pageMidX !== null) isPrev = cx > pageMidX;
        }
        if (isPrev) prev = v; else cur = v;  // 같은 열에 둘이면 오른쪽(합계) 우선
      }
      if (cur === null && prev === null) continue;

      const isMajor = ROMAN.test(rawLabel.replace(/\s+/g, '')) ||
        (majorKey(norm) !== null && labelToks[0].x <= minLabelX + 12);
      const key = isMajor ? majorKey(norm) : null;
      // 계정명이 '손실'(매출총손실·영업손실·법인세차감전손실·당기순손실)이면 금액 부호를 뒤집는다:
      // 세무프로그램은 손실일 때 계정명을 바꾸고 금액을 양수로 찍으며, 같은 줄의 전기 열이 이익이면 음수로 찍는다.
      if (key && ['gross', 'op', 'pretax', 'net'].includes(key) && /손실/.test(norm) && !/이익/.test(norm)) { if (cur !== null) cur = -cur; if (prev !== null) prev = -prev; }
      if (/법인세/.test(norm)) entityHints.corp++;
      if (/소득세/.test(norm)) entityHints.indiv++;
      if (isMajor) section = key || norm;

      items.push({ label: norm, key, level: isMajor ? 'major' : 'detail', section: isMajor ? null : section, cur, prev });
    }

    const entityType = (entityHints.corp > 0 && entityHints.indiv === 0) ? 'corp' : 'indiv';

    const out = [];
    const mk = (kind) => {
      const per = periods[kind];
      if (!per && kind === 'prev') return null;
      const vals = items.map(it => ({ label: it.label, key: it.key, level: it.level, section: it.section, value: it[kind] }))
        .filter(it => it.value !== null && it.value !== undefined);
      if (!vals.length) return null;
      return {
        kind, year: per ? per.year : null, months: per ? per.months : null,
        startMonth: per ? per.startMonth : null, endMonth: per ? per.endMonth : null,
        termNo: per ? per.termNo : null, items: vals,
      };
    };
    const curP = mk('cur'); if (curP) out.push(curP);
    const prevP = hasPrev ? mk('prev') : null; if (prevP) out.push(prevP);

    return { type: 'pl', fileName, company, entityType, periods: out, lineCount: allLines.length, rawText: fullText };
  }

  window.Parser = { parsePdf, majorKey, bsMajorKey, normalizeLabel, detectType };
})();
