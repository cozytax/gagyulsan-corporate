/* =====================================================================
 *  balance.js — 재무상태표 병합 · 검증 · 재무비율(안정성·수익성·성장성·활동성) · 업종평균 비교 · 진단 문구
 *  비율 정의·평가 기준은 js/config.js 의 ratioGroups / ratioBands 에서 고친다.
 * ===================================================================== */
(function () {
  'use strict';
  const C = window.CONFIG; const { Fmt } = window.Analysis;

  const BS_KEYS = ['curAssets', 'quickAssets', 'inventory', 'nonCurAssets', 'investAssets', 'ppe', 'intangible', 'otherNonCur', 'totalAssets',
    'curLiab', 'nonCurLiab', 'totalLiab', 'capital', 'capSurplus', 'capAdj', 'oci', 'retained', 'totalEquity', 'totalLiabEq'];
  const BS_LABEL = {
    curAssets: '유동자산', quickAssets: '당좌자산', inventory: '재고자산', nonCurAssets: '비유동자산', investAssets: '투자자산', ppe: '유형자산', intangible: '무형자산', otherNonCur: '기타비유동자산', totalAssets: '자산총계',
    curLiab: '유동부채', nonCurLiab: '비유동부채', totalLiab: '부채총계', capital: '자본금', capSurplus: '자본잉여금', capAdj: '자본조정', oci: '기타포괄손익누계액', retained: '이익잉여금(결손금)', totalEquity: '자본총계', totalLiabEq: '부채및자본총계',
  };
  // 비율 계산에 쓰는 세부 계정 묶음 (공백 제거한 계정명에 포함되면 해당)
  const DETAIL_GROUPS = {
    receivables: C.receivableKeywords || ['외상매출금', '받을어음'],
    payables: C.payableKeywords || ['외상매입금', '지급어음'],
    borrowings: C.borrowingKeywords || ['단기차입금', '장기차입금', '유동성장기부채', '사채', '주임종단기차입금', '주.임.종단기차입금', '주임종단기채무', '주.임.종단기채무'],
  };
  const has = kws => l => kws.some(k => l.replace(/\./g, '').includes(k.replace(/\./g, '')));

  /* ---------- 연도 레코드 ---------- */
  function emptyBsYear(year) {
    return { year, endMonth: 12, endDay: 31, source: 'manual', fileName: '', m: {}, found: {}, estimated: {}, details: [], groups: { receivables: 0, payables: 0, borrowings: 0 }, groupFound: {} };
  }
  function periodToBsYear(stmt, per) {
    const y = emptyBsYear(per.year);
    y.endMonth = per.endMonth || 12; y.endDay = per.endDay || 31; y.termNo = per.termNo; y.source = per.kind; y.fileName = stmt.fileName;
    for (const it of per.items) {
      if (it.level === 'major' && it.key) { if (y.m[it.key] === undefined) { y.m[it.key] = it.value; y.found[it.key] = true; } }
      else if (it.level === 'detail') {
        y.details.push({ label: it.label, section: it.section, value: it.value });
        for (const [g, kws] of Object.entries(DETAIL_GROUPS)) if (has(kws)(it.label)) { y.groups[g] += it.value; y.groupFound[g] = true; }
      }
    }
    return y;
  }
  /* 대분류(Ⅰ.유동자산 등)가 하나도 안 읽힌 양식: 세부 계정명으로 분류해 합계를 추정한다. 감가상각누계액·대손충당금 줄은 바로 앞 자산의 순액으로 본다 */
  function estimateFromDetails(y) {
    const map = C.bsDetailMap || {};
    const cls = l => { for (const [g, kws] of Object.entries(map)) if (kws.some(k => l.includes(k))) return g; return null; };
    const sums = {}; let lastGroup = null, lastVal = 0, unknown = [];
    for (const it of y.details) {
      const l = it.label;
      if (/감가상각누계액|대손충당금|현재가치할인차금/.test(l)) { if (lastGroup) sums[lastGroup] += it.value - lastVal; lastVal = it.value; continue; }
      const g = cls(l);
      if (!g) { unknown.push(l); lastGroup = null; continue; }
      sums[g] = (sums[g] || 0) + it.value; lastGroup = g; lastVal = it.value;
    }
    const set = (k, v) => { y.m[k] = v; y.estimated[k] = true; };
    set('quickAssets', sums.quick || 0); set('inventory', sums.inventory || 0); set('curAssets', (sums.quick || 0) + (sums.inventory || 0));
    set('investAssets', sums.invest || 0); set('ppe', sums.ppe || 0); set('intangible', sums.intangible || 0); set('otherNonCur', sums.otherNonCur || 0);
    set('nonCurAssets', (sums.invest || 0) + (sums.ppe || 0) + (sums.intangible || 0) + (sums.otherNonCur || 0));
    set('totalAssets', y.m.curAssets + y.m.nonCurAssets);
    set('curLiab', sums.curLiab || 0); set('nonCurLiab', sums.nonCurLiab || 0); set('totalLiab', y.m.curLiab + y.m.nonCurLiab);
    set('capital', y.found.capital ? y.m.capital : (sums.capital || 0)); set('capSurplus', sums.capSurplus || 0); set('capAdj', 0); set('oci', 0);
    set('retained', y.m.totalAssets - y.m.totalLiab - y.m.capital - y.m.capSurplus);   // 이익잉여금은 차액으로
    set('totalEquity', y.m.totalAssets - y.m.totalLiab); set('totalLiabEq', y.m.totalAssets);
    y.unknownDetails = unknown;
  }

  /* 빠진 합계는 계산해서 채운다 (found 가 false 인 값 = 계산값) */
  function fillDerived(y) {
    const m = y.m; const v = k => (m[k] === undefined || m[k] === null) ? null : m[k];
    const sum = (...ks) => ks.reduce((s, k) => s + (v(k) || 0), 0);
    if (v('totalAssets') === null && v('totalLiabEq') !== null) m.totalAssets = m.totalLiabEq;
    if (v('curAssets') === null && (v('quickAssets') !== null || v('inventory') !== null)) m.curAssets = sum('quickAssets', 'inventory');
    if (v('nonCurAssets') === null && (v('investAssets') !== null || v('ppe') !== null || v('intangible') !== null || v('otherNonCur') !== null)) m.nonCurAssets = sum('investAssets', 'ppe', 'intangible', 'otherNonCur');
    if (v('totalAssets') === null && (v('curAssets') !== null || v('nonCurAssets') !== null)) m.totalAssets = sum('curAssets', 'nonCurAssets');
    if (v('curAssets') === null && v('totalAssets') !== null && v('nonCurAssets') !== null) m.curAssets = m.totalAssets - m.nonCurAssets;
    if (v('nonCurAssets') === null && v('totalAssets') !== null && v('curAssets') !== null) m.nonCurAssets = m.totalAssets - m.curAssets;
    if (v('totalLiab') === null && (v('curLiab') !== null || v('nonCurLiab') !== null)) m.totalLiab = sum('curLiab', 'nonCurLiab');
    if (v('totalEquity') === null && (v('capital') !== null || v('retained') !== null)) m.totalEquity = sum('capital', 'capSurplus', 'capAdj', 'oci', 'retained');
    if (v('totalLiab') === null && v('totalAssets') !== null && v('totalEquity') !== null) m.totalLiab = m.totalAssets - m.totalEquity;
    if (v('totalEquity') === null && v('totalAssets') !== null && v('totalLiab') !== null) m.totalEquity = m.totalAssets - m.totalLiab;
    if (v('totalAssets') === null && v('totalLiab') !== null && v('totalEquity') !== null) m.totalAssets = m.totalLiab + m.totalEquity;
    if (v('curLiab') === null && v('totalLiab') !== null && v('nonCurLiab') !== null) m.curLiab = m.totalLiab - m.nonCurLiab;
    if (v('nonCurLiab') === null && v('totalLiab') !== null && v('curLiab') !== null) m.nonCurLiab = m.totalLiab - m.curLiab;
    if (v('quickAssets') === null && v('curAssets') !== null && v('inventory') !== null) m.quickAssets = m.curAssets - m.inventory;
    if (v('inventory') === null && v('curAssets') !== null && v('quickAssets') !== null) m.inventory = m.curAssets - m.quickAssets;
    if (v('totalLiabEq') === null && v('totalAssets') !== null) m.totalLiabEq = m.totalAssets;
    for (const k of BS_KEYS) if (v(k) === null) m[k] = 0;
  }

  /**
   * statements: Parser 결과(type==='bs') 배열, manual: {year: {m:{...}}}
   * 반환: { years(최근 3개년, 오래된→최근), warnings }
   */
  function mergeBalance(statements, manualYears) {
    const byYear = {}; const warnings = [];
    for (const s of statements) {
      for (const per of s.periods) {
        if (per.items.every(it => !it.value)) { if (per.year) warnings.push(`${s.fileName}: ${per.year}년(${per.kind === 'prev' ? '전기' : '당기'}) 재무상태표 열이 전부 0이라 제외했습니다.`); continue; }
        if (!per.year) { warnings.push(`${s.fileName}: 재무상태표 ${per.kind === 'prev' ? '전기' : '당기'} 열의 기준일을 읽지 못해 건너뛰었습니다.`); continue; }
        const y = periodToBsYear(s, per);
        if (!['totalAssets', 'curAssets', 'totalLiab', 'totalEquity', 'totalLiabEq', 'curLiab'].some(k => y.found[k]) && y.details.length) {
          estimateFromDetails(y);
          warnings.push(`${s.fileName}: ${y.year}년 재무상태표의 대분류(유동자산·자산총계 등)를 PDF에서 읽지 못해 세부 계정명으로 합계를 추정했습니다${y.unknownDetails.length ? ` (분류 못 한 계정: ${y.unknownDetails.join(', ')})` : ''}. 아래 표에서 확인해 주세요.`);
        }
        const ex = byYear[y.year];
        if (!ex) { byYear[y.year] = y; continue; }
        // 같은 연도가 둘이면 기준일이 늦은 쪽 → 같으면 '당기' 열 우선
        const pick = (y.endMonth > ex.endMonth) ? y : (y.endMonth < ex.endMonth) ? ex : (ex.source === 'cur' && y.source !== 'cur') ? ex : y;
        const other = pick === ex ? y : ex;
        if (pick.endMonth === other.endMonth && ex.m.totalAssets !== undefined && y.m.totalAssets !== undefined && ex.m.totalAssets !== y.m.totalAssets)
          warnings.push(`${y.year}년 자산총계가 파일마다 다릅니다 (${Fmt.won(ex.m.totalAssets)} / ${Fmt.won(y.m.totalAssets)}). '${pick.fileName}' 의 값을 사용했습니다.`);
        byYear[y.year] = pick;
      }
    }
    if (manualYears) for (const [yr, d] of Object.entries(manualYears)) {
      if (!byYear[yr]) byYear[yr] = emptyBsYear(+yr);
      Object.assign(byYear[yr].m, d.m || {});
      for (const k of Object.keys(d.m || {})) byYear[yr].found[k] = true;
    }
    const years = Object.values(byYear).sort((a, b) => a.year - b.year).slice(-3);
    years.forEach(fillDerived);
    return { years, warnings };
  }

  /* ---------- 검증 ---------- */
  function validateBalance(years) {
    const issues = [];
    for (const y of years) {
      const m = y.m, f = y.found || {}; const tag = `${y.year}년 재무상태표`;
      if (y.source !== 'manual' && !f.totalAssets && !f.totalLiabEq && !(y.estimated && y.estimated.totalAssets)) issues.push({ level: 'error', year: y.year, text: `${tag}: 자산총계를 PDF에서 찾지 못했습니다. 아래 표에서 직접 입력해 주세요.` });
      if (y.estimated && y.estimated.totalAssets && y.source !== 'manual') issues.push({ level: 'warn', year: y.year, text: `${tag}: 합계를 세부 계정에서 추정했습니다 (자산총계 ${Fmt.won(m.totalAssets)}). 원본과 대조해 주세요.` });
      if (f.totalAssets && f.totalLiab && f.totalEquity && Math.abs(m.totalAssets - (m.totalLiab + m.totalEquity)) > 1)
        issues.push({ level: 'warn', year: y.year, text: `${tag}: 자산총계(${Fmt.won(m.totalAssets)})가 부채총계+자본총계(${Fmt.won(m.totalLiab + m.totalEquity)})와 ${Fmt.won(Math.abs(m.totalAssets - m.totalLiab - m.totalEquity))}원 차이 납니다.` });
      if (f.curAssets && f.quickAssets && f.inventory && Math.abs(m.curAssets - (m.quickAssets + m.inventory)) > 1)
        issues.push({ level: 'warn', year: y.year, text: `${tag}: 유동자산이 당좌자산+재고자산과 ${Fmt.won(Math.abs(m.curAssets - m.quickAssets - m.inventory))}원 차이 납니다.` });
      if (m.totalEquity < 0) issues.push({ level: 'warn', year: y.year, text: `${tag}: 자본총계가 음수(${Fmt.won(m.totalEquity)})입니다 — 자본잠식 상태로 부채비율·ROE 는 계산하지 않습니다.` });
    }
    return issues;
  }

  /* ---------- 업종평균 조회 (업종 → 상위 업종 → 전산업, 규모 → 종합 순으로 대체) ---------- */
  function findIndustry(key) { const IA = window.INDUSTRY_AVG; return IA ? IA.list.find(i => i.key === key) : null; }
  function lookupAvg(indKey, size, metric) {
    const IA = window.INDUSTRY_AVG; if (!IA || !indKey) return null;
    let ind = findIndustry(indKey); let hops = 0;
    while (ind && hops < 6) {
      const a = ind.avg || {};
      const bySize = a[size] && a[size][metric] !== undefined ? a[size][metric] : null;
      if (bySize !== null) return { value: bySize, industry: ind, size, exact: ind.key === indKey };
      const total = a['종합'] && a['종합'][metric] !== undefined ? a['종합'][metric] : null;
      if (total !== null) return { value: total, industry: ind, size: '종합', exact: ind.key === indKey };
      ind = ind.parent ? findIndustry(ind.parent) : null; hops++;
    }
    return null;
  }

  /* ---------- 비율 계산 ----------
   * pl: Analysis.analyze 결과의 연도 행(연환산 값 a 사용) 또는 null. bs: 당기 재무상태표, bsPrev: 전기(없으면 null)
   * 회전율·ROA·ROE 의 분모는 전기 자료가 있으면 (기초+기말)/2 평균잔액, 없으면 기말잔액 (한국은행 기업경영분석 방식)
   */
  const pct = (a, b) => (b && b !== 0) ? a / b * 100 : null;
  const growth = (cur, prev) => (prev && prev !== 0) ? (cur - prev) / Math.abs(prev) * 100 : null;
  function computeRatios(bs, bsPrev, pl, plPrev) {
    const m = bs.m, p = bsPrev ? bsPrev.m : null;
    const avg = (k) => (C.turnoverUseAverage !== false && p) ? (m[k] + p[k]) / 2 : m[k];
    const avgG = (g) => (C.turnoverUseAverage !== false && bsPrev) ? (bs.groups[g] + bsPrev.groups[g]) / 2 : bs.groups[g];
    const a = pl ? pl.a : null;                               // 연환산 손익
    const interest = pl ? (pl.details.nonOpExp || []).filter(it => (C.interestKeywords || ['이자비용']).some(k => it.label.includes(k))).reduce((s, it) => s + it.value, 0) * (pl.factor || 1) : null;
    const r = {};
    const equityNeg = m.totalEquity <= 0;
    r.debtRatio = equityNeg ? { value: null, note: '자본잠식' } : { value: pct(m.totalLiab, m.totalEquity) };
    r.borrowDep = { value: pct(bs.groups.borrowings, m.totalAssets), note: bs.groupFound.borrowings ? '' : '차입금 계정 없음' };
    r.curRatio = { value: m.curLiab ? pct(m.curAssets, m.curLiab) : null, note: m.curLiab ? '' : '유동부채 없음' };
    r.intCover = !a ? { value: null, note: '손익계산서 필요' } : interest > 0 ? { value: a.op / interest, unit: '배' } : { value: null, note: a.op > 0 ? '이자비용 없음' : '이자비용 없음' , noInterest: true };
    r.netMargin = a ? { value: pct(a.net, Math.abs(a.sales)) } : { value: null, note: '손익계산서 필요' };
    r.opMargin = a ? { value: pct(a.op, Math.abs(a.sales)) } : { value: null, note: '손익계산서 필요' };
    r.roa = a ? { value: pct(a.net, avg('totalAssets')) } : { value: null, note: '손익계산서 필요' };
    r.roe = !a ? { value: null, note: '손익계산서 필요' } : (equityNeg || (p && p.totalEquity <= 0)) ? { value: null, note: '자본잠식' } : { value: pct(a.net, avg('totalEquity')) };
    r.assetGrowth = p ? { value: growth(m.totalAssets, p.totalAssets) } : { value: null, note: '전기 자료 없음' };
    r.equityGrowth = p ? (p.totalEquity <= 0 || m.totalEquity <= 0 ? { value: null, note: '자본잠식' } : { value: growth(m.totalEquity, p.totalEquity) }) : { value: null, note: '전기 자료 없음' };
    r.curAssetGrowth = p ? { value: growth(m.curAssets, p.curAssets) } : { value: null, note: '전기 자료 없음' };
    r.salesGrowth = (a && plPrev) ? { value: growth(a.sales, plPrev.a.sales) } : { value: null, note: a ? '전년 손익 없음' : '손익계산서 필요' };
    r.assetTurn = a ? { value: avg('totalAssets') ? a.sales / avg('totalAssets') : null, unit: '회' } : { value: null, note: '손익계산서 필요' };
    r.invTurn = a ? (avg('inventory') > 0 ? { value: a.sales / avg('inventory'), unit: '회' } : { value: null, note: '재고자산 없음' }) : { value: null, note: '손익계산서 필요' };
    r.arTurn = a ? (avgG('receivables') > 0 ? { value: a.sales / avgG('receivables'), unit: '회' } : { value: null, note: '매출채권 없음' }) : { value: null, note: '손익계산서 필요' };
    r.apTurn = a ? (avgG('payables') > 0 ? { value: a.sales / avgG('payables'), unit: '회' } : { value: null, note: '매입채무 없음' }) : { value: null, note: '손익계산서 필요' };
    r._interest = interest;
    return r;
  }

  /* 평가: 업종평균 대비 양호/보통/미흡. band: {type:'rel', pct} 또는 {type:'abs', pp} (config.ratioBands) */
  function rate(def, value, avgVal) {
    if (value === null || value === undefined || avgVal === null || avgVal === undefined) return null;
    const band = (C.ratioBands && C.ratioBands[def.band]) || { type: 'rel', pct: 10 };
    const tol = band.type === 'abs' ? band.pp : Math.abs(avgVal) * band.pct / 100;
    const diff = value - avgVal;
    if (Math.abs(diff) <= tol) return 'normal';
    const better = def.betterWhen === 'low' ? diff < 0 : diff > 0;
    return better ? 'good' : 'bad';
  }
  const RATE_LABEL = { good: '양호', normal: '보통', bad: '미흡' };

  function fmtRatio(def, v) {
    if (v === null || v === undefined || isNaN(v) || !isFinite(v)) return '-';
    if (def.unit === '회') return `${v.toFixed(1)}회`;
    if (def.unit === '배') return `${v.toFixed(1)}배`;
    return `${v.toFixed(1)}%`;
  }

  /**
   * 메인: 재무상태표 연도들 + 손익 분석(있으면) + 업종 선택 → 비율 그룹·KPI·진단
   * opts: { industryKey, firmSize }
   */
  function analyzeRatios(bsYears, plAnalysis, opts) {
    opts = opts || {};
    if (!bsYears || !bsYears.length) return null;
    const bs = bsYears[bsYears.length - 1];
    const bsPrev = bsYears.length > 1 ? bsYears[bsYears.length - 2] : null;
    const plRows = plAnalysis ? plAnalysis.rows : [];
    const pl = plRows.find(r => r.year === bs.year) || null;
    const plPrev = pl ? (plRows.find(r => r.year === bs.year - 1) || null) : null;
    const plMismatch = plAnalysis && !pl ? plAnalysis.base.year : null;
    const raw = computeRatios(bs, bsPrev, pl, plPrev);
    const size = opts.firmSize || C.defaultFirmSize || '중소기업';
    const ind = findIndustry(opts.industryKey);
    const IA = window.INDUSTRY_AVG;
    const groups = (C.ratioGroups || []).map(g => {
      const items = g.items.map(def => {
        const res = raw[def.key] || { value: null };
        const avgInfo = lookupAvg(opts.industryKey, size, def.key);
        let avgVal = avgInfo ? avgInfo.value : null;
        if (def.key === 'intCover' && avgVal !== null) avgVal = avgVal / 100;   // 한국은행 자료는 % → 배
        let grade = rate(def, res.value, avgVal);
        if (def.key === 'intCover' && res.noInterest) grade = 'good';          // 이자비용이 없으면 금융비용 부담 없음
        return { ...def, value: res.value, note: res.note || '', avg: avgVal, avgFallback: avgInfo && !avgInfo.exact ? avgInfo.industry.key : null, grade, gradeLabel: grade ? RATE_LABEL[grade] : '-', text: res.noInterest ? '이자비용 없음' : fmtRatio(def, res.value), avgText: fmtRatio(def, avgVal) };
      });
      const count = { good: 0, normal: 0, bad: 0 }; items.forEach(it => { if (it.grade) count[it.grade]++; });
      return { key: g.key, label: g.label, desc: g.desc, items, count };
    });
    const kpi = {
      totalAssets: { cur: bs.m.totalAssets, prev: bsPrev ? bsPrev.m.totalAssets : null, g: bsPrev ? growth(bs.m.totalAssets, bsPrev.m.totalAssets) : null },
      totalLiab: { cur: bs.m.totalLiab, prev: bsPrev ? bsPrev.m.totalLiab : null, g: bsPrev ? growth(bs.m.totalLiab, bsPrev.m.totalLiab) : null },
      totalEquity: { cur: bs.m.totalEquity, prev: bsPrev ? bsPrev.m.totalEquity : null, g: bsPrev ? growth(bs.m.totalEquity, bsPrev.m.totalEquity) : null },
    };
    const points = buildRatioPoints(bs, bsPrev, pl, raw, groups, ind);
    const summary = buildRatioSummary(groups, raw, bs);
    return { bs, bsPrev, years: bsYears, pl, plPrev, plMismatch, raw, groups, kpi, points, summary, industry: ind, firmSize: size, avgYear: IA ? IA.year : null, avgSource: IA ? IA.source : '', hasPl: !!pl };
  }

  /* ---------- 진단 문구 ---------- */
  function buildRatioPoints(bs, bsPrev, pl, r, groups, ind) {
    const pts = []; const push = (tone, title, body) => pts.push({ tone, title, body });
    const m = bs.m; const T = C.ratioThresholds || {};
    const item = k => { for (const g of groups) for (const it of g.items) if (it.key === k) return it; return null; };
    const vsAvg = (it) => it && it.avg !== null && it.value !== null ? ` (업종평균 ${it.avgText}${it.avgFallback ? ', 상위 업종 기준' : ''})` : '';
    // 자본잠식
    if (m.totalEquity <= 0) push('warn', '자본잠식 상태', `자본총계가 ${Fmt.man(m.totalEquity)}으로 부채가 자산보다 큽니다. 누적 결손을 메울 증자·이익 계획과 함께 대표자 가수금 처리 방안을 검토해야 합니다.`);
    else {
      const d = item('debtRatio');
      if (d && d.value !== null) {
        if (d.value >= (T.debtRatioHigh || 200)) push('warn', `부채비율 ${d.text}`, `부채 ${Fmt.man(m.totalLiab)} / 자본 ${Fmt.man(m.totalEquity)}${vsAvg(d)}. 차입 상환 계획과 대표자 가수금·주임종 채무 정리 여부를 확인하겠습니다.`);
        else if (d.value <= (T.debtRatioLow || 100)) push('good', `부채비율 ${d.text}`, `부채 ${Fmt.man(m.totalLiab)} / 자본 ${Fmt.man(m.totalEquity)}${vsAvg(d)}. 재무구조가 안정적입니다.`);
        else push('info', `부채비율 ${d.text}`, `부채 ${Fmt.man(m.totalLiab)} / 자본 ${Fmt.man(m.totalEquity)}${vsAvg(d)}.`);
      }
    }
    // 유동성
    const c = item('curRatio');
    if (c && c.value !== null) {
      if (c.value < (T.curRatioLow || 100)) push('warn', `유동비율 ${c.text}`, `1년 안에 갚을 유동부채 ${Fmt.man(m.curLiab)}가 유동자산 ${Fmt.man(m.curAssets)}보다 큽니다${vsAvg(c)}. 단기 자금 계획을 점검해야 합니다.`);
      else if (c.value >= (T.curRatioGood || 150)) push('good', `유동비율 ${c.text}`, `유동자산 ${Fmt.man(m.curAssets)}로 유동부채 ${Fmt.man(m.curLiab)}를 충분히 감당합니다${vsAvg(c)}.`);
    }
    // 차입금
    const b = item('borrowDep');
    if (b && b.value !== null && bs.groups.borrowings > 0) {
      if (b.value >= (T.borrowDepHigh || 40)) push('warn', `차입금의존도 ${b.text}`, `차입금 ${Fmt.man(bs.groups.borrowings)}이 총자산의 ${b.text}${vsAvg(b)}. 금리 부담과 상환 일정을 함께 보겠습니다.`);
      else push('info', `차입금의존도 ${b.text}`, `차입금 ${Fmt.man(bs.groups.borrowings)}${vsAvg(b)}.`);
    }
    // 수익성(손익 있을 때)
    const roe = item('roe'), roa = item('roa');
    if (pl && roe && roe.value !== null) {
      const tone = roe.grade === 'bad' ? 'warn' : roe.grade === 'good' ? 'good' : 'info';
      push(tone, `자기자본이익률(ROE) ${roe.text}`, `당기순이익(연환산) ${Fmt.man(pl.a.net)} / 자기자본 ${Fmt.man(m.totalEquity)}${vsAvg(roe)}${roa && roa.value !== null ? `. 총자산이익률(ROA) ${roa.text}${vsAvg(roa)}` : ''}.`);
    }
    // 재고·채권 회전
    const inv = item('invTurn'), ar = item('arTurn');
    if (inv && inv.value !== null && inv.grade === 'bad') push('warn', `재고자산회전율 ${inv.text}`, `재고 ${Fmt.man(m.inventory)}에 비해 매출 회전이 느립니다${vsAvg(inv)}. 장기 재고·평가손 반영 여부를 결산 전에 확인하겠습니다.`);
    if (ar && ar.value !== null && ar.grade === 'bad') push('warn', `매출채권회전율 ${ar.text}`, `매출채권 ${Fmt.man(bs.groups.receivables)}의 회수가 업종평균보다 느립니다${vsAvg(ar)}. 장기 미수채권은 대손 요건을 검토하겠습니다.`);
    // 성장
    const ag = item('assetGrowth');
    if (ag && ag.value !== null && bsPrev) {
      const eq = item('equityGrowth');
      push(ag.value >= 0 ? 'info' : 'warn', `총자산 ${Fmt.growthWord(ag.value) || '변동 없음'}`, `${bsPrev.year}년 ${Fmt.man(bsPrev.m.totalAssets)} → ${bs.year}년 ${Fmt.man(m.totalAssets)}${vsAvg(ag)}${eq && eq.value !== null ? `. 자기자본은 ${Fmt.growthWord(eq.value) || '전년 수준'}` : ''}.`);
    }
    if (!pl) push('info', '손익계산서 미첨부', '수익성·활동성 지표(이익률·ROA·ROE·회전율)는 같은 연도 손익계산서를 함께 올리면 계산됩니다.');
    const maxPts = (C.ratioThresholds && C.ratioThresholds.maxPoints) || 4;
    while (pts.length > maxPts) { const i = pts.map(x => x.tone).lastIndexOf('info'); pts.splice(i >= 0 ? i : pts.length - 1, 1); }
    return pts;
  }
  function buildRatioSummary(groups, r, bs) {
    const tot = { good: 0, normal: 0, bad: 0 }; groups.forEach(g => { tot.good += g.count.good; tot.normal += g.count.normal; tot.bad += g.count.bad; });
    const rated = tot.good + tot.normal + tot.bad;
    const stab = groups.find(g => g.key === 'stability');
    let head;
    if (bs.m.totalEquity <= 0) head = '자본잠식 상태로 재무구조 개선이 최우선 과제입니다.';
    else if (!rated) head = '업종을 선택하면 업종평균과 비교한 평가가 표시됩니다.';
    else if (tot.bad === 0 && tot.good >= rated / 2) head = '업종평균 대비 전반적으로 양호한 재무 상태입니다.';
    else if (tot.bad >= rated / 2) head = '업종평균 대비 개선이 필요한 지표가 많습니다.';
    else head = '업종평균과 비슷한 수준이며 일부 지표는 보완이 필요합니다.';
    const detail = rated ? `${rated}개 지표 중 양호 ${tot.good} · 보통 ${tot.normal} · 미흡 ${tot.bad}` : '';
    const weak = []; groups.forEach(g => g.items.forEach(it => { if (it.grade === 'bad') weak.push(it.label); }));
    return { head, detail, weak, total: tot, rated, stabilityOk: stab ? stab.count.bad === 0 : null };
  }

  window.Balance = { BS_KEYS, BS_LABEL, mergeBalance, validateBalance, analyzeRatios, lookupAvg, findIndustry, fmtRatio, emptyBsYear, fillDerived, RATE_LABEL };
})();
