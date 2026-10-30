/* =====================================================================
 *  app.js — 화면 동작 (업로드 · 설정 · 검증 · 시뮬레이션 · 세무사 의견 · 실행계획 · 미리보기 · PDF 저장)
 * ===================================================================== */
(function () {
  'use strict';
  const C = window.CONFIG; const A = window.Analysis; const { Fmt, MAJOR_KEYS, MAJOR_LABEL } = A;
  const $ = id => document.getElementById(id);
  const DERIVED = ['gross', 'op', 'pretax', 'net'];
  const newExtra = () => ({ label: '', type: 'expense', amount: 0, allowed: null, status: 'review' });

  const state = {
    files: [],          // {name, stmt, error}
    manual: {},         // {year: {m:{}, months}}
    edits: {},          // {year: {key: value}}  사용자가 손으로 고친 값
    analysis: null, years: [], samePeriod: null,
    warnings: [], issues: [],
    extras: [newExtra(), newExtra(), newExtra()],   // 추가 비용 시뮬레이션
    planEdit: { client: null, office: null },        // null = 자동 생성 사용
  };

  /* ---------- 유틸 ---------- */
  function toast(msg, ms) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms || 2400); }
  const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const isoToKo = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return `${y}년 ${m}월 ${d}일`; };
  const pref = { get(k, d) { try { return localStorage.getItem('gr_' + k) ?? d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('gr_' + k, v); } catch (e) { /* ignore */ } } };
  const num = s => parseInt(String(s).replace(/[^\d-]/g, ''), 10);
  const fmtIn = v => (v || v === 0) && !isNaN(v) ? Number(v).toLocaleString('ko-KR') : '';
  const escA = s => String(s || '').replace(/"/g, '&quot;');

  /* ---------- 파일 처리 ---------- */
  async function addFiles(fileList) {
    const files = Array.from(fileList).filter(f => /\.pdf$/i.test(f.name));
    if (!files.length) { toast('PDF 파일만 올릴 수 있습니다.'); return; }
    setBusy(true);
    for (const f of files) {
      if (state.files.some(x => x.name === f.name)) { toast(`'${f.name}' 은 이미 올라가 있습니다.`); continue; }
      try {
        const buf = await f.arrayBuffer();
        const stmt = await window.Parser.parsePdf(buf, f.name);
        if (!stmt.periods.length) throw new Error('손익계산서 항목을 찾지 못했습니다. 텍스트가 없는 스캔본이거나 양식이 다를 수 있습니다.');
        state.files.push({ name: f.name, stmt });
        afterParse(stmt);
      } catch (e) { console.error(e); state.files.push({ name: f.name, error: e.message || String(e) }); }
    }
    setBusy(false); recompute();
  }
  function afterParse(stmt) {
    if (!$('company').value && stmt.company) $('company').value = stmt.company;
    if (!state._entitySet && stmt.entityType === 'corp') $('entity').value = 'corp';
  }
  async function loadFromUrl(url) {
    try {
      setBusy(true);
      const res = await fetch(url); if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
      const buf = await res.arrayBuffer(); const name = decodeURIComponent(url.split('/').pop());
      const stmt = await window.Parser.parsePdf(buf, name);
      state.files.push({ name, stmt }); afterParse(stmt);
    } catch (e) { console.error(e); toast('불러오기 실패: ' + e.message); }
    setBusy(false); recompute();
  }
  function removeFile(i) { state.files.splice(i, 1); recompute(); }
  function setBusy(on) { $('busy').style.display = on ? 'inline-block' : 'none'; }

  /* ---------- 계산 ---------- */
  function recompute() {
    const stmts = state.files.filter(f => f.stmt).map(f => f.stmt);
    const merged = A.mergeStatements(stmts, state.manual);
    state.warnings = merged.warnings.slice();
    // 손으로 고친 값 반영 → 구성항목이 바뀌면 합계 재계산(합계를 직접 고친 경우는 그대로)
    for (const y of merged.years) {
      const ed = state.edits[y.year]; if (!ed) continue;
      const keys = Object.keys(ed);
      for (const k of keys) { y.m[k] = ed[k]; y.found[k] = true; }
      for (const t of DERIVED) if (!keys.includes(t)) y.m[t] = A.TOTAL_CALC[t](y.m);
    }
    state.years = merged.years; state.samePeriod = merged.samePeriod;
    state.issues = A.validate(state.years);   // 수정값 반영 후 다시 검증
    if (!state.years.length) { state.analysis = null; renderAll(); return; }
    state.analysis = A.analyze(state.years, {
      entityType: $('entity').value, industry: $('industry').value, samePeriod: state.samePeriod,
      reportDate: $('date').value ? new Date($('date').value + 'T00:00:00') : new Date(),
      ...readCredit(),
      lossCarry: num($('loss').value) || 0,
      extras: state.extras.filter(e => e.amount > 0),
    });
    renderAll();
  }
  /* ---------- 화면: 파일·경고 ---------- */
  function renderFiles() {
    const ul = $('files'); ul.innerHTML = '';
    state.files.forEach((f, i) => {
      const li = document.createElement('li');
      if (f.error) { li.className = 'err'; li.innerHTML = `<span class="nm" title="${escA(f.name)}">${f.name}</span><span class="tag">읽기 실패</span><button class="x" title="제거">×</button><div style="flex-basis:100%;font-size:11.5px;color:#8a3f12">${f.error}</div>`; }
      else {
        const tags = f.stmt.periods.map(p => { const empty = p.items.every(it => !it.value); return `<span class="tag" style="${empty ? 'opacity:.55' : ''}">${p.year}년 ${p.months}개월${p.kind === 'prev' ? '(전기)' : ''}${empty ? ' · 비어 있어 제외' : ''}</span>`; }).join('');
        li.innerHTML = `<span class="nm" title="${escA(f.name)}">${f.name}</span>${tags}<button class="x" title="제거">×</button>`;
      }
      li.querySelector('.x').onclick = () => removeFile(i);
      ul.appendChild(li);
    });
    if (state.samePeriod) { const li = document.createElement('li'); li.innerHTML = `<span class="nm">전년 동기 자료 인식: ${state.samePeriod.year}년 ${state.samePeriod.months}개월</span><span class="tag">전년 동기 비교 표시</span>`; ul.appendChild(li); }
  }
  function renderWarnings() {
    const w = $('warnings');
    const lines = state.issues.map(i => `<div class="${i.level}">${i.level === 'error' ? '⚠' : '•'} ${i.text}</div>`).concat(state.warnings.map(s => `<div>• ${s}</div>`));
    w.innerHTML = lines.join('');
  }

  /* ---------- 화면: 읽어낸 숫자 ---------- */
  function renderData() {
    const box = $('datatbl'); const ys = state.years;
    if (!ys.length) { box.innerHTML = '<p class="hint">PDF를 올리면 읽어낸 숫자가 여기에 표시됩니다. 틀린 값은 직접 고칠 수 있습니다.</p>'; $('details').innerHTML = ''; return; }
    const head = `<tr><th>항목</th>${ys.map(y => `<th>${y.year}년<br><small>${y.months}개월 · ${y.source === 'manual' ? '직접입력' : y.source === 'prev' ? '전기열' : '당기열'}</small></th>`).join('')}</tr>`;
    const totalKeys = ['sales', 'gross', 'op', 'pretax', 'net'];
    const body = MAJOR_KEYS.map(k => `<tr class="${totalKeys.includes(k) ? 'total' : ''}"><td class="lbl ${totalKeys.includes(k) ? '' : 'sub'}">${MAJOR_LABEL[k]}</td>` +
      ys.map(y => {
        const ed = state.edits[y.year] && state.edits[y.year][k] !== undefined;
        const found = y.found && y.found[k];
        let cls = ed ? 'edited' : (!found ? (DERIVED.includes(k) ? 'derived' : 'missing') : '');
        const title = ed ? '손으로 고친 값' : !found ? (DERIVED.includes(k) ? '계산한 값(PDF에 없음)' : 'PDF에서 못 읽음 — 0으로 계산 중') : '';
        return `<td><input data-year="${y.year}" data-key="${k}" class="${cls}" title="${title}" value="${found || ed || DERIVED.includes(k) ? Fmt.won(y.m[k]) : ''}" placeholder="${!found && !DERIVED.includes(k) ? '미인식' : ''}"></td>`;
      }).join('') + '</tr>').join('');
    const monthsRow = `<tr><td class="lbl">실적 개월 수</td>${ys.map(y => `<td><input data-year="${y.year}" data-months="1" value="${y.months}" style="width:60px"></td>`).join('')}</tr>`;
    box.innerHTML = `<table class="datatbl"><thead>${head}</thead><tbody>${body}${monthsRow}</tbody></table>`;
    box.querySelectorAll('input[data-key]').forEach(inp => inp.onchange = () => {
      const yr = inp.dataset.year, k = inp.dataset.key; const v = num(inp.value);
      if (isNaN(v)) { recompute(); return; }
      state.edits[yr] = state.edits[yr] || {}; state.edits[yr][k] = v; recompute();
    });
    box.querySelectorAll('input[data-months]').forEach(inp => inp.onchange = () => {
      const yr = +inp.dataset.year; const mo = parseInt(inp.value, 10);
      if (!(mo >= 1 && mo <= 12)) { toast('개월 수는 1~12 사이여야 합니다.'); recompute(); return; }
      const y = state.years.find(x => x.year === yr);
      if (y && y.source !== 'manual') { for (const f of state.files) if (f.stmt) for (const p of f.stmt.periods) if (p.year === yr) p.months = mo; }
      else { state.manual[yr] = state.manual[yr] || { m: {} }; state.manual[yr].months = mo; }
      recompute();
    });
    const det = $('details'); det.innerHTML = '';
    for (const y of ys) {
      const list = y.details.sga || []; if (!list.length) continue;
      const d = document.createElement('details'); d.className = 'detail-box';
      d.innerHTML = `<summary>${y.year}년 판관비 세부 ${list.length}개 항목</summary><div class="detail-list">${list.map(it => `<div><span>${it.label}</span><span>${Fmt.won(it.value)}</span></div>`).join('')}</div>`;
      det.appendChild(d);
    }
  }

  /* ---------- 화면: 추가 비용 시뮬레이션 ---------- */
  function renderExtras() {
    const tbl = $('extras'); const entity = $('entity').value;
    const typeOpts = sel => C.extraTypes.map(t => `<option value="${t.key}"${t.key === sel ? ' selected' : ''}>${t.label}</option>`).join('');
    const rows = state.extras.map((e, i) => {
      const n = A.normalizeExtra(e, entity);
      return `<div class="xitem">
<div class="r1"><input class="lbl" data-i="${i}" data-f="label" value="${escA(e.label)}" placeholder="항목 (예: 비품 구입)"><select data-i="${i}" data-f="type" title="${escA(n.note)}">${typeOpts(e.type)}</select><select data-i="${i}" data-f="status" class="st ${e.status}"><option value="review"${e.status !== 'done' ? ' selected' : ''}>검토 필요</option><option value="done"${e.status === 'done' ? ' selected' : ''}>검토 완료</option></select><button class="x" data-i="${i}" title="삭제">×</button></div>
<div class="r2"><label>지출 예정액 <input class="amt" data-i="${i}" data-f="amount" value="${fmtIn(e.amount)}" placeholder="0"></label><label>비용 인정 예상액 <input class="amt${n.autoAllowed ? ' auto' : ''}" data-i="${i}" data-f="allowed" value="${e.amount ? fmtIn(n.allowed) : ''}" placeholder="0" title="${n.autoAllowed ? `자동(지출액의 ${Math.round(n.defaultRate * 100)}%)` : '직접 입력'}"></label></div>
${e.amount && n.note ? `<div class="r3">${escA(n.note)}</div>` : ''}
</div>`;
    }).join('');
    tbl.innerHTML = rows;
    tbl.querySelectorAll('input, select').forEach(el => el.onchange = () => {
      const e = state.extras[+el.dataset.i]; const f = el.dataset.f;
      if (f === 'label') e.label = el.value.trim();
      else if (f === 'type') { e.type = el.value; e.allowed = null; }
      else if (f === 'amount') { e.amount = num(el.value) || 0; if (e.allowed !== null && e.allowed > e.amount) e.allowed = e.amount; }
      else if (f === 'allowed') { const v = num(el.value); e.allowed = isNaN(v) ? null : Math.min(v, e.amount); }
      else if (f === 'status') e.status = el.value;
      recompute();
    });
    tbl.querySelectorAll('button.x').forEach(b => b.onclick = () => { state.extras.splice(+b.dataset.i, 1); if (!state.extras.length) state.extras.push(newExtra()); recompute(); });
    const t = state.analysis && state.analysis.tax;
    const applied = t ? t.allExtras.filter(e => e.status === 'done') : [];
    const pending = t ? t.pendingExtras : [];
    $('extraTotal').innerHTML = t ? `검토 완료 ${applied.length}건 · 인정 예상액 합계 <b>${Fmt.won(applied.reduce((s, e) => s + e.allowed, 0))}</b> 원 반영${pending.length ? ` · 검토 필요 ${pending.length}건 미반영` : ''}` : '';
    $('extraSaved').textContent = t && t.extra ? Fmt.won(t.extra.saved) : '0';
    const bk = t && t.bracket;
    $('bracketInfo').innerHTML = bk ? `현재 세율 구간 <b>${bk.annual.rate}%</b> (연환산 과세표준 ${Fmt.man(bk.annual.taxBase)}) · 구간 상한까지 ${bk.annual.room !== null ? Fmt.man(bk.annual.room) : '-'}${bk.after && bk.after.idx !== bk.annual.idx ? ` · 추가 비용 반영 후 <b>${bk.after.rate}%</b> 구간` : ''} · ${t.tableYear}년 세율표` : (t ? '과세표준 없음(결손) — 세금 관련 문구는 보고서에서 생략됩니다' : '');
  }

  /* ---------- 공제·감면 선택 ---------- */
  function creditDef() { return C.creditTypes.find(t => t.key === $('creditType').value) || C.creditTypes[0]; }
  function readCredit() {
    const t = creditDef(); let rate = 0, amount = 0;
    if (t.mode === 'rate') rate = parseFloat($('creditRate').value) || 0;
    if (t.mode === 'both') rate = parseFloat($('creditRateFree').value) || 0;
    if (t.mode === 'amount' || t.mode === 'both') amount = num($('creditAmt').value) || 0;
    return { creditType: t.key, creditLabel: t.label, creditRate: rate, creditAmount: amount };
  }
  function syncCreditUI() {
    const t = creditDef();
    $('creditRateWrap').style.display = (t.mode === 'rate' || t.mode === 'both') ? '' : 'none';
    $('creditAmtWrap').style.display = (t.mode === 'amount' || t.mode === 'both') ? '' : 'none';
    $('creditRate').style.display = t.mode === 'rate' ? '' : 'none';
    $('creditRateFree').style.display = t.mode === 'both' ? '' : 'none';
    if (t.mode === 'rate') { const sel = $('creditRate'); const cur = sel.value; sel.innerHTML = ''; t.rates.forEach(r => { const o = document.createElement('option'); o.value = r; o.textContent = r + '%'; sel.appendChild(o); }); sel.value = t.rates.includes(+cur) ? cur : t.rates[0]; }
    $('creditHint').textContent = t.hint || '';
  }

  /* ---------- 실행계획 편집 (자동 생성 → 담당자 수정) ---------- */
  const planToText = list => list.map(it => it.due ? `${it.text} | ${it.due}` : it.text).join('\n');
  const textToPlan = txt => txt.split('\n').map(s => s.trim()).filter(Boolean).map(s => { const i = s.lastIndexOf('|'); return i > 0 ? { text: s.slice(0, i).trim(), due: s.slice(i + 1).trim() } : { text: s }; });
  function renderPlan() {
    const auto = state.analysis ? state.analysis.plan : { client: [], office: [] };
    for (const who of ['client', 'office']) {
      const ta = $(who === 'client' ? 'planClient' : 'planOffice');
      const edited = state.planEdit[who] !== null;
      if (!edited && document.activeElement !== ta) ta.value = planToText(auto[who]);
      ta.classList.toggle('edited', edited);
    }
  }
  function currentPlan() {
    const auto = state.analysis.plan;
    return { client: state.planEdit.client !== null ? textToPlan(state.planEdit.client) : auto.client, office: state.planEdit.office !== null ? textToPlan(state.planEdit.office) : auto.office };
  }

  /* ---------- 보고서 ---------- */
  function readComment() {
    const mode = $('commentMode').value;
    return { mode, overall: $('cmOverall').value, focus: $('cmFocus').value, plan: $('cmPlan').value, free: $('cmFree').value };
  }
  function syncCommentUI() {
    const mode = $('commentMode').value;
    $('cmStructured').style.display = mode === 'structured' ? '' : 'none';
    $('cmFreeWrap').style.display = mode === 'free' ? '' : 'none';
  }
  function buildModel() {
    const meta = {
      title: $('title').value || C.reportTitle, company: $('company').value.trim(),
      firm: $('firm').value.trim() || C.firmName, preparer: $('preparer').value.trim(),
      dateText: isoToKo($('date').value || todayISO()), footnote: C.footnote,
      comment: readComment(), plan: currentPlan(),
    };
    const options = { unit: +$('unit').value || 1, showTax: $('showTax').checked, cover: $('cover').checked };
    return { meta, analysis: state.analysis, options };
  }
  function renderReport() {
    const rep = $('report'); const btn = $('btnPrint');
    if (!state.analysis) { rep.innerHTML = '<div class="empty"><b>왼쪽에 손익계산서 PDF를 올리면</b><br>경영성과 요약 · 세무 진단 및 관리계획 2장짜리 보고서가 여기에 만들어집니다.<br><small>표지가 필요하면 "표지 포함"을 체크하세요.</small></div>'; btn.disabled = true; $('pageInfo').textContent = ''; return; }
    $('preparer').classList.toggle('req-missing', !$('preparer').value.trim());
    const model = buildModel();
    state.layoutOverflow = false;
    fitPages(rep, model);
    $('layoutWarn').textContent = state.layoutOverflow ? '⚠ 한 문단이 A4 한 쪽보다 길어 잘립니다. 문단을 나눠(줄바꿈) 주세요.' : '';
    btn.disabled = false;
    const n = rep.querySelectorAll('.page').length;
    $('pageInfo').textContent = `A4 ${n}장`;
    console.info(`REPORT_READY pages=${n} years=${state.years.map(y => y.year).join(',')}`);
  }
  /* 쪽 맞춤: 2쪽 단위(문단·포인트·표)를 높이를 재 가며 차례로 채운다. 넘치면 다음 쪽으로 — 장수 제한 없음. */
  function paginate(rep, model) {
    const units = window.Report.page2Units(model);
    const probe = document.createElement('div'); probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;'; rep.appendChild(probe);
    const fits = (group) => { probe.innerHTML = window.Report.page2Html(model, group, 1, 1, false, {}); const pg = probe.firstElementChild; return pg.scrollHeight <= pg.clientHeight + 1; };
    const groups = []; let cur = [];
    for (const u of units) {
      if (cur.length && !fits(cur.concat(u))) { groups.push(cur); cur = []; }
      cur.push(u);
    }
    if (cur.length) groups.push(cur);
    probe.remove();
    return groups;
  }
  function fitPages(rep, model) {
    const groups = paginate(rep, model);
    window.Report.render(rep, model, groups);
    const over = p => p.scrollHeight > p.clientHeight + 1;
    const pages = [...rep.querySelectorAll('.page')];
    pages.forEach(p => { if (over(p)) p.classList.add('compact'); });
    state.layoutOverflow = pages.some(over);
    if (state.layoutOverflow) console.warn('A4 한 장을 넘치는 페이지가 있습니다.');
  }

  function renderAll() { renderFiles(); renderWarnings(); renderData(); renderExtras(); renderPlan(); renderReport(); }

  /* ---------- PDF 저장(인쇄): 출력 전 최종 확인 ---------- */
  function printReport() {
    if (!state.analysis) return;
    if (!$('preparer').value.trim()) { toast('담당자 이름을 입력해 주세요 (필수).', 3000); $('preparer').classList.add('req-missing'); $('preparer').focus(); return; }
    const b = state.analysis.base; const t = state.analysis.tax;
    const errs = state.issues.filter(i => i.level === 'error'); const warns = state.issues.filter(i => i.level === 'warn');
    const lines = [
      `회사명: ${$('company').value.trim() || '(미입력)'}`,
      `기준기간: ${window.Report.periodText(b)}${b.factor !== 1 ? ' → 12개월 환산' : ''}`,
      `사업자 구분: ${t.entity === 'indiv' ? '개인(종합소득세)' : '법인(법인세)'} · 업종: ${$('industry').selectedOptions[0].textContent}`,
      `공제·감면: ${t.hasCredit ? t.creditLabel : '없음'} · 추가 비용 반영: ${t.extra ? Fmt.man(t.extra.total) : '없음'}${t.pendingExtras.length ? ` (검토 필요 ${t.pendingExtras.length}건 미반영)` : ''}`,
      `담당자: ${$('preparer').value.trim()} · 담당자 의견: ${$('commentMode').value === 'none' ? '없음' : '포함'} · 출력: A4 ${$('report').querySelectorAll('.page').length}장`,
    ];
    if (state.layoutOverflow) lines.push('', '⚠ 한 문단이 A4 한 쪽보다 길어 잘립니다.');
    if (errs.length) lines.push('', '⚠ 데이터 오류 (확인 후 출력 권장):', ...errs.map(i => ' - ' + i.text));
    if (warns.length) lines.push('', '주의:', ...warns.map(i => ' - ' + i.text));
    lines.push('', '이 내용으로 PDF를 만들까요?');
    if (!confirm(lines.join('\n'))) return;
    const prev = document.title;
    const safe = ($('company').value || '회사').replace(/[\\/:*?"<>|]/g, '').trim();
    document.title = `${safe}_${b.year}년 ${$('title').value || C.reportTitle}`;
    const restore = () => { document.title = prev; window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore);
    window.print();
    setTimeout(restore, 4000);
  }

  /* ---------- 초기화 ---------- */
  function init() {
    if (C.accessCode) {
      let ok = pref.get('access', '') === C.accessCode;
      while (!ok) { const v = prompt('접속 암호를 입력하세요'); if (v === null) { document.body.innerHTML = '<p style="padding:40px;text-align:center;color:#555">접속 암호가 필요합니다. 새로고침 후 다시 시도하세요.</p>'; return; } ok = v === C.accessCode; }
      pref.set('access', C.accessCode);
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const sel = $('title'); C.reportTitleOptions.forEach(t => { const o = document.createElement('option'); o.value = o.textContent = t; sel.appendChild(o); });
    sel.value = pref.get('title', C.reportTitle);
    const ind = $('industry'); C.industries.forEach(i => { const o = document.createElement('option'); o.value = i.key; o.textContent = i.label; ind.appendChild(o); });
    $('firm').value = pref.get('firm', C.firmName);
    $('preparer').value = pref.get('preparer', '');
    $('date').value = todayISO();
    $('unit').value = pref.get('unit', '1');
    $('cover').checked = pref.get('cover', C.coverDefault ? '1' : '0') === '1';

    const drop = $('drop'), input = $('fileInput');
    drop.onclick = () => input.click();
    input.onchange = () => { addFiles(input.files); input.value = ''; };
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => addFiles(e.dataTransfer.files));
    document.addEventListener('dragover', e => e.preventDefault()); document.addEventListener('drop', e => e.preventDefault());

    ['title', 'company', 'firm', 'preparer', 'unit', 'showTax'].forEach(id => $(id).addEventListener('input', () => { pref.set(id, $(id).value); renderReport(); }));
    $('date').addEventListener('input', recompute);
    $('cover').addEventListener('change', () => { pref.set('cover', $('cover').checked ? '1' : '0'); renderReport(); });
    ['cmOverall', 'cmFocus', 'cmPlan', 'cmFree'].forEach(id => $(id).addEventListener('input', renderReport));
    $('commentMode').addEventListener('change', () => { syncCommentUI(); renderReport(); });
    syncCommentUI();
    $('planClient').addEventListener('input', () => { state.planEdit.client = $('planClient').value; renderPlan(); renderReport(); });
    $('planOffice').addEventListener('input', () => { state.planEdit.office = $('planOffice').value; renderPlan(); renderReport(); });
    $('planResetClient').onclick = () => { state.planEdit.client = null; renderPlan(); renderReport(); };
    $('planResetOffice').onclick = () => { state.planEdit.office = null; renderPlan(); renderReport(); };

    $('entity').value = C.defaultEntity || 'indiv';
    const ct = $('creditType'); C.creditTypes.forEach(t => { const o = document.createElement('option'); o.value = t.key; o.textContent = t.label; ct.appendChild(o); });
    syncCreditUI();
    ct.addEventListener('change', () => { syncCreditUI(); recompute(); });
    ['entity', 'industry', 'creditRate', 'creditRateFree', 'creditAmt', 'loss'].forEach(id => $(id).addEventListener('input', () => { if (id === 'entity') state._entitySet = true; recompute(); }));
    $('creditAmt').addEventListener('change', () => { const v = num($('creditAmt').value); $('creditAmt').value = v ? v.toLocaleString('ko-KR') : ''; });
    $('btnPrint').onclick = printReport;
    $('btnAddYear').onclick = () => {
      const yr = parseInt(prompt('추가할 연도를 입력하세요 (예: 2024)'), 10);
      if (!(yr > 2000 && yr < 2100)) return;
      if (state.years.some(y => y.year === yr)) { toast('이미 있는 연도입니다. 아래 표에서 값을 고치세요.'); return; }
      state.manual[yr] = { m: { sales: 0, cogs: 0, sga: 0, nonOpInc: 0, nonOpExp: 0, tax: 0 }, months: 12 };
      recompute(); toast(`${yr}년 열을 추가했습니다. 아래 표에 금액을 입력하세요.`);
    };
    $('btnAddExtra').onclick = () => { state.extras.push(newExtra()); renderExtras(); const ins = $('extras').querySelectorAll('input.lbl'); if (ins.length) ins[ins.length - 1].focus(); };
    $('btnReset').onclick = () => {
      if (!confirm('올린 파일과 수정한 값을 모두 지울까요?')) return;
      state.files = []; state.manual = {}; state.edits = {}; state._entitySet = false; state.extras = [newExtra(), newExtra(), newExtra()]; state.planEdit = { client: null, office: null };
      $('company').value = ''; ['cmOverall', 'cmFocus', 'cmPlan', 'cmFree'].forEach(id => $(id).value = ''); $('commentMode').value = 'structured'; syncCommentUI();
      $('entity').value = C.defaultEntity || 'indiv'; $('industry').value = ''; recompute();
    };

    renderAll();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (state.analysis) renderReport(); }); // 글꼴 로드 후 쪽 나누기 재판정
    const q = new URLSearchParams(location.search).get('load');
    if (q) q.split(',').forEach(u => loadFromUrl(u));
  }

  window.addEventListener('error', e => console.error('APP_ERROR', e.message));
  document.addEventListener('DOMContentLoaded', init);
})();
