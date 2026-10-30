/* =====================================================================
 *  가결산 리포트 설정값
 *  - 세율표·기본값·업종·비용 유형은 여기만 고치면 됩니다. (다른 js 파일은 손대지 않아도 됨)
 * ===================================================================== */
window.CONFIG = {
  // 표지·문서 기본값
  firmName: '편한세무회계',
  reportTitle: '가결산 보고서',
  reportTitleOptions: ['가결산 보고서', '중간결산 보고서', '경영성과 보고서'],
  footnote: '본 보고서는 보고일 현재의 결산내역을 기초로 작성되었습니다.',
  coverDefault: true,                 // 표지 포함 기본값 (직원이 체크를 바꾸면 그 브라우저에 기억됨)
  // 접속 암호 (인터넷에 올렸을 때 외부인이 쓰지 못하게). 빈칸이면 암호 없음.
  accessCode: '',

  /* ---------- 세율표 (귀속연도별) ----------
   * 과세표준 상한(limit), 세율(rate), 누진공제(deduction). 보고서의 기준연도에 맞는 표를 자동으로 고릅니다
   * (해당 연도가 없으면 그보다 작은 가장 가까운 연도). 세법 개정 시 연도를 추가하세요.
   * 2026: 소득세법 §55 기본세율(2023~ 동일), 법인세 2026.1.1 이후 개시 사업연도부터 전 구간 1%p 인상(2025.12 개정)
   * 2025: 법인세 9/19/21/24%
   */
  taxTables: {
    2025: {
      individual: [
        { limit: 14000000,    rate: 0.06, deduction: 0 },
        { limit: 50000000,    rate: 0.15, deduction: 1260000 },
        { limit: 88000000,    rate: 0.24, deduction: 5760000 },
        { limit: 150000000,   rate: 0.35, deduction: 15440000 },
        { limit: 300000000,   rate: 0.38, deduction: 19940000 },
        { limit: 500000000,   rate: 0.40, deduction: 25940000 },
        { limit: 1000000000,  rate: 0.42, deduction: 35940000 },
        { limit: Infinity,    rate: 0.45, deduction: 65940000 },
      ],
      corporate: [
        { limit: 200000000,      rate: 0.09, deduction: 0 },
        { limit: 20000000000,    rate: 0.19, deduction: 20000000 },
        { limit: 300000000000,   rate: 0.21, deduction: 420000000 },
        { limit: Infinity,       rate: 0.24, deduction: 9420000000 },
      ],
    },
    2026: {
      individual: [
        { limit: 14000000,    rate: 0.06, deduction: 0 },
        { limit: 50000000,    rate: 0.15, deduction: 1260000 },
        { limit: 88000000,    rate: 0.24, deduction: 5760000 },
        { limit: 150000000,   rate: 0.35, deduction: 15440000 },
        { limit: 300000000,   rate: 0.38, deduction: 19940000 },
        { limit: 500000000,   rate: 0.40, deduction: 25940000 },
        { limit: 1000000000,  rate: 0.42, deduction: 35940000 },
        { limit: Infinity,    rate: 0.45, deduction: 65940000 },
      ],
      corporate: [
        { limit: 200000000,      rate: 0.10, deduction: 0 },
        { limit: 20000000000,    rate: 0.20, deduction: 20000000 },
        { limit: 300000000000,   rate: 0.22, deduction: 420000000 },
        { limit: Infinity,       rate: 0.25, deduction: 9420000000 },
      ],
    },
  },
  individualBasicDeduction: 1500000, // 개인 기본공제(본인) — 단순 추정용
  localTaxRate: 0.10,                // 지방소득세 = 소득세·법인세 산출세액의 10%
  defaultEntity: 'indiv',            // 기본 사업자 구분: 'indiv'(개인) | 'corp'(법인). PDF에 '법인세' 항목이 있으면 법인으로 자동 전환

  // 공제·감면 항목. mode: 'rate' = 산출세액의 %  /  'amount' = 금액(원)  /  'both' = 둘 다 입력
  creditTypes: [
    { key: 'none',    label: '없음',               mode: 'none' },
    { key: 'startup', label: '창업중소기업 세액감면', mode: 'rate',   rates: [50, 75, 100], hint: '청년창업·지역에 따라 50~100% (요건 확인 필요)' },
    { key: 'sme',     label: '중소기업특별세액감면', mode: 'rate',   rates: [5, 10, 15, 20, 30], hint: '업종·지역·규모별 5~30%' },
    { key: 'employ',  label: '고용증대(통합고용)세액공제', mode: 'amount', hint: '증가 인원 × 1인당 공제액(원)을 계산해 입력' },
    { key: 'other',   label: '기타 (직접 입력)',    mode: 'both',   hint: '감면율(%)과 공제액(원)을 직접 입력' },
  ],

  /* ---------- 업종 (분석에서 중점적으로 볼 비용 항목) ----------
   * focus: 비용 구조 표에서 먼저 보여줄 계정명 키워드(공백 제거한 계정명에 포함되면 해당). 업종을 고르지 않아도 보고서는 정상 생성됩니다.
   */
  industries: [
    { key: '',             label: '선택 안 함',          focus: [] },
    { key: 'service',      label: '일반 서비스업',        focus: ['급여', '임차료', '광고선전비', '지급수수료', '수수료'], note: '인건비·임차료 등 고정비와 매출의 균형' },
    { key: 'retail',       label: '도소매·온라인 쇼핑몰', focus: ['광고선전비', '지급수수료', '수수료', '운반비', '포장비', '판매수수료'], cogs: true, note: '매출원가율과 광고·판매수수료·물류비' },
    { key: 'food',         label: '음식점업',            focus: ['급여', '임차료', '수도광열비', '소모품비', '잡급'], cogs: true, note: '식재료 원가율과 인건비·임차료' },
    { key: 'manufacturing', label: '제조업',             focus: ['급여', '감가상각비', '수도광열비', '외주가공비', '수선비'], cogs: true, note: '매출원가율·인건비·설비 투자' },
    { key: 'professional', label: '전문직',              focus: ['급여', '임차료', '접대비', '기업업무추진비', '교육훈련비'], note: '인건비·임차료와 기업업무추진비 증빙' },
    { key: 'other',        label: '기타',               focus: [] },
  ],

  /* ---------- 추가 비용 시뮬레이션: 지출 유형 ----------
   * allow: 지출액 중 당해 연도 비용으로 인정될 예상 비율(기본값, 담당자가 금액을 직접 고칠 수 있음)
   * indivOnly: 개인사업자일 때만 적용되는 규칙
   */
  extraTypes: [
    { key: 'expense', label: '일반 경비',              allow: 1.0, note: '당해 연도 비용으로 전액 반영' },
    { key: 'asset',   label: '비품·차량 등 자산 구입',   allow: 0.2, note: '감가상각 대상: 취득가 전액이 아니라 당해 연도 상각분만 비용(기본 20%, 내용연수·월할에 따라 다름)' },
    { key: 'owner',   label: '대표자 본인 급여',        allow: 0,   allowCorp: 1.0, note: '개인사업자의 본인 급여는 필요경비로 인정되지 않음 (법인 대표이사 급여는 손금 가능)' },
    { key: 'retire',  label: '퇴직연금·퇴직급여',       allow: 1.0, note: '납입액 한도 내 인정 (한도 확인 필요)' },
    { key: 'family',  label: '가족 급여·기타 검토 필요', allow: 0,   note: '실제 근무·지급 사실 확인 후 반영' },
  ],

  // 용어 설명 (보고서 하단 한 줄)
  glossary: [
    ['영업이익', '매출에서 매출원가와 판매비·관리비를 뺀 이익'],
    ['연환산', '현재까지의 실적을 12개월로 늘려 추정한 값'],
    ['과세표준', '세율을 곱하는 기준 금액'],
    ['산출세액', '세율표로 계산한 세금(공제·감면 전)'],
  ],

  // 판관비 중 '인건비'로 묶어서 볼 계정 (공백 제거한 계정명에 포함되면 인건비)
  laborKeywords: ['급여', '급료', '임금', '상여', '잡급', '퇴직급여', '퇴직연금', '인건비', '급여수당', '일용급여'],
  // 금융비용으로 볼 계정
  interestKeywords: ['이자비용', '지급이자', '이자'],
  // 기업업무추진비(접대비)로 볼 계정
  entertainKeywords: ['접대비', '기업업무추진비'],

  // 진단 기준 (비율은 %)
  thresholds: {
    growthFlat: 3,          // ±3% 이내면 '비슷한 수준'
    opMarginLow: 5,         // 영업이익률 5% 미만 '낮음'
    opMarginGood: 15,       // 15% 이상 '양호'
    itemSurgePct: 30,       // 비용 항목 전년 대비 30% 이상 증가면 언급
    itemMinShare: 3,        // 매출 대비 3% 이상인 항목만 언급
    laborRatioHigh: 40,     // 인건비/매출 40% 이상이면 언급
    adRatioHigh: 15,        // 광고선전비/매출 15% 이상이면 언급(도소매·쇼핑몰)
  },
};
