/* =====================================================================
 *  report.js — 보고서 HTML 생성
 *  기본 2쪽: ① 경영성과 요약  ② 세무 진단 및 향후 관리계획 (+ 표지 옵션, 내용이 많으면 ②가 다음 쪽으로 이어짐)
 * ===================================================================== */
(function () {
  'use strict';
  const C = window.CONFIG;
  const { Fmt, MAJOR_LABEL } = window.Analysis;
  const esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nl2br = s => esc(s).replace(/\n/g, '<br>');
  const koDate = d => `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;

  function periodText(y) {
    if (!y) return '';
    if (y.months >= 12 || !y.startMonth) return `${y.year}년 1월 1일 ~ 12월 31일 (12개월)`;
    return `${y.year}년 ${y.startMonth}월 1일 ~ ${y.endMonth}월 말 (${y.months}개월)`;
  }
  const shortPeriod = y => (y.months >= 12 || !y.startMonth) ? '연간' : `${y.startMonth}~${y.endMonth}월`;
  const logoFoot = `<img src="assets/logo_h.png" alt="" onerror="this.remove()">`;

  /* ---------- 표지 (옵션) ---------- */
  function cover(model) {
    const { meta, analysis } = model; const b = analysis.base; const est = b.factor !== 1;
    return `
<section class="page cover">
  <div class="rule-top"></div><div class="rule-top-thin"></div>
  <div class="body">
    <div class="fy">${b.year} 사업연도</div>
    <div class="title-band"><h1>${esc(meta.title)}</h1></div>
    <div class="sub">기준기간 <span class="period">${esc(periodText(b))}</span>${analysis.rows.length > 1 ? `<br>${est ? '12개월 환산 추정 및 ' : ''}최근 ${analysis.rows.length}개년 비교 포함` : (est ? '<br>12개월 환산 추정 포함' : '')}</div>
    <div class="company-box"><small>회 사 명</small>${esc(meta.company || '회사명 미입력')}</div>
    <div class="meta">보고일 &nbsp;${esc(meta.dateText)}${meta.preparer ? `<br>담당 &nbsp;${esc(meta.preparer)}` : ''}</div>
    <div class="firm"><img src="assets/logo_v.png" alt="${esc(meta.firm)}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><span style="display:none">${esc(meta.firm)}<small>TAX &amp; ACCOUNTING</small></span></div>
  </div>
  <div class="foot">${esc(meta.footnote)}</div>
</section>`;
  }

  /* ---------- 본문 머리글 (회사명·보고서명·기준기간·보고일·로고) ---------- */
  function header(model, pageTitle, num) {
    const { meta, analysis } = model; const b = analysis.base;
    return `<div class="hdr">
  <div class="hdr-l"><div class="co">${esc(meta.company || '회사명 미입력')}</div>
    <div class="ttl"><span class="num">${num}</span>${esc(pageTitle)}</div>
    <div class="sub">${esc(meta.title)} · 기준기간 ${esc(periodText(b))} · 보고일 ${esc(meta.dateText)}</div></div>
  <img class="hdr-logo" src="assets/logo_h.png" alt="${esc(meta.firm)}" onerror="this.remove()">
</div>`;
  }
  function footer(model, pageNo, total) {
    const { meta } = model;
    return `<div class="page-foot"><span>${logoFoot}${esc(meta.title)}</span><span>${esc(meta.company)} · ${pageNo} / ${total}</span></div>`;
  }

  /* ---------- KPI 카드: 실적(실제)과 연환산(추정)을 나란히 ---------- */
  function kpi(label, b, keyM, keyA, g, same, est, opt) {
    opt = opt || {};
    const real = b.m[keyM], ann = b.a[keyA];
    const gTxt = Fmt.growthWord(g);
    const sameTxt = same && same.g[keyM] !== null && same.g[keyM] !== undefined ? Fmt.growthWord(same.g[keyM]) : null;
    return `<div class="kpi">
  <div class="k">${label}${opt.sub ? `<small>${opt.sub}</small>` : ''}</div>
  <div class="row"><span class="tag real">${est ? `실적 ${shortPeriod(b)}` : '실적 연간'}</span><b class="v${real < 0 ? ' neg' : ''}">${Fmt.man(real)}</b></div>
  ${est ? `<div class="row"><span class="tag est">연환산 추정</span><b class="v2${ann < 0 ? ' neg' : ''}">${Fmt.man(ann)}</b></div>` : ''}
  <div class="s">${gTxt ? `전년 대비${est ? '(연환산 기준)' : ''} <b class="${g > 0 ? 'up' : g < 0 ? 'down' : ''}">${gTxt}${est ? ' 예상' : ''}</b>` : '전년 대비 -'}${sameTxt ? `<br>전년 동기 대비(실제) <b class="${same.g[keyM] > 0 ? 'up' : same.g[keyM] < 0 ? 'down' : ''}">${sameTxt}</b>` : ''}</div>
</div>`;
  }
  function kpiTax(analysis, est) {
    const t = analysis.tax; const b = analysis.base; const nm = t.entity === 'indiv' ? '종합소득세' : '법인세';
    if (t.noTax) return `<div class="kpi"><div class="k">예상 세액<small>${nm}·추정</small></div><div class="row"><span class="tag est">추정</span><b class="v">0원</b></div><div class="s">세전이익이 없어 ${nm}가 발생하지 않을 것으로 보입니다</div></div>`;
    return `<div class="kpi">
  <div class="k">예상 세액<small>${nm}+지방소득세 · 산출 기준</small></div>
  ${est ? `<div class="row"><span class="tag est">실적 ${shortPeriod(b)} 기준</span><b class="v2">${Fmt.man(t.actual.total)}</b></div><div class="row"><span class="tag real">연환산 추정</span><b class="v">${Fmt.man(t.annual.total)}</b></div>` : `<div class="row"><span class="tag real">추정</span><b class="v">${Fmt.man(t.annual.total)}</b></div>`}
  <div class="s">기본세율 기준 산출세액${t.hasCredit ? '(공제·감면 후)' : ''} · 기납부세액 차감 전</div>
</div>`;
  }

  /* ---------- 손익계산서 요약표 ---------- */
  function plTable(model) {
    const { analysis, options } = model;
    const rows = analysis.rows; const b = analysis.base; const est = b.factor !== 1; const same = analysis.same;
    const unit = options.unit || 1;
    const prevRows = rows.slice(0, -1);
    const head = ['<th>항목</th>']
      .concat(prevRows.map(y => `<th>${y.year}년<small>${y.months < 12 ? `${y.months}개월 실적` : '연간 실적'}</small></th>`))
      .concat(same ? [`<th>${same.year}년 동기<small>${shortPeriod(b)} 실적</small></th>`] : [])
      .concat([`<th>${b.year}년 실적<small>${shortPeriod(b)} (${b.months}개월) 실제</small></th>`])
      .concat(est ? [`<th>${b.year}년 연환산<small>12개월 추정</small></th>`] : [])
      .concat(analysis.prev ? [`<th>전년 대비<small>${est ? '연환산 기준' : '실적 기준'}</small></th>`] : [])
      .join('');
    const spec = [
      ['sales', 'total'], ['cogs', 'sub'], ['gross', 'total'], ['sga', 'sub'], ['op', 'total hl'], ['opMargin', 'pct'],
      ['nonOpInc', 'sub'], ['nonOpExp', 'sub'], ['pretax', 'total'], ['tax', 'sub'], ['net', 'total hl'],
    ];
    const cell = (v, cls) => `<td class="${cls || ''}${v < 0 ? ' neg' : ''}">${Fmt.wonUnit(v, unit)}</td>`;
    const body = spec.map(([k, cls]) => {
      if (k === 'opMargin') {
        const pc = y => `<td class="pct">${Fmt.pct(y.r.opMargin)}</td>`;
        const samePct = same && same.m.sales ? `<td class="pct">${Fmt.pct(same.m.op / Math.abs(same.m.sales) * 100)}</td>` : (same ? '<td class="pct">-</td>' : '');
        const d = analysis.prev && b.r.opMargin !== null && analysis.prev.r.opMargin !== null ? b.r.opMargin - analysis.prev.r.opMargin : null;
        return `<tr class="pct"><td class="sub">영업이익률</td>${prevRows.map(pc).join('')}${samePct}${pc(b)}${est ? pc(b) : ''}${analysis.prev ? `<td class="delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d === null ? '-' : (d > 0 ? '+' : '') + d.toFixed(1) + '%p'}</td>` : ''}</tr>`;
      }
      const isTotal = cls.includes('total');
      let label = MAJOR_LABEL[k];
      if (k === 'tax') label = analysis.tax.entity === 'indiv' ? '소득세등' : '법인세등';
      if (k === 'pretax') label = analysis.tax.entity === 'indiv' ? '소득세차감전이익' : '법인세차감전이익';
      const g = analysis.prev ? (b.g[k] !== undefined ? b.g[k] : ((analysis.prev.a[k]) ? (b.a[k] - analysis.prev.a[k]) / Math.abs(analysis.prev.a[k]) * 100 : null)) : null;
      const gCls = g === null ? '' : g > 0 ? 'up' : g < 0 ? 'down' : '';
      return `<tr class="${cls}"><td class="${isTotal ? '' : 'sub'}">${label}</td>` +
        prevRows.map(y => cell(y.m[k])).join('') + (same ? cell(same.m[k]) : '') + cell(b.m[k]) +
        (est ? cell(b.a[k], 'est') : '') +
        (analysis.prev ? `<td class="delta ${g ? gCls : ''}">${Fmt.delta(g)}</td>` : '') + '</tr>';
    }).join('');
    const partialPrev = prevRows.filter(y => y.factor !== 1);
    const notes = [];
    if (est) notes.push(`연환산 = ${b.months}개월 실적 × ${(12 / b.months).toFixed(2)} (추정)`);
    if (partialPrev.length) notes.push(`${partialPrev.map(y => `${y.year}년(${y.months}개월)`).join(', ')}도 12개월로 환산해 비교`);
    return `<div class="unit-note">(단위: ${unit === 1000 ? '천원' : '원'})</div><table class="pl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${notes.length ? `<div class="unit-note left">※ ${notes.join(' · ')}</div>` : ''}`;
  }

  /* ---------- 추이 차트: 매출·영업이익 ---------- */
  function chart(analysis) {
    const rows = analysis.rows; const b = analysis.base;
    const metrics = [['sales', '매출액'], ['op', '영업이익']];
    const W = 760, H = 170, padL = 14, padR = 14, padT = 20, padB = 26;
    const vals = []; rows.forEach(y => metrics.forEach(([k]) => vals.push(y.a[k], y.m[k])));
    let max = Math.max(0, ...vals), min = Math.min(0, ...vals);
    if (max === 0 && min === 0) max = 1;
    const span = max - min; max += span * 0.12; min -= (min < 0 ? span * 0.12 : 0);
    const plotH = H - padT - padB, plotW = W - padL - padR;
    const yOf = v => padT + (max - v) / (max - min) * plotH;
    const y0 = yOf(0);
    const colors = rows.length === 3 ? ['var(--y1)', 'var(--y2)', 'var(--y3)'] : rows.length === 2 ? ['var(--y2)', 'var(--y3)'] : ['var(--y3)'];
    const short = v => { const a = Math.abs(v); const s = a >= 1e8 ? `${(a / 1e8).toFixed(2).replace(/\.?0+$/, '')}억` : a >= 1e4 ? `${Math.round(a / 1e4).toLocaleString('ko-KR')}만` : `${Math.round(a).toLocaleString('ko-KR')}`; return (v < 0 ? '−' : '') + s; };
    const groupW = plotW / metrics.length;
    const barW = Math.min(56, (groupW * 0.6) / rows.length), gap = 8;
    const totalBars = rows.length * barW + (rows.length - 1) * gap;
    let svg = '';
    for (let i = 0; i <= 4; i++) { const yy = yOf(min + (max - min) * i / 4); svg += `<line x1="${padL}" x2="${W - padR}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}" stroke="#e8ecf1" stroke-width="1"/>`; }
    svg += `<line x1="${padL}" x2="${W - padR}" y1="${y0.toFixed(1)}" y2="${y0.toFixed(1)}" stroke="#9aa3b2" stroke-width="1.2"/>`;
    metrics.forEach(([k, label], gi) => {
      const gx = padL + gi * groupW + (groupW - totalBars) / 2;
      rows.forEach((y, yi) => {
        const x = gx + yi * (barW + gap); const actual = y.m[k], annual = y.a[k];
        const rect = (v0, v1, fill) => { const top = Math.min(yOf(v0), yOf(v1)), h = Math.abs(yOf(v0) - yOf(v1)); return h > 0.3 ? `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${fill}"/>` : ''; };
        const partial = y.factor !== 1;
        svg += rect(0, actual, colors[yi]);
        if (partial) svg += rect(actual, annual, 'var(--y3e)');
        const labelV = partial ? annual : actual;
        const ly = labelV >= 0 ? yOf(labelV) - 5 : yOf(labelV) + 12;
        svg += `<text x="${(x + barW / 2).toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" font-size="10.5" fill="#1d2433" font-weight="${y.isBase ? 700 : 500}">${short(labelV)}${partial ? '*' : ''}</text>`;
      });
      svg += `<text x="${(padL + gi * groupW + groupW / 2).toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="12" font-weight="600" fill="#4b5563">${label}</text>`;
    });
    const anyPartial = rows.some(y => y.factor !== 1);
    const legend = rows.map((y, i) => `<span><i style="background:${colors[i]}"></i>${y.year}년${y.factor !== 1 ? ` 실적(${y.months}개월)` : ''}</span>`).join('') + (anyPartial ? `<span><i style="background:var(--y3e)"></i>12개월 환산 추정분</span>` : '');
    return `<div class="chart-wrap"><div class="chart-legend">${legend}</div>
<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="매출·영업이익 연도별 추이">${svg}</svg>
<div class="chart-note">${anyPartial ? '진한 색 실제 실적 · 연한 색 12개월 환산 추정(*)' : '막대 위 숫자는 금액(만원·억원)'}${rows.some(y => y.m.op < 0 || y.m.sales < 0) ? ' · 손실은 기준선 아래' : ''}</div></div>`;
  }

  /* ---------- 비용 구조표 ---------- */
  function costTable(analysis, unit) {
    const c = analysis.cost; const b = analysis.base; const est = b.factor !== 1; const ind = analysis.industry;
    if (!c.hasDetail) return `<p class="tax-note">판관비 세부 항목을 PDF에서 읽지 못해 비용 구조 표를 생략했습니다.</p>`;
    const items = c.items.filter(it => it.curA > 0 || it.prev > 0).slice(0, 5);
    const sgaA = b.a.sga, sgaP = analysis.prev ? analysis.prev.a.sga : null;
    const rows = items.map(it => `<tr><td>${esc(it.label)}${it.focus ? ' <span class="focus">중점</span>' : ''}</td><td>${Fmt.wonUnit(it.curA, unit)}</td>${analysis.prev ? `<td>${Fmt.wonUnit(it.prev, unit)}</td>` : ''}<td>${Fmt.pct(it.share)}</td>${analysis.prev ? `<td class="${it.change > 0 ? 'up' : it.change < 0 ? 'down' : ''}">${Fmt.delta(it.change)}</td>` : ''}</tr>`).join('');
    const etc = sgaA - items.reduce((s, it) => s + it.curA, 0);
    return `<table class="mini"><thead><tr><th>판관비 항목${ind && ind.key && ind.focus.length ? `<small> ${ind.label} 중점 항목 우선</small>` : ''}</th><th>${b.year}년${est ? '(연환산)' : ''}</th>${analysis.prev ? `<th>${analysis.prev.year}년</th>` : ''}<th>매출 대비</th>${analysis.prev ? '<th>증감</th>' : ''}</tr></thead>
<tbody>${rows}${etc > 0.5 ? `<tr><td>기타</td><td>${Fmt.wonUnit(etc, unit)}</td>${analysis.prev ? '<td>-</td>' : ''}<td>${Fmt.pct(etc / Math.abs(b.a.sales || 1) * 100)}</td>${analysis.prev ? '<td>-</td>' : ''}</tr>` : ''}
<tr class="total"><td>판관비 합계</td><td>${Fmt.wonUnit(sgaA, unit)}</td>${analysis.prev ? `<td>${Fmt.wonUnit(sgaP, unit)}</td>` : ''}<td>${Fmt.pct(b.r.sgaRatio)}</td>${analysis.prev ? `<td class="${b.g.sga > 0 ? 'up' : b.g.sga < 0 ? 'down' : ''}">${Fmt.delta(b.g.sga)}</td>` : ''}</tr></tbody></table>
<p class="tax-note">(단위: ${unit === 1000 ? '천원' : '원'})${c.labor.cur > 0 ? ` 인건비 합계 ${Fmt.man(c.labor.cur)}(매출의 ${Fmt.pct(c.labor.share)})` : ''}</p>`;
  }

  function glossary() {
    return `<div class="glossary"><b>용어</b> ${C.glossary.map(([k, v]) => `<span><i>${esc(k)}</i> ${esc(v)}</span>`).join('')}</div>`;
  }

  /* ---------- 1쪽: 경영성과 요약 ---------- */
  function page1(model, pageNo, total) {
    const { analysis, options } = model; const b = analysis.base; const p = analysis.prev; const est = b.factor !== 1; const same = analysis.same;
    const g = k => (p ? b.g[k] : null);
    return `
<section class="page p1">
  ${header(model, '경영성과 요약', 'Ⅰ')}
  <div class="kpis">
    ${kpi('매출액', b, 'sales', 'sales', g('sales'), same, est)}
    ${kpi('영업이익', b, 'op', 'op', g('op'), same, est, { sub: '매출 − 원가 − 판관비' })}
    ${options.showTax ? kpiTax(analysis, est) : kpi('당기순이익', b, 'net', 'net', g('net'), same, est)}
  </div>
  <h3 class="sec">손익계산서 요약 <small>${analysis.rows.length > 1 ? `최근 ${analysis.rows.length}개년` : ''}${est ? ' · 실적과 12개월 환산(추정)' : ''}${same ? ' · 전년 동기' : ''}</small></h3>
  ${plTable(model)}
  <div class="two-col gap">
    <div><h3 class="sec">매출·영업이익 추이</h3>${chart(analysis)}</div>
    <div><h3 class="sec">주요 비용 항목 <small>판관비</small></h3>${costTable(analysis, options.unit || 1)}</div>
  </div>
  ${glossary()}
  ${footer(model, pageNo, total)}
</section>`;
  }

  /* ---------- 2쪽 블록 ---------- */
  /* 담당자 종합 의견 → 문단 단위 '단위' 목록 (쪽이 넘치면 문단 사이에서 다음 쪽으로 이어진다) */
  function opinionUnits(model) {
    const { meta } = model; const cm = meta.comment || {};
    if (!cm.mode || cm.mode === 'none') return [];
    const units = [];
    const pushLines = (head, text) => {
      const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
      lines.forEach((l, i) => units.push({ type: 'op', html: `<div class="op-sec">${i === 0 && head ? `<h4>${head}</h4>` : ''}<p>${esc(l)}</p></div>` }));
    };
    if (cm.mode === 'free') pushLines(null, cm.free);
    else [['종합 의견', cm.overall], ['중점 검토사항', cm.focus], ['향후 관리계획', cm.plan]].forEach(([h, v]) => { if ((v || '').trim()) pushLines(h, v); });
    return units;
  }
  function opinionWrap(model, unitsHtml, cont, last) {
    const { meta } = model;
    return `<div class="opinion"><div class="lbl">담당자 종합 의견${cont ? ' (계속)' : ''}</div>${unitsHtml}${last ? `<div class="sign">${esc(meta.firm)}${meta.preparer ? ` · 담당 ${esc(meta.preparer)}` : ''}</div>` : ''}</div>`;
  }

  function summaryBlock(analysis) {
    const fb = analysis.feedback;
    return `<div class="summary"><div class="lbl">종합 평가</div><p>${esc(fb.summary)}</p>${fb.note ? `<div class="note">※ ${esc(fb.note)}</div>` : ''}</div>`;
  }
  function pointUnits(analysis) {
    return analysis.feedback.points.map(pt => ({ type: 'pt', html: `<li><span class="dot ${pt.tone}"></span><div><b>${esc(pt.title)}</b><p>${esc(pt.body)}</p></div></li>` }));
  }
  const pointsWrap = (unitsHtml, cont) => `<h3 class="sec">주요 경영·세무 진단 포인트${cont ? ' (계속)' : ''}</h3><ul class="points">${unitsHtml}</ul>`;

  /* 세율 구간 띠: 누진 구조 설명 (구간 변경을 이유로 지출을 권하지 않는다) */
  function bracketBox(analysis) {
    const t = analysis.tax; const bk = t.bracket; if (!bk) return '';
    const nm = t.entity === 'indiv' ? '종합소득세' : '법인세';
    const shortAmt = v => v >= 1e8 ? `${(v / 1e8).toFixed(v % 1e8 ? 1 : 0).replace(/\.0$/, '')}억` : `${Math.round(v / 1e4).toLocaleString('ko-KR')}만`;
    const cur = bk.annual, aft = bk.after;
    const segs = bk.list.map((br, i) => {
      const isCur = i === cur.idx, isAft = aft && i === aft.idx && aft.idx !== cur.idx;
      const lower = i > 0 ? bk.list[i - 1].limit : 0;
      return `<div class="seg${isCur ? ' cur' : ''}${isAft ? ' aft' : ''}"><b>${br.rate * 100}%</b><small>${isFinite(br.limit) ? `~${shortAmt(br.limit)}` : `${shortAmt(lower)}~`}</small>${isCur ? '<i>현재</i>' : isAft ? '<i>반영 후</i>' : ''}</div>`;
    }).join('');
    let txt = `과세표준 <b>${Fmt.man(cur.taxBase)}</b> → <b>${cur.rate}% 구간</b>. ${cur.lower > 0 ? `${cur.rate}%는 ${shortAmt(cur.lower)}원을 넘는 금액에만 적용되고 그 아래는 낮은 세율입니다(누진).` : '가장 낮은 세율 구간입니다.'}`;
    if (aft && aft.idx !== cur.idx) txt += ` 추가 비용 반영 후에는 ${aft.rate}% 구간입니다.`;
    return `<div class="bracket"><div class="lbl">${nm} 세율 구간 (${t.tableYear}년 기준 세율표${t.tableExact ? '' : ' 준용'})</div><div class="segs">${segs}</div><p>${txt}</p></div>`;
  }

  function taxNote(t, unit) {
    const nm = t.entity === 'indiv' ? '종합소득세' : '법인세';
    return `<p class="tax-note">(단위: ${unit === 1000 ? '천원' : '원'}) 기본세율 기준 예상 산출세액입니다. 실제 납부세액은 ${t.entity === 'indiv' ? '다른 소득·소득공제, ' : ''}세무조정·공제감면·기납부세액에 따라 달라집니다.</p>`;
  }

  function taxTable(analysis, unit) {
    const t = analysis.tax; const b = analysis.base; const est = b.factor !== 1;
    const nm = t.entity === 'indiv' ? '종합소득세' : '법인세';
    if (t.extra) return taxCompareTable(analysis, unit, nm);
    const r = (label, k, cls) => `<tr class="${cls || ''}"><td>${label}</td><td>${Fmt.wonUnit(t.actual[k], unit)}</td>${est ? `<td>${Fmt.wonUnit(t.annual[k], unit)}</td>` : ''}</tr>`;
    const head = `<thead><tr><th>구분</th><th>실적 ${shortPeriod(b)} 기준</th>${est ? '<th>12개월 환산 기준</th>' : ''}</tr></thead>`;
    const pretaxRow = `<tr><td>세전이익</td><td class="${b.m.pretax < 0 ? 'neg' : ''}">${Fmt.wonUnit(b.m.pretax, unit)}</td>${est ? `<td class="${b.a.pretax < 0 ? 'neg' : ''}">${Fmt.wonUnit(b.a.pretax, unit)}</td>` : ''}</tr>`;
    if (t.noTax) {
      return `<table class="mini">${head}<tbody>${pretaxRow}${r(`${nm} 예상 산출세액`, 'computed')}${r('예상 세액 합계', 'total', 'total')}</tbody></table>
<p class="tax-note">(단위: ${unit === 1000 ? '천원' : '원'}) 세전이익이 없어 올해 ${nm}는 발생하지 않을 것으로 보이며, 손실은 다음 해 이익에서 공제됩니다.</p>`;
    }
    const pending = t.pendingExtras && t.pendingExtras.length ? `<p class="tax-note">검토 중(미반영): ${t.pendingExtras.map(e => `${esc(e.label)} ${Fmt.man(e.amount)}`).join(', ')}</p>` : '';
    return `<table class="mini">${head}<tbody>
${pretaxRow}
${r(`과세표준${t.loss > 0 ? ' (이월결손금 차감)' : ''}`, 'taxBase')}
${r(`${nm} 예상 산출세액 (국세)`, 'computed')}
${t.hasCredit ? r(`(−) ${esc(t.creditLabel)}`, 'creditAmt') : ''}
${t.hasCredit ? r('공제·감면 후 국세', 'national') : ''}
${r('지방소득세 (국세의 10%)', 'local')}
${r('예상 세액 합계 (산출 기준)', 'total', 'total')}
</tbody></table>
${bracketBox(analysis)}
${pending}
${taxNote(t, unit)}`;
  }

  /* 추가 비용 반영 전/후 비교표 */
  function taxCompareTable(analysis, unit, nm) {
    const t = analysis.tax; const x = t.extra; const b = analysis.base;
    const A = t.annual, B = x.after;
    const diff = (a, c, color) => { const d = c - a; return `<td class="${color ? (d < 0 ? 'down' : d > 0 ? 'up' : '') : ''}">${d === 0 ? '-' : (d > 0 ? '+' : '−') + Fmt.wonUnit(Math.abs(d), unit)}</td>`; };
    const r = (label, a, c, cls, color) => `<tr class="${cls || ''}"><td>${label}</td><td class="${a < 0 ? 'neg' : ''}">${Fmt.wonUnit(a, unit)}</td><td class="${c < 0 ? 'neg' : ''}">${Fmt.wonUnit(c, unit)}</td>${diff(a, c, color !== false)}</tr>`;
    const items = x.items.map(it => `<li>${esc(it.label)} <span>지출 ${Fmt.wonUnit(it.amount, unit)} → 인정 예상 <b>${Fmt.wonUnit(it.allowed, unit)}</b></span></li>`).join('');
    const pending = x.pending && x.pending.length ? `<p class="tax-note">검토 중(미반영): ${x.pending.map(e => `${esc(e.label)} ${Fmt.man(e.amount)}`).join(', ')}</p>` : '';
    return `<table class="mini"><thead><tr><th>구분 <small>(연환산 기준)</small></th><th>반영 전</th><th>반영 후</th><th>차이</th></tr></thead><tbody>
${r('세전이익', b.a.pretax, x.pretaxAfter, '', false)}
<tr><td>(−) 추가 비용 인정 예상액</td><td>-</td><td>${Fmt.wonUnit(x.total, unit)}</td><td></td></tr>
${r(`${nm} 예상 산출세액 (국세)`, A.computed, B.computed)}
${t.hasCredit ? r(`(−) ${esc(t.creditLabel)}`, A.creditAmt, B.creditAmt) : ''}
${r('지방소득세 (10%)', A.local, B.local)}
${r('예상 세액 합계 (산출 기준)', A.total, B.total, 'total')}
</tbody></table>
<div class="saving"><div class="lbl">추정 절세 효과</div><div class="big">약 ${Fmt.man(x.saved)} <small>감소 (추정)</small></div><div class="sub">지출 ${Fmt.man(x.spend)} 중 비용 인정 예상 ${Fmt.man(x.total)} 반영 · 세금을 뺀 실제 부담 약 ${Fmt.man(x.netCost)}</div><ul class="items">${items}</ul></div>
${bracketBox(analysis)}
${pending}
<p class="tax-note">(단위: ${unit === 1000 ? '천원' : '원'}) 추정치입니다. 추가 비용은 실제 지출·증빙이 있어야 하며 결산 시 인정 금액이 달라질 수 있습니다.</p>`;
  }

  function planBlock(model) {
    const plan = model.meta.plan || model.analysis.plan;
    const cl = (plan.client || []).filter(it => (it.text || '').trim());
    const of = (plan.office || []).filter(it => (it.text || '').trim());
    if (!cl.length && !of.length) return '';
    return `<div class="plan">
  ${cl.length ? `<div><h4>거래처 확인사항</h4><ol>${cl.map(it => `<li>${esc(it.text)}${it.due ? `<span class="due">${esc(it.due)}</span>` : ''}</li>`).join('')}</ol></div>` : ''}
  ${of.length ? `<div><h4>${esc(model.meta.firm)} 관리계획</h4><ol>${of.map(it => `<li>${esc(it.text)}</li>`).join('')}</ol></div>` : ''}
</div>`;
  }

  /* ---------- 2쪽 단위 목록 ---------- */
  function page2Units(model) {
    const { analysis, options } = model; const unit = options.unit || 1;
    const units = [{ type: 'summary', html: summaryBlock(analysis) }];
    units.push(...opinionUnits(model));
    units.push(...pointUnits(analysis));
    const taxCol = options.showTax ? `<div><h3 class="sec">예상 세액과 계산 근거 <small>${analysis.tax.entity === 'indiv' ? '종합소득세' : '법인세'} + 지방소득세 · 추정</small></h3>${taxTable(analysis, unit)}</div>` : '';
    const planCol = `<div><h3 class="sec">연말까지 확인할 사항 및 향후 관리계획</h3>${planBlock(model)}</div>`;
    units.push({ type: 'taxplan', html: `<div class="two-col${options.showTax ? '' : ' single'}">${taxCol}${planCol}</div>` });
    units.push({ type: 'disc', html: `<div class="disclaimer">보고일 현재 장부 기준 가결산 추정치입니다. 실제 결산·세액은 달라질 수 있으니 중요한 결정 전에는 담당자와 상의해 주세요.</div>` });
    return units;
  }

  /* 한 쪽에 들어갈 단위들을 HTML로: 연속된 의견 문단은 하나의 상자로, 연속된 포인트는 하나의 목록으로 */
  function unitsHtml(model, units, info) {
    info = info || {};
    let out = ''; let i = 0;
    while (i < units.length) {
      const u = units[i];
      if (u.type === 'op' || u.type === 'pt') {
        let j = i; let buf = '';
        while (j < units.length && units[j].type === u.type) { buf += units[j].html; j++; }
        const firstIdx = info.index !== undefined ? info.index + i : null;
        if (u.type === 'op') out += opinionWrap(model, buf, info.opStarted && firstIdx !== info.opFirst, info.opLast !== undefined ? (info.index + j - 1) >= info.opLast : true);
        else out += pointsWrap(buf, info.ptStarted && firstIdx !== info.ptFirst);
        i = j;
      } else { out += u.html; i++; }
    }
    return out;
  }

  function page2Html(model, units, pageNo, total, cont, info) {
    return `<section class="page p2${cont ? ' cont' : ''}">${header(model, `세무 진단 및 향후 관리계획${cont ? ' (계속)' : ''}`, 'Ⅱ')}${unitsHtml(model, units, info)}${footer(model, pageNo, total)}</section>`;
  }

  /** groups: 2쪽 단위를 쪽별로 나눈 배열(app.js 가 높이를 재서 만든다). 없으면 한 쪽에 전부. */
  function compose(model, groups) {
    const o = model.options || {}; const all = page2Units(model);
    if (!groups) groups = [all];
    const total = (o.cover ? 1 : 0) + 1 + groups.length;
    let n = o.cover ? 2 : 1;
    const opIdx = all.map((u, i) => u.type === 'op' ? i : -1).filter(i => i >= 0);
    const ptIdx = all.map((u, i) => u.type === 'pt' ? i : -1).filter(i => i >= 0);
    let html = (o.cover ? cover(model) : '') + page1(model, n, total);
    let idx = 0;
    groups.forEach((g, gi) => {
      const info = { index: idx, opFirst: opIdx[0], opLast: opIdx[opIdx.length - 1], opStarted: opIdx.length && idx > opIdx[0], ptFirst: ptIdx[0], ptStarted: ptIdx.length && idx > ptIdx[0] };
      html += page2Html(model, g, n + 1 + gi, total, gi > 0, info);
      idx += g.length;
    });
    return html;
  }

  function render(container, model, groups) { container.innerHTML = compose(model, groups); }

  window.Report = { render, compose, page2Units, page2Html, periodText, koDate };
})();
