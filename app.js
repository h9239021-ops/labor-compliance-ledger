
/* ===================== 근로감독 리스크 관리대장 ===================== */
(function(){
  "use strict";

  var TITLE = "근로감독 리스크 관리대장";
  var DRAFT_KEY = "hrSelfCheckDraft_v1";
  var UI_STATE_KEY = "hrUiState_v1";

  var state = null;
  var editMode = false;
  var editorName = "";
  var activeTab = "dashboard";
  var findingsFilter = { severity: "all", status: "all" };
  var inspectionViewMode = "byCategory"; // "byCategory" | "byRound"
  var selectedRoundId = null;
  var pendingHighlightId = null;
  var draftAnswers = {};

  /* ---------- 근로감독 안내 tab: static reference data (근로감독관집무규정 등) ---------- */
  var GUIDE_TYPES = [
    { name: "정기감독", tagClass: "", tag: "계획형 · 사전통보",
      desc: "고용노동부·지방관서의 사업장근로감독 종합(세부)시행계획에 따라 실시. 통상 사전에 서면으로 통보." },
    { name: "수시감독", tagClass: "", tag: "사안형",
      desc: "정기계획 확정 후 법령 제·개정, 제보·언론보도, 근로자의 감독 청원 등으로 반영하지 못한 사안에 대해 별도 계획을 세워 실시." },
    { name: "특별감독", tagClass: "special", tag: "수사형",
      desc: "노사분규 발생 우려, 상습·고의적 체불, 불법파견, 직장 내 괴롭힘·성희롱 등 중대한 법 위반을 수사할 목적으로 실시." },
    { name: "재감독", tagClass: "", tag: "재적발 확인",
      desc: "최근 3년 이내 감독을 받은 사업장에서 동일·유사 사안으로 다시 신고·제보가 접수된 경우 실시." }
  ];

  var GUIDE_STEPS = [
    { ref: "제13조", title: "감독 계획 수립", desc: "고용노동부 종합계획 + 지방관서 세부시행계획 수립 (수시·특별감독은 별도 계획)" },
    { ref: "제17조", title: "사전 통보", desc: "정기감독은 통상 사전에 사업장에 문서로 통보 · 수시/특별감독은 무통보로 진행 가능" },
    { ref: "제18조", title: "사전조사 · 준비", desc: "사업장 개요, 과거 감독·신고 이력, 확인 필요 서류(별표2) 파악" },
    { ref: "제19조", title: "임장(실지) 조사", desc: "감독관증·지령서 제시 → 서류 열람·확인 → 사업주·근로자 심문" },
    { ref: "별표3", title: "위반사항 확인 및 조치", desc: "위반이 확인되면 조치기준(별표3)에 따라 시정지시 / 시정명령 / 과태료 / 즉시 범죄인지 중 결정",
      branch: [
        { cls: "ok", label: "시정기간 내 이행", text: "내사종결 (사건 종료)" },
        { cls: "no", label: "기간 내 미이행", text: "범죄인지 보고 → 수사 착수 (또는 과태료 부과)" }
      ] },
    { ref: "제20조", title: "결과 보고", desc: "감독 종료 후 결과보고서 작성·제출" },
    { ref: "", title: "사후관리", desc: "시정 이행 여부 확인 · 동일 위반이 재적발 기준기간 내 재적발되면 가중처벌 대상으로 관리" }
  ];

  var GUIDE_CHECKLIST = [
    { no: 1, title: "근로기준법 분야", items: [
      "취업규칙, 기숙사 규칙, 인사규정, 징계규정, 단체협약",
      "근로계약서, 근로자 명부, 출근부",
      "임금결정·지급방법 또는 계산의 기초에 관한 사항(임금협약, 급여규정 등)",
      "상여금 지급기준 및 지급서류(상여금지급규정 등)",
      "단시간근로자의 근로조건 관련서류",
      "임금대장(근로시간, 통상임금 산정의 적정여부 등)",
      "임금명세서(임금총액, 임금의 구성항목별 금액 등)",
      "승급 또는 감급 관련",
      "해고·퇴직 관련",
      "평균임금 산정 관련",
      "경영상 이유에 의한 고용조정 관련",
      "취직인허증 및 연소근로자 취업동의서",
      "출산전후휴가, 시간외근로, 쉬운 종류의 근로 전환 관련",
      "근로시간제도 관련서류(탄력적근로시간제, 선택적근로시간제, 근로시간계산의 특례, 근로시간 및 휴게시간의 특례 도입관련 서면합의서 등)",
      "인가·허가·승인·인정 관련서류(야업·휴일근로 인가시 근로자대표와의 협의서류)",
      "연차유급휴가 적치·사용대장, 보상휴가 관련 서류, 연차유급휴가 사용 촉진 관련 서류, 연차·휴일 대체 관련 서류",
      "재해보상 서류",
      "사용증명서 발급 관련",
      "직장 내 괴롭힘 신고·조사·처리 관련 서류"
    ]},
    { no: 2, title: "최저임금법 분야", items: [
      "최저임금 적용제외 인가 서류",
      "최저임금사항 주지 관련 서류",
      "도급으로 사업을 행하는 경우 인건비 단가 등 도급계약 관련 서류",
      "수습근로자의 근로계약서 등 최저임금 감액적용 관련 서류"
    ]},
    { no: 3, title: "근로자퇴직급여보장법 분야", items: [
      "퇴직급여 지급 관련",
      "퇴직급여제도의 선택·변경 관련 근로자 대표의 동의서",
      "퇴직연금제도의 내용 변경 관련 근로자 대표의 의견청취자료 및 동의서",
      "퇴직연금규약",
      "규약에서 정한 사항의 이행 관련 서류",
      "운용관리업무 및 자산관리업무의 수행 계약서",
      "퇴직연금제도 가입자의 교육실시와 관련된 서류"
    ]},
    { no: 4, title: "기간제 및 단시간근로자보호 등에 관한 법률 분야", items: [
      "근로계약서, 취업규칙, 단체협약 등",
      "단시간근로자의 초과근로 관련서류",
      "노동위 시정명령 관련서류",
      "기간제근로자 및 단시간근로자의 차별적 처우 여부를 판단하는데 필요한 관련 서류"
    ]},
    { no: 5, title: "파견근로자보호 등에 관한 법률 분야", items: [
      "근로자파견사업 대상업무 관련 서류",
      "근로자파견사업 허가기준 관련 서류",
      "근로자파견계약 관련 서류",
      "파견근로자 근로조건 보호 관련 파견·사용 사업주의 조치필요사항 관련 서류",
      "근로자파견사업 운영 관련 서류",
      "파견근로자의 차별적 처우 여부를 판단하는 데 필요한 관련 서류",
      "기타 사내하도급 관련 서류"
    ]},
    { no: 7, title: "근로복지기본법 분야", items: [
      "기금의 용도사업 및 증식사업 관련",
      "기금의 부동산 소유 관련",
      "법 시행을 위한 시정명령 이행관련",
      "보조 또는 융자받은 자금의 사용과 관련한 분야",
      "우리사주조합 규약",
      "우리사주조합 회계장부 및 서류",
      "우리사주조합원(대의원)총회 회의록",
      "우리사주조합 및 조합원의 주식취득·관리에 관한 장부와 서류"
    ]},
    { no: 8, title: "남녀고용평등과 일·가정 양립 지원에 관한 법률 분야", items: [
      "모집과 채용 관련",
      "동일가치 동일임금 관련",
      "임금외의 금품 등 관련",
      "교육·배치 및 승진 관련",
      "정년·퇴직 및 해고 관련",
      "직장 내 성희롱의 금지 및 예방 관련",
      "직장 내 성희롱 발생시 조치 관련",
      "직장 내 성희롱의 예방교육 관련",
      "고객 등에 의한 성희롱 방지 관련",
      "적극적 고용개선조치 관련",
      "출산전후휴가 관련",
      "배우자 출산휴가 관련",
      "육아휴직 등(육아기 근로시간 단축 포함)",
      "직장보육시설 설치 및 지원 관련",
      "명예고용평등감독관 위촉 관련",
      "고충처리기관 설치 관련"
    ]},
    { no: 9, title: "근로자 참여 및 협력증진에 관한 법률 분야", items: [
      "노사협의회 규정",
      "노사협의회 회의록",
      "노사협의회 설치 및 규정신고 관련",
      "노사협의회 위원 구성 관련",
      "정기노사협의회 개최 관련",
      "고충처리위원 선임 및 처리 관련"
    ]},
    { no: 10, title: "건설근로자의 고용개선 등에 관한 법률 분야", items: [
      "건설공사도급계약서 등 공사착공 등의 관련서류",
      "고용보험 근로내역 확인신고서",
      "기타 건설근로자퇴직공제사업과 관련된 자료"
    ]},
    { no: 11, title: "고용상 연령차별금지 및 고령자고용촉진에 관한 법률 관련분야", items: [
      "모집·채용 관련",
      "임금, 임금외의 금품지급 및 복리후생 관련",
      "교육·훈련 관련",
      "배치·전보·승진 관련",
      "퇴직·해고 관련",
      "그 밖에 연령차별금지제도 운영 관련"
    ]},
    { no: 12, title: "노동조합 및 노동관계조정법 분야", items: [
      "단체협약서(부속합의서 등)",
      "근로시간면제 제도 운영 관련 서류",
      "단체교섭·노사협의회·노사공동위원회 활동 관련 서류",
      "기타 사용자의 부당노동행위 여부를 판단하는데 필요한 관련 서류"
    ]},
    { no: 13, title: "가사근로자의 고용개선 등에 관한 법률 분야", items: [
      "근로계약서, 취업규칙, 단체협약 등",
      "가사근로자 고충 처리·조정 관련 서류",
      "가사서비스 제공기관 인증 및 이용계약 관련 서류"
    ]}
  ];

  var GUIDE_SANCTION_GENERAL = [
    "시정기간 내에 시정하면 내사종결, 기한 내 시정하지 아니하면 범죄인지 보고 후 수사 착수(행정질서벌은 과태료 부과)",
    "반의사불벌 사항은 피해자가 처벌을 원하지 않는 명시적 의사표시가 있으면 내사종결",
    "\"즉시시정\"은 시정완료시 내사종결, 미시정시 범죄인지(과태료 부과 사항은 과태료 부과)",
    "\"즉시범죄인지\" 또는 시정기간이 명시되지 않은 경우에는 즉시 범죄인지 보고(과태료 부과 사항은 과태료 부과)",
    "처리기간의 계산은 민원 처리에 관한 법률 제19조의 처리기간 계산에 의함",
    "기간제법 제8조 및 파견법 제21조 위반은 시정기간 내 시정하면 행정종결, 미시정시 차별적처우내용통보서 등 관련 서류를 관할 지방노동위원회에 통보"
  ];

  var GUIDE_SANCTIONS = [
    { law: "근로기준법", rows: [
      ["제6조","차별대우","시정기간 25일 이내(미시정시 범죄인지)"],
      ["제7조","강제근로","즉시 범죄인지"],
      ["제8조","폭행","즉시 범죄인지"],
      ["제9조","중간착취","즉시 범죄인지"],
      ["제10조","공민권행사 침해","즉시 시정(미시정시 범죄인지)"],
      ["제13조","보고, 출석불이행","즉시 시정(미시정시 과태료)"],
      ["제14조","법령요지 등의 게시위반","시정기간 14일 이내(미시정시 과태료)"],
      ["제17조","주요 근로조건 서면명시 및 교부의무 위반","시정기간 14일 이내(미시정시 범죄인지)"],
      ["제20조","위약예정금지 위반","즉시 범죄인지"],
      ["제21조","전차금 상쇄금지 위반","즉시 범죄인지"],
      ["제22조제1항","강제저축금지 위반","즉시 범죄인지"],
      ["제22조제2항","저축금 관리 위반","시정기간 14일 이내(미시정시 범죄인지)"],
      ["제23조제2항","업무상부상·질병자 등 해고","시정기간 14일 이내(미시정시 범죄인지)"],
      ["제26조","해고예고 미이행","시정기간 25일 이내(미시정시 범죄인지). 다만 부당해고 구제명령에 따라 임금상당액 지급·금전보상이 이미 이루어진 경우 즉시 범죄인지. 당사자간 합의로 신고가 철회·취소된 경우 내사종결"],
      ["제36조","각종금품 미청산","시정기간 14일 이내(미시정시 범죄인지, 반의사불벌). 평균임금 산정 등 단순 착오로 인한 체불은 25일 이내"],
      ["제39조","사용증명서 교부위반","즉시 시정(미시정시 과태료)"],
      ["제40조","취업방해의 금지","즉시 범죄인지"],
      ["제41조","근로자명부 미비치","시정기간 14일 이내(미시정시 과태료)"],
      ["제42조","계약서류 미보존","시정기간 14일 이내(미시정시 과태료)"],
      ["제43조","임금의 체불, 부정기불, 비통화불, 간접불 등","시정기간 14일 이내(미시정시 범죄인지, 반의사불벌). 단순 착오로 인한 체불은 25일 이내"],
      ["제44조","수차의 도급에 의해 행하여지는 사업에 대한 임금 미지급","시정기간 14일 이내(미시정시 범죄인지, 반의사불벌). 단순 착오는 25일 이내"],
      ["제44조의2","건설업에서의 임금지급 연대책임 위반","시정기간 14일 이내(미시정시 범죄인지, 반의사불벌). 단순 착오는 25일 이내"],
      ["제45조","비상시 지불위반","시정기간 14일 이내(미시정시 범죄인지). 단순 착오는 25일 이내"],
      ["제46조","휴업수당 미지급","시정기간 14일 이내(미시정시 범죄인지, 반의사불벌). 단순 착오는 25일 이내"],
      ["제47조","도급근로자에 대한 일정액의 임금미보장","시정기간 14일 이내(미시정시 범죄인지). 단순 착오는 25일 이내"],
      ["제48조제1항","임금대장 미작성 등","시정기간 14일 이내(미시정시 과태료)"],
      ["제48조제2항","임금명세서 미교부","시정기간 14일 이내(미시정시 과태료)"],
      ["제50조","근로시간 위반","시정기간 14일 이내(미시정시 범죄인지)"],
      ["제51조의2제2항","3개월 초과 탄력근로제 하 11시간 연속휴게시간 미부여","시정기간 3개월 이내(미시정시 범죄인지)"],
      ["제51조의2제5항","3개월 초과 탄력근로제 도입시 임금보존 방안 미신고","시정기간 25일 이내(미시정시 과태료)"],
      ["제51조의3","탄력근로제 하에서 근로시간이 단위기간보다 짧은 경우 주평균 40시간 초과시간 연장가산임금 미지급","시정기간 14일 이내(미시정시 범죄인지, 반의사불벌). 단순 착오는 25일 이내"],
      ["제52조제2항제1호","1개월 초과 선택근로제 하에서 다음근로일 시작 전까지 11시간 연속휴게시간 미부여","시정기간 3개월 이내(미시정시 범죄인지)"],
      ["제52조제2항제2호","1개월 초과 선택근로제 하 1개월마다 주평균 40시간 초과시간 가산임금 미지급","시정기간 14일 이내(미시정시 범죄인지, 반의사불벌). 단순 착오는 25일 이내"],
      ["제53조제1항·제2항·제4항","연장근로한도 위반","시정기간 3개월 이내(미시정시 범죄인지)"],
      ["제53조제5항","특별연장근로 부적당에 따른 휴게 및 휴일부여 시정명령 불이행","시정명령 3개월 이내(미시정시 범죄인지)"],
      ["제53조제7항","특별연장근로 실시 근로자의 휴게시간 미부여 등 건강보호조치 불이행","시정기간 3개월 이내(미시정시 범죄인지)"],
      ["제54조","휴게시간 미부여","시정기간 3개월 이내(미시정시 범죄인지)"],
      ["제55조","주휴일·공휴일 및 대체공휴일 미부여","즉시 시정(미시정시 범죄인지)"],
      ["제56조","연장·야간·휴일근로수당 미지급","시정기간 14일 이내(미시정시 범죄인지, 반의사불벌). 단순 착오는 25일 이내"],
      ["제59조제2항","근로시간특례 도입사업장에서 11시간 연속휴식시간 미부여","시정기간 3개월 이내(미시정시 범죄인지)"],
      ["제60조제1항·제2항·제4항·제5항","연차유급휴가 미부여","시정기간 25일 이내(미시정시 범죄인지)"],
      ["제64조","최저연령 위반","즉시 시정(미시정시 범죄인지)"],
      ["제65조","여성과 18세 미만자 사용금지 위반","즉시 시정(미시정시 범죄인지)"],
      ["제66조","연소자 증명서 미비치","즉시 시정(미시정시 과태료)"],
      ["제67조","미성년자 근로계약 위반","즉시 시정(미시정시 범죄인지)"],
      ["제69조","18세 미만자 근로시간 위반","즉시 시정(미시정시 범죄인지)"],
      ["제70조제1항","18세 이상 여성근로자의 야간 및 휴일근로의 제한","시정기간 14일 이내(미시정시 범죄인지)"],
      ["제70조제2항","임산부와 18세 미만자의 야간 및 휴일근로의 제한","즉시 시정(미시정시 범죄인지)"],
      ["제70조제3항","인가 전 근로자대표와 미협의","시정기한 14일 이내(미시정시 범죄인지)"],
      ["제71조","산후 1년이 경과하지 아니한 여성에 대한 연장근로한도 위반","즉시 시정(미시정시 범죄인지)"],
      ["제72조","여성과 18세 미만자의 갱내근로 금지","즉시 범죄인지"],
      ["제73조","생리휴가 미실시","의사표시 또는 청구에도 불구하고 휴가를 부여하지 않은 경우 즉시 범죄인지"],
      ["제74조제1항","출산전후휴가 90일 미부여","즉시 범죄인지 (다만 출산지연으로 산후 45일이 안되는 경우 내사종결)"],
      ["제74조제2항","출산전후휴가 분할사용 불허용","즉시 시정(미시정시 범죄인지)"],
      ["제74조제3항","유산·사산휴가 미부여","즉시 범죄인지 (다만 출산지연으로 산후 45일이 안되는 경우 내사종결)"],
      ["제74조제4항","출산전후휴가 기간 중 최초 60일분 임금 미지급","시정기간 14일 이내(미시정시 범죄인지). 단순 착오는 25일 이내"],
      ["제74조제5항","임신 중 여성근로자의 시간외근로 제한","즉시 시정(미시정시 범죄인지)"],
      ["제74조제5항","임신 중인 여성근로자의 요구가 있는 경우에도 쉬운 종류의 근로 전환 미실시","시정기간 14일 이내(미시정시 범죄인지)"],
      ["제74조제6항","출산전후휴가 종료 후 휴가 전과 동일한 업무 또는 동등한 수준의 임금을 지급하는 직무복귀 의무 위반","시정기간 25일 이내(미시정시 범죄인지)"],
      ["제74조제7항","임신기 근로시간 단축 미허용","시정기간 14일 이내(미시정시 과태료)"],
      ["제74조제9항","임신근로자 출퇴근시간 변경 미허용","시정기간 14일 이내(미시정시 과태료)"],
      ["제75조","육아시간 미부여","즉시 시정(미시정시 범죄인지)"],
      ["제76조의2","사용자의 직장 내 괴롭힘 금지","즉시 과태료"],
      ["제76조의3제2항","직장 내 괴롭힘 발생사실 확인을 위한 조사의무 위반","시정기간 25일 이내(미시정시 과태료). 다만 최근 3년 이내 조사의무 위반으로 시정지시 또는 과태료 부과 사실이 있는 경우에는 즉시 과태료 부과"],
      ["제76조의3제4항","직장 내 괴롭힘 피해근로자 요청 시 근무장소의 변경 등 적절한 조치의무 위반","시정기간 14일 이내(미시정시 과태료)"],
      ["제76조의3제5항","직장 내 괴롭힘을 한 자에 대한 징계 등 조치 위반","시정기간 25일 이내(미시정시 과태료)"],
      ["제76조의3제6항","직장 내 괴롭힘 발생사실을 신고한 근로자 및 피해근로자등에게 해고 등 불리한 처우","시정기간 14일 이내(미시정시 범죄인지)"],
      ["제76조의3제7항","직장 내 괴롭힘 조사 중 알게된 비밀누설","즉시 과태료"],
      ["제77조","기능습득자에 대한 혹사 및 가사업무 종사","시정기간 14일 이내(미시정시 범죄인지)"],
      ["제78조","요양보상 미이행","시정기간 25일 이내(미시정시 범죄인지)"],
      ["제79조","휴업보상 미이행","시정기간 25일 이내(미시정시 범죄인지)"],
      ["제80조","장해보상 미이행","시정기간 25일 이내(미시정시 범죄인지)"],
      ["제82조","유족보상 미이행","시정기간 25일 이내(미시정시 범죄인지)"],
      ["제83조","장의비 미지급","시정기간 25일 이내(미시정시 범죄인지)"],
      ["제91조","재해보상서류 미보존","시정기간 14일 이내(미시정시 과태료)"],
      ["제93조","취업규칙 미신고","시정기간 25일 이내(미시정시 과태료)"],
      ["제94조","취업규칙 변경절차 위반","시정기간 25일 이내(미시정시 범죄인지)"],
      ["제95조","제재규정 위반","시정기간 25일 이내(미시정시 범죄인지)"],
      ["제96조제1항·제2항","취업규칙 변경명령 불이행","25일 이내 시정하도록 변경명령 → 재변경 사유 해당시 15일 이내 재변경명령 → 재변경명령에도 미시정시 10일 이내 보고요구 → 응하지 않으면 수사 착수"],
      ["제98조제2항","기숙사 생활의 자치에 필요한 임원 선거 간섭","시정기간 14일 이내(미시정시 과태료)"],
      ["제99조","기숙사 규칙작성 등 위반","시정기간 25일 이내(미시정시 과태료)"],
      ["제100조","부속기숙사에 대한 설치·운영 기준 미충족","시정기간 3개월 이내(미시정시 범죄인지)"],
      ["제102조","근로감독관의 업무에 대한 방해, 기피 등의 행위","즉시 시정(미시정시 과태료)"],
      ["제104조제2항","감독기관에 대한 신고를 이유로 한 해고 등 불리한 처우","시정기간 14일 이내(미시정시 범죄인지)"]
    ]},
    { law: "최저임금법", rows: [
      ["제6조제1항·제2항","최저임금액 미달","즉시 시정(미시정시 범죄인지). 다만 최근 3년 이내 최저임금 미달로 재위반시 즉시 범죄인지 보고 후 수사 착수"],
      ["제6조제7항","도급인의 귀책사유로 인한 최저임금액 미달에 대한 연대책임 이행지시 불이행","시정기간 14일 이내(미시정시 범죄인지). 단순 착오는 25일 이내"],
      ["제11조","최저임금 주지의무 위반","시정기간 14일 이내(미시정시 과태료)"],
      ["제25조","임금에 관한 사항 미보고 및 허위보고","즉시 시정(미시정시 과태료)"],
      ["제26조제2항","자료제출·검사거부·방해 또는 기피·허위진술","즉시 시정(미시정시 과태료)"]
    ]},
    { law: "남녀고용평등과 일·가정 양립 지원에 관한 법률", rows: [
      ["제7조","모집과 채용에서 평등기회 미부여","모집기간 경과시 1차 서면 경고조치(최근 3년 이내 재위반시 즉시 범죄인지 보고 후 수사 착수) / 모집기간 미경과시 즉시 서면 시정지시(시정완료시 내사종결, 미시정시 범죄인지 보고 후 수사 착수) / 채용 관련 사항은 25일 이내 시정하도록 서면 지시(시정완료시 내사종결, 미시정시 범죄 인지보고 후 수사 착수)"],
      ["제8조제1항","임금차별","시정기간 14일 이내(미시정시 범죄인지). 단순 착오는 25일 이내"],
      ["제9조","임금외의 금품 등 차별","시정기간 14일 이내(미시정시 범죄인지). 단순 착오는 25일 이내"],
      ["제10조","교육, 배치 및 승진 차별","시정기간 25일 이내(미시정시 범죄인지)"],
      ["제11조","정년·퇴직 및 해고차별","시정기간 25일 이내(미시정시 범죄인지)"],
      ["제12조","사업주의 성희롱 금지","즉시 조사 후 과태료 부과"],
      ["제13조제1항","직장 내 성희롱의 예방을 위한 교육 미실시","최근 1년 이내(회계연도 기준) 교육을 미실시하였을 경우 25일 이내 교육 실시하도록 시정지시(미시정시 과태료). 다만 최근 3년 이내 2회 이상 교육을 미실시하였을 경우 즉시 과태료"],
      ["제13조제3항","직장 내 성희롱 예방 교육 내용 상시 게시 의무 위반","시정기간 14일 이내(미시정시 과태료)"],
      ["제14조제2항","직장 내 성희롱 발생 사실 확인을 위한 조사의무 의반","즉시 과태료"],
      ["제14조제4항","직장 내 성희롱 피해근로자 요청시 근무장소의 변경 등 적절한 조치 의무위반","시정기간 14일 이내(미시정시 과태료)"],
      ["제14조제5항","직장 내 성희롱을 한 자에 대한 징계 등 조치 위반","시정기간 25일 이내(미시정시 과태료)"],
      ["제14조제6항","직장 내 성희롱 신고근로자 등에 대한 불리한 처우 금지 위반","즉시 범죄인지"],
      ["제14조제7항","직장 내 성희롱 조사한 사람, 보고받은 사람 등 피해자 의사에 반하여 비밀누설 금지의무 위반","즉시 과태료"],
      ["제14조의2제1항","고객 등의 의한 성희롱 피해자 보호조치 의무 위반","시정기간 14일 이내(미시정시 과태료)"],
      ["제14조의2제2항","고객 등에 의한 성희롱 피해 근로자에게 고용상 불이익한 조치금지 위반","즉시 과태료"],
      ["제17조의3제1항","적극적 고용개선조치 시행계획 미제출","시정기간 14일 이내(미시정시 과태료)"],
      ["제17조의3제2항","남녀근로자 현황 미제출 또는 허위제출","시정기간 14일 이내(미시정시 과태료)"],
      ["제17조의4제1항","적극적 고용개선 조치 이행실적 미제출 또는 허위제출","시정기간 14일 이내(미시정시 과태료)"],
      ["제18조제4항","출산전후휴가급여 신청 관련 사업주의 미협력","즉시 시정(미시정시 과태료)"],
      ["제18조의2제1항","근로자의 청구에도 불구하고 배우자 출산휴가 10일 미부여","배우자 출산 후 90일 이내의 경우 즉시 시정(미시정시 과태료). 배우자 출산휴가 기간 10일 임금 미지급은 시정기간 14일 이내(미시정시 범죄인지, 단순 착오는 25일 이내)"],
      ["제18조의2제5항","배우자 출산휴가를 이유로 해고나 그 밖의 불리한 처우 금지 위반","해고시 즉시 범죄인지 / 그 밖의 불리한 처우시 시정기간 14일 이내(미시정시 범죄인지)"],
      ["제18조의3","난임 치료휴가 미부여","즉시 시정(미시정시 과태료)"],
      ["제19조제1항","육아휴직 미부여","즉시 시정(미시정시 범죄인지)"],
      ["제19조제3항","육아휴직을 이유로 해고 그 밖에 불리한 처우금지 위반","해고시 즉시 범죄인지 / 그 밖의 불리한 처우시 시정기간 14일 이내(미시정시 범죄인지)"],
      ["제19조제4항","육아휴직전과 동일한 업무 또는 동등한 수준의 임금을 지급하는 직무로의 복귀 위반 및 근속기간에 미포함","시정기간 14일 이내(미시정시 범죄인지)"],
      ["제19조의2제1항","육아기 근로시간 단축 신청 미허용","즉시 시정(미시정시 과태료)"],
      ["제19조의2제2항","사업주의 육아기 근로시간 단축 서면통지의무 위반","시정기간 14일 이내(미시정시 과태료)"],
      ["제19조의2제5항","육아기 근로시간 단축을 이유로 해고 그 밖에 불리한 처우금지 위반","해고시 즉시 범죄인지 / 그 밖의 불리한 처우시 시정기간 14일 이내(미시정시 범죄인지)"],
      ["제19조의2제6항","육아기 근로시간단축 후 같은 업무 또는 같은 수준의 임금을 지급하는 직무로의 미복귀","시정기간 14일 이내(미시정시 범죄인지)"],
      ["제19조의3제1항","육아기 근로시간단축을 이유로 근로조건 불이익","즉시 시정(미시정시 범죄인지)"],
      ["제19조의3제2항","육아기 근로시간단축 근로자의 근로조건 서면명시 의무위반","시정기간 14일 이내(미시정시 과태료)"],
      ["제19조의3제3항","육아기 근로시간단축 근로자의 연장근로제한 위반","즉시 시정(미시정시 범죄인지)"],
      ["제22조의2제1항","가족돌봄휴직 미부여","즉시 시정(미시정시 과태료)"],
      ["제22조의2제2항","가족돌봄휴가 미부여","즉시 시정(미시정시 과태료)"],
      ["제22조의2제6항","가족돌봄휴직 또는 가족돌봄휴가를 이유로 한 해고 등 그 밖에 불리한 처우 금지 위반","해고시 즉시 범죄인지 / 그 밖의 불리한 처우시 시정기간 14일 이내(미시정시 범죄인지)"],
      ["제22조의3제5항","가족돌봄 등을 위한 근로시간 단축을 이유로 한 해고 등 그 밖의 불리한 처우 위반 금지","해고시 즉시 범죄인지 / 그 밖의 불리한 처우시 시정기간 14일 이내(미시정시 범죄인지)"],
      ["제22조의4제1항","가족돌봄 등을 위한 근로시간 단축을 이유로 근로조건 저하","시정기간 14일 이내(미시정시 범죄인지)"],
      ["제22조의4제3항","근로시간 단축을 하고 있는 근로자에 대한 연장근로","즉시 시정(미시정시 범죄인지)"],
      ["제24조제3항","명예고용평등감독관의 정당한 활동을 이유로 당해근로자에 대해 불이익 조치","시정기간 14일 이내(미시정시 범죄인지)"],
      ["제29조의3 등","확정된 시정명령을 정당한 이유없이 이행하지 아니한 경우","시정기간 14일 이내(미시정시 과태료)"],
      ["제29조의4제1항","확정된 시정명령에 대한 이행상황의 제출 거부","즉시 과태료"],
      ["제29조의5제1항","사업주가 차별적 처우를 한 경우","시정기간 25일 이내(미시정시 노동위 통보)"],
      ["제29조의6제1항","확정된 시정명령의 효력확대에 따른 시정요구에 불응한 경우","시정기간 25일 이내(미시정시 노동위 통보)"],
      ["제29조의7","차별적 처우 등의 시정신청 등을 이유로 한 불리한 처우 금지 위반","즉시 범죄인지"],
      ["제31조제1항","보고 또는 서류제출을 거부하거나 허위보고 또는 허위서류 제출, 검사거부, 방해 또는 기피","즉시 시정(미시정시 과태료)"],
      ["제33조","동법 제33조 및 시행령 제23조와 관련된 서류를 고의로 파기 / 관련 서류 미보존","고의 파기는 즉시 과태료 / 미보존은 시정기간 14일 이내(미시정시 과태료)"]
    ]},
    { law: "임금채권보장법", rows: [
      ["제13조","재산목록 제출거부 또는 허위재산목록 제출","즉시 시정(미시정시 범죄인지)"],
      ["제22조","보고나 서류제출 불응 또는 허위보고, 허위서류 제출","즉시 시정(미시정시 과태료)"],
      ["제24조제1항","질문에 답변거부, 검사를 거부·방해 또는 기피","즉시 시정(미시정시 과태료)"],
      ["제28조제1호·제2호","허위 기타 부정한 방법으로 대지급금 또는 융자를 받은 자, 받게 한 자, 그를 위해 허위보고·증명한 자","즉시 범죄인지"]
    ]},
    { law: "근로복지기본법", rows: [
      ["제6조","보조 또는 융자받은 자금의 목적외 사용","시정기간 14일 이내(미시정시 과태료)"],
      ["제35조제3항 단서","총회 의결사항 의결결여","시정기간 14일 이내(미시정시 과태료)"],
      ["제35조제4항","총회 또는 대의원회 미개최","시정기간 14일 이내(미시정시 과태료)"],
      ["제35조제5항","임원과 대의원 선출방식 위반","시정기간 14일 이내(미시정시 과태료)"],
      ["제35조제7항","우리사주운영 관련장부의 작성·보관(10년) 위반","시정기간 14일 이내(미시정시 과태료)"],
      ["제37조","우리사주 취득에 따른 계정관리 위반","취득한 주식을 배정하지 않은 경우 즉시 시정(미시정시 과태료) / 취득한 주식을 다시 매도한 경우 즉시 과태료"],
      ["제42조의2","우리사주 취득 강요금지 등 위반","즉시 범죄인지"],
      ["제43조제1항","우리사주 예탁 위반","시정기간 14일 이내(미시정시 과태료)"],
      ["제43조제3항","예탁 우리사주 양도 또는 담보제공금지 위반","시정기간 14일 이내(미시정시 과태료)"],
      ["제46조","의결권 행사방식 위반","즉시 과태료"],
      ["제47조","조합 해산절차 및 보고 위반","즉시 시정(미시정시 과태료)"],
      ["제57조","복지기금협의회 회의록 작성·보관(10년) 위반","시정기간 14일 이내(미시정시 과태료)"],
      ["제60조제2항","직무수행을 이유로 한 불이익한 처우금지 위반","제69조에 따른 시정명령(시정기간 25일 이내, 미시정시 과태료)"],
      ["제62조","기금법인의 사업(용도) 위반","시정기간 25일 이내(미시정시 범죄인지)"],
      ["제63조","기금의 운용방법 위반","시정기간 25일 이내(미시정시 범죄인지)"],
      ["제64조","기금의 회계 위반","제69조에 따른 시정명령(시정기간 25일 이내, 미시정시 과태료)"],
      ["제65조","기금법인의 관리·운영서류의 작성·보관(5년) 위반","시정기간 14일 이내(미시정시 과태료)"],
      ["제66조","기금관리의 관리·운영사항 공개 위반","제69조에 따른 시정명령(시정기간 25일 이내, 미시정시 과태료)"],
      ["제67조","기금법인의 부동산 소유금지 위반","시정기간 3개월 이내(미시정시 범죄인지)"],
      ["제68조제1항","기금설치를 이유로 근로복지제도 또는 근로복지시설의 운영을 중단·단축","즉시 범죄인지"],
      ["제71조","해산시 재산처리 방법 위반","즉시 범죄인지"],
      ["제78조","직무상 비밀누설 / 겸직 또는 자기거래 금지 위반","즉시 범죄인지"],
      ["제86조의6","기본재산의 공동기금사업에의 사용 위반","시정기간 25일 이내(미시정시 범죄인지)"],
      ["제86조의8제2항","공동기금법인 탈퇴시 재산 배분 위반","시정기간 25일 이내(미시정시 범죄인지)"],
      ["제86조의8제3항","공동기금법인 탈퇴시 배분받은 재산의 처리 위반","시정기간 25일 이내(미시정시 범죄인지)"],
      ["제86조의9","개별 참여 사업주의 사업 폐지에 따른 재산처리 위반","즉시 범죄인지"],
      ["제86조의12","해산한 공동기금법인의 재산 처리 위반","즉시 범죄인지"],
      ["제93조제1항","공단·기금법인의 업무·회계·재산 등에 대한 미보고, 거짓보고, 명령위반, 검사거부·방해·기피","즉시 시정(미시정시 과태료)"],
      ["제93조제2항","우리사주조합 등에 대한 감독상 필요에 의한 미보고, 거짓보고, 명령위반, 검사거부·방해·기피","즉시 시정(미시정시 과태료)"]
    ]},
    { law: "건설근로자의 고용개선 등에 관한 법률", rows: [
      ["제5조제1항","고용관리책임자 미신고","시정기간 14일 이내(미시정시 과태료)"],
      ["제7조의2","식당, 탈의실, 화장실 설치의무 위반","시정기간 14일 이내(미시정시 과태료)"],
      ["제7조의3제1항","임금비용을 다른 공사비와 구분하여 매월 지급하지 아니한 자","시정기간 30일 이내(미시정시 과태료)"],
      ["제7조의3제2항","임금의 내역을 확인하지 아니한 자","시정기간 14일 이내(미시정시 과태료)"],
      ["제7조의3제3항","임금을 지급하지 아니한 경우 그 사실을 통보하지 아니한 자","즉시 시정(미시정시 과태료)"],
      ["제10조의3제1항","건설공사의 물량명세서 및 도급금액 산출명세서 또는 공사원가 계산서에 퇴직공제 가입비용을 밝히지 아니한 자","시정기간 30일 이내(미시정시 과태료)"],
      ["제10조의3제2항","하도급 부분에 해당하는 건설공사의 하도급금액 산출명세서에 퇴직공제 가입비용을 밝히지 아니한 자","시정기간 30일 이내(미시정시 과태료)"],
      ["제10조의4제1항","퇴직공제 의무가입 불이행","시정기간 14일 이내(미시정시 과태료)"],
      ["제13조제1항","피공제자의 근로일수를 매월 신고하지 아니하거나 공제부금 미납","시정기간 14일 이내(미시정시 과태료)"],
      ["제13조제4항","피공제자에게 전자카드를 발급하지 아니한 자","시정기간 14일 이내(미시정시 과태료)"],
      ["제13조의2","공제회로부터 납부 의무 발생 사실을 통보받고도 공제부금을 내지 아니한 자","시정기간 14일 이내(미시정시 과태료)"],
      ["제15조제2항","피공제자의 증명요구 불응","시정기간 14일 이내(미시정시 과태료)"],
      ["제23조제1항","보고나 서류제출 불응 또는 허위보고, 허위서류 제출","시정기간 14일 이내(미시정시 과태료)"],
      ["제23조제3항","시정명령 또는 지시 불응","시정기간 14일 이내(미시정시 과태료)"],
      ["제24조","허위·부정 수급자","즉시 범죄인지"]
    ]},
    { law: "파견근로자보호 등에 관한 법률", rows: [
      ["제5조제5항","파견대상업무 위반(파견사업주 및 사용사업주)","시정기간 25일 이내(미시정시 범죄인지, 다만 해당 근로자가 시정사항을 거부하여 시정하지 못한 경우 내사종결). 시정지시 내용은 사용사업주의 직접고용. ※ 파견사업주는 시행규칙 별표에 따른 행정처분 즉시 병과"],
      ["제6조제1항·제2항·제4항","파견기간 위반(파견사업주 및 사용사업주)","시정기간 25일 이내(미시정시 범죄인지, 거부시 내사종결). 시정지시 내용은 사용사업주의 직접고용. ※ 파견사업주는 행정처분 즉시 병과"],
      ["제6조의2제1항","파견근로자 직접고용 불이행(사용사업주)","시정기간 25일 이내에 직접 고용토록 지시(미시정시 과태료)"],
      ["제7조제1항 전단","파견사업 허가위반(파견사업주)","즉시 범죄인지"],
      ["제7조제1항 후단","파견사업 변경허가 위반(파견사업주)","시정기간 25일 이내(미시정시 범죄인지). 시행규칙 별표 행정처분 즉시 병과"],
      ["제7조제3항","무허가 근로자파견의 역무사용(사용사업주)","시정기간 25일 이내(미시정시 범죄인지, 거부시 내사종결)"],
      ["제10조제2항","부정갱신허가(파견사업주)","즉시 범죄인지. 시행규칙 별표 행정처분 즉시 병과"],
      ["제11조제1항","사업폐지 미신고 및 허위신고(파견사업주)","시정기간 14일 이내(미시정시 과태료). 행정처분 즉시 병과"],
      ["제12조제1항 각호","근로자파견사업의 허가취소 및 영업정지에 해당하는 경우(파견사업주)","시행규칙 별표에 따라 즉시 행정처분"],
      ["제12조제1항","영업정지 명령을 위반하여 파견사업을 계속한 자(파견사업주)","즉시 범죄인지"],
      ["제15조","명의대여의 금지 위반(파견사업주)","즉시 범죄인지. 행정처분 즉시 병과"],
      ["제16조","파견근로자 사용제한 위반(파견사업주 및 사용사업주)","즉시 범죄인지. 파견사업주는 행정처분 즉시 병과"],
      ["제18조","사업보고서를 제출하지 아니하거나 허위로 제출한 경우(파견사업주)","시정기간 14일 이내(미시정시 과태료). 행정처분 즉시 병과"],
      ["제21조제1항","차별적 처우의 금지","시정기간 25일 이내(미시정시 노동위원회 통보)"],
      ["제21조제3항","확정된 시정명령 불이행 / 이행상황 제출요구 불응 / 불리한 처우금지 위반(파견사업주 및 사용사업주)","확정 시정명령 불이행은 시정기간 14일 이내(미시정시 과태료) / 이행상황 제출요구 불응은 즉시 과태료 / 불리한 처우는 시정기간 14일 이내(미시정시 범죄인지)"],
      ["제26조제1항","취업조건의 고지 위반(파견사업주)","즉시 시정(미시정시 과태료). 행정처분 즉시 병과"],
      ["제26조제3항","근로자파견의 대가내역의 미제시(파견사업주)","즉시 시정(미시정시 과태료)"],
      ["제27조","파견사업주 통지의무 위반(파견사업주)","즉시 시정(미시정시 과태료)"],
      ["제29조","파견사업관리대장 작성·보존 위반(파견사업주)","시정기간 14일 이내(미시정시 과태료). 행정처분 즉시 병과"],
      ["제33조","사용사업관리대장 작성·보존 위반(사용사업주)","시정기간 14일 이내(미시정시 과태료)"],
      ["제34조제2항","근로기준법 특례규정 위반(파견사업주 및 사용사업주)","시정기간 14일 이내(미시정시 범죄인지)"],
      ["제35조제3항·제5항","건강진단결과 미송부(사용사업주 제3항, 파견사업주 제5항)","시정기간 14일 이내(미시정시 과태료). 파견사업주는 행정처분 즉시 병과"],
      ["제37조","개선명령 위반(파견사업주)","즉시 과태료. 행정처분 즉시 병과"],
      ["제38조제1항","보고명령 위반 및 허위보고(파견사업주 및 사용사업주)","즉시 과태료. 파견사업주는 행정처분 즉시 병과"],
      ["제38조제2항","검사 거부·방해·기피(파견사업주 및 사용사업주)","즉시 시정(미시정시 과태료). 파견사업주는 행정처분 즉시 병과"],
      ["제42조","공중위생 또는 공중도덕상 유해업무에 취업시킬 목적으로 근로자 파견을 행한 경우(파견사업주)","즉시 범죄인지"]
    ]},
    { law: "근로자퇴직급여보장법", rows: [
      ["제4조제2항","퇴직급여제도 차등설정","시정기간 14일 이내(미시정시 범죄인지)"],
      ["제4조제3항·제4항, 제25조제1항·제2항제1호","퇴직급여제도 또는 개인형퇴직연금제도 설정·변경시 근로자대표 또는 개별근로자의 동의를 받지 아니하거나 의견을 듣지 아니한 경우","시정기간 14일 이내(미시정시 범죄인지)"],
      ["제9조제1항","퇴직금 미청산","시정기간 14일 이내(미시정시 범죄인지, 반의사불벌). 단순 착오는 25일 이내"],
      ["제13조, 제19조","퇴직연금규약 미신고","시정기간 14일 이내(미시정시 과태료)"],
      ["제16조제3항","최소적립금 대비 부족분 비율의 3분의 1 이상 직전 사업연도 종료 후 1년 이내 미해소","시정기간 14일 이내(재정검증 결과 이의가 있어 재검증 실시시 25일 이내, 미시정시 과태료)"],
      ["제17조제2항·제3항","확정급여형퇴직연금제도의 퇴직급여 미지급","시정기간 14일 이내(미시정시 범죄인지, 반의사불벌). 단순 착오는 25일 이내"],
      ["제20조제5항, 제23조의7제2항, 제25조제3항","확정기여형퇴직연금제도 및 중소기업퇴직연금제도 부담금 및 지연이자 미납, 개인형퇴직연금제도 가입자의 부담금 및 지연이자 미납","시정기간 14일 이내(미시정시 범죄인지, 반의사불벌). 단순 착오는 25일 이내"],
      ["제23조의14제3항제1호","거짓이나 그 밖의 부정한 방법으로 중소기업퇴직연금제도의 지원금을 받은 자","시정기간 14일 이내(미시정시 범죄인지)"],
      ["제27조제4항","퇴직연금사업자의 가입자 보호조치 미실시","해당 퇴직연금사업자에 대한 감독을 금융위원회에 요청, 미이행시 즉시 범죄인지"],
      ["제31조제3항","퇴직연금제도 모집인으로 등록하지 아니한 자가 모집업무를 수행한 경우","즉시 시정지시(미시정시 범죄인지). 최근 3년 이내 재위반시 즉시 범죄인지 보고 후 수사 착수"],
      ["제31조제4항","퇴직연금제도 모집인 이외의 자에게 모집업무를 위탁한 경우","해당 퇴직연금사업자 감독을 금융위원회에 요청, 미이행시 즉시 범죄인지"],
      ["제31조제7항","퇴직연금제도 모집인이 모집업무를 재위탁하거나 모집인 준수사항을 미이행한 경우","금융감독원장에 조사요청, 미이행시 즉시 범죄인지"],
      ["제32조제2항","가입자에 대한 교육 미실시","시정기간 25일 이내(미시정시 과태료)"],
      ["제32조제4항","사용자가 자기 또는 제3자의 이익을 도모할 목적으로 운용·자산관리계약을 체결하거나 적절한 운영을 방해하는 행위","시정기간 25일 이내(미시정시 범죄인지)"],
      ["제32조제5항","확정급여형퇴직연금제도 또는 퇴직금제도를 설정한 사용자가 퇴직급여 감소 가능성을 미리 알리지 않거나 예방 조치 미실시","시정기간 25일 이내(미시정시 범죄인지)"],
      ["제33조제2항·제5항","퇴직연금사업자의 계약내용 미준수, 개인형퇴직연금사업자의 매년 1회 이상 가입자 교육 미실시","시정기간 25일 이내(미시정시 과태료)"],
      ["제33조제6항","퇴직연금제도 취급실적을 제출하지 아니하거나 거짓으로 작성하여 제출한 퇴직연금사업자","시정기간 25일 이내(미시정시 과태료)"],
      ["제33조제3항·제4항","퇴직연금사업자의 금지행위 위반","해당 퇴직연금사업자 감독을 금융위원회에 요청, 미이행시 즉시 범죄인지"],
      ["제35조","퇴직연금제도의 설정 또는 운영 등에 관하여 법, 규약 및 중소기업퇴직연금기금표준계약서에 위반되는 행위를 한 경우 시정명령 불이행","즉시 과태료"],
      ["제37조제6항","알게 된 거래정보 타인제공 또는 누설, 목적외 사용","즉시 범죄인지"]
    ]},
    { law: "기간제 및 단시간근로자 보호 등에 관한 법률", rows: [
      ["제6조제1항","단시간근로자의 초과근로제한","시정기간 14일 이내(미시정시 범죄인지)"],
      ["제8조","차별적 처우 금지","시정기간 25일 이내(미시정시 노동위원회 통보)"],
      ["제14조","확정된 시정명령 불이행","시정기간 14일 이내(미시정시 과태료)"],
      ["제15조제1항","시정명령 이행상황의 제출요구 불이행","즉시 과태료"],
      ["제16조","불리한 처우의 금지위반","시정기간 14일 이내(미시정시 범죄인지)"],
      ["제17조","근로조건의 서면명시 의무위반","시정기간 14일 이내(미시정시 과태료)"]
    ]},
    { law: "고용상 연령차별금지 및 고령자고용촉진에 관한 법률", rows: [
      ["제4조의4제1항제1호","모집·채용 차별","모집기간 경과시 1차 서면 경고조치(최근 3년 이내 재위반시 즉시 범죄인지) / 모집기간 미경과시 즉시 서면 시정지시 / 채용 관련 사항은 25일 이내 서면 지시 / 국가인권위원회 권고를 받아 시정명령이 필요한 경우 시정기간 25일 이내(미시정시 과태료)"],
      ["제4조의4제1항제2호","임금, 임금외의 금품지급 및 복리후생 차별","국가인권위원회 구제조치 등의 권고를 받아 시정명령이 필요한 경우 시정기간 25일 이내(미시정시 과태료)"],
      ["제4조의4제1항제3호","교육·훈련 차별","국가인권위원회 구제조치 등의 권고를 받아 시정명령이 필요한 경우 시정기간 25일 이내(미시정시 과태료)"],
      ["제4조의4제1항제4호","배치·전보·승진 차별","국가인권위원회 구제조치 등의 권고를 받아 시정명령이 필요한 경우 시정기간 25일 이내(미시정시 과태료)"],
      ["제4조의4제1항제5호","퇴직·해고 차별","국가인권위원회 구제조치 등의 권고를 받아 시정명령이 필요한 경우 시정기간 25일 이내(미시정시 과태료)"],
      ["제4조의8","시정명령 이행상황 제출요구 불응","시정기간 14일 이내(미시정시 과태료)"],
      ["제4조의9","연령차별행위에 대한 진정 등을 이유로 한 해고 등 불리한 처우","시정기간 14일 이내(미시정시 범죄인지)"]
    ]},
    { law: "가사근로자의 고용개선 등에 관한 법률", rows: [
      ["제7조제5항","인증기관 사칭","즉시 범죄인지"],
      ["제9조제3항, 제24조제4항","업무상 알게된 비밀누설, 업무 목적 외 사용","즉시 범죄인지"],
      ["제14조제1항·제2항","근로조건 서면명시 및 교부의무 위반","시정기간 14일 이내(미시정시 범죄인지)"],
      ["제16조제1항·제3항","유급휴일 및 연차유급휴가 미부여","시정기간 25일 이내(미시정시 범죄인지)"]
    ]}
  ];

  /* ---------- supabase (storage + real multi-user auth) ---------- */
  var STORAGE_BUCKET = "labor-compliance-files";
  var sb = (typeof window !== "undefined" && window.SUPABASE_CONFIG)
    ? window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey)
    : null;
  var currentUser = null; // { id, email } — the logged-in Supabase auth user
  var isRegisteredEditor = false;
  // Supabase-js processes an invite/recovery token in the URL hash as soon as the
  // client is created, which can fire before boot() attaches its own listener — so
  // this listener is attached immediately, right here at module load, to never miss it.
  var pendingPasswordRecovery = false;
  if (sb){
    sb.auth.onAuthStateChange(function(event){
      if (event === "PASSWORD_RECOVERY") pendingPasswordRecovery = true;
    });
  }

  async function openStorageFile(path, downloadName){
    if (!sb) return;
    try {
      var res = await sb.storage.from(STORAGE_BUCKET).createSignedUrl(path, 300, downloadName ? { download: downloadName } : undefined);
      if (res.error || !res.data) { alert("파일을 여는 중 문제가 발생했습니다: " + (res.error ? res.error.message : "")); return; }
      window.open(res.data.signedUrl, "_blank", "noopener");
    } catch(e){
      alert("파일을 여는 중 문제가 발생했습니다.");
    }
  }
  document.addEventListener("click", function(e){
    // Two separate affordances share the click delegate: a plain click on the
    // filename previews the file (no forced download, so browsers that can render
    // the type inline — PDF, images — do so in the new tab); a dedicated "다운로드"
    // control forces a download with the original filename via createSignedUrl's
    // `download` option. Checked first since the download control can be nested
    // near/inside a storage-path link's row.
    var dl = e.target.closest ? e.target.closest("[data-storage-download-path]") : null;
    if (dl){
      e.preventDefault();
      openStorageFile(dl.getAttribute("data-storage-download-path"), dl.getAttribute("data-storage-download-name") || undefined);
      return;
    }
    var a = e.target.closest ? e.target.closest("[data-storage-path]") : null;
    if (!a) return;
    e.preventDefault();
    openStorageFile(a.getAttribute("data-storage-path"));
  });

  /* ---------- utils ---------- */
  function $(sel, root){ return (root||document).querySelector(sel); }
  function $all(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  function esc(s){
    if (s === null || s === undefined) return "";
    return String(s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }
  function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
  function todayStr(){
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate());
  }
  function pad(n){ return n < 10 ? "0"+n : ""+n; }
  function parseDate(s){
    if (!s) return null;
    var p = s.split("-");
    if (p.length < 3) return null;
    return new Date(parseInt(p[0],10), parseInt(p[1],10)-1, parseInt(p[2],10));
  }
  function fmtDate(s){
    var d = parseDate(s);
    if (!d) return "-";
    return d.getFullYear() + "." + pad(d.getMonth()+1) + "." + pad(d.getDate());
  }
  function addYears(s, years){
    var d = parseDate(s);
    if (!d) return null;
    d.setFullYear(d.getFullYear() + Number(years||0));
    return d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate());
  }
  function addMonths(s, months){
    var d = parseDate(s);
    if (!d) return null;
    d.setMonth(d.getMonth() + Number(months||0));
    return d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate());
  }
  function daysUntil(s){
    var d = parseDate(s);
    if (!d) return null;
    var t = parseDate(todayStr());
    return Math.round((d - t) / 86400000);
  }
  function currentQuarterLabel(dateStr){
    var d = parseDate(dateStr) || new Date();
    var q = Math.floor(d.getMonth()/3) + 1;
    return d.getFullYear() + "년 " + q + "분기";
  }
  function catName(id){
    var c = state.categories.filter(function(x){ return x.id === id; })[0];
    return c ? c.name : "미분류";
  }
  function roundById(id){
    return (state.inspectionRounds||[]).filter(function(r){ return r.id === id; })[0] || null;
  }
  function roundLabel(insp){
    var r = insp.roundId ? roundById(insp.roundId) : null;
    if (r) return r.label;
    return insp.inspectionRound || "-";
  }

  /* ---------- 첨부파일 업로드 / AI 자동인식 ---------- */
  var IMAGE_EXTS = ["png","jpg","jpeg","gif","webp"];
  function extOf(name){ var m = /\.([a-zA-Z0-9]+)$/.exec(name||""); return m ? m[1].toLowerCase() : ""; }
  function sanitizeFileName(name){ return (name||"file").replace(/[^a-zA-Z0-9._\-가-힣]/g,"_").slice(-80); }
  function humanSize(bytes){
    if (!bytes && bytes !== 0) return "";
    if (bytes < 1024) return bytes + "B";
    if (bytes < 1024*1024) return Math.round(bytes/1024) + "KB";
    return (bytes/1024/1024).toFixed(1) + "MB";
  }
  // Real Supabase Storage accepts any file type/size (within the bucket's limits),
  // so unlike the old Artifact-based uploader there is no extension allowlist here —
  // this is one of the main reasons for the migration off the Artifact page.
  async function uploadOneFile(file, pathPrefix){
    if (!sb) return {ok:false, message:"저장소 연결이 초기화되지 않았습니다. 새로고침 후 다시 시도해주세요."};
    var fid = uid();
    // Supabase Storage object keys must be ASCII-only — Korean text, accented letters,
    // emoji, spaces, etc. in the key make the upload fail with "Invalid key". So the
    // storage key uses only the random id + extension; the original (Korean-friendly)
    // filename is kept separately in the attachment's metadata for display, and handed
    // back to Storage only as the suggested download name via createSignedUrl's
    // `download` option — never as part of the actual key.
    var ext = extOf(file.name).replace(/[^a-zA-Z0-9]/g, "");
    var path = pathPrefix + "/" + fid + (ext ? ("." + ext) : "");
    try {
      var res = await sb.storage.from(STORAGE_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (res.error) throw res.error;
      return {ok:true, meta:{ id: fid, name: file.name, path: path, contentType: file.type||"", size: file.size, uploadedDate: todayStr() }, file: file};
    } catch(err){
      return {ok:false, message: "파일 업로드에 실패했습니다: " + ((err && err.message) || err)};
    }
  }
  function renderAttachmentList(files, removeAttr, idPrefix){
    if (!files || !files.length) return '<div class="empty-row" style="padding:2px 0;">첨부된 파일이 없습니다.</div>';
    return '<ul class="attach-list">' + files.map(function(f){
      var isStored = !!f.path;
      var linkAttr = isStored ? ('data-storage-path="' + esc(f.path) + '"') : '';
      var href = isStored ? '#' : esc(f.url||"#");
      var dlLink = isStored ? (' <a href="#" data-storage-download-path="' + esc(f.path) + '" data-storage-download-name="' + esc(f.name) + '" style="font-size:11px;white-space:nowrap;">다운로드</a>') : '';
      var delId = (idPrefix ? (esc(idPrefix) + '|') : '') + f.id;
      return '<li class="attach-item"><a href="' + href + '" ' + linkAttr + (isStored ? '' : ' target="_blank" rel="noopener"') + '>📎 ' + esc(f.name) + '</a>' + dlLink +
        (f.size ? ('<span class="mono" style="font-size:11px;color:var(--ink-500);">' + humanSize(f.size) + '</span>') : '') +
        (removeAttr ? ('<button type="button" class="btn sm ghost" data-' + removeAttr + '="' + delId + '" style="margin-left:auto;">삭제</button>') : '') +
      '</li>';
    }).join("") + '</ul>';
  }
  var _pdfJsLoading = null;
  function loadPdfJs(){
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (_pdfJsLoading) return _pdfJsLoading;
    _pdfJsLoading = new Promise(function(resolve, reject){
      var s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      s.onload = function(){
        try {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
          resolve(window.pdfjsLib);
        } catch(e){ reject(e); }
      };
      s.onerror = function(){ reject(new Error("pdf.js 로드 실패")); };
      document.head.appendChild(s);
    });
    return _pdfJsLoading;
  }
  async function extractPdfText(file, maxChars){
    var pdfjsLib = await loadPdfJs();
    var buf = await file.arrayBuffer();
    var doc = await pdfjsLib.getDocument({data: buf}).promise;
    var text = "";
    for (var p=1; p<=doc.numPages && text.length < maxChars; p++){
      var page = await doc.getPage(p);
      var content = await page.getTextContent();
      text += content.items.map(function(it){ return it.str; }).join(" ") + "\n";
    }
    return text.slice(0, maxChars);
  }
  // AI extraction runs server-side via the "analyze-inspection-doc" Supabase Edge
  // Function (see supabase/functions/analyze-inspection-doc/index.ts). This app used
  // to run inside a claude.ai artifact, where `window.claude.use("sample")` could ask
  // Claude directly from the browser — that API only exists inside the artifact
  // iframe, so after moving to a standalone site (GitHub Pages) it silently stopped
  // working. The Edge Function keeps the Anthropic API key server-side and checks
  // that the caller is a logged-in, registered editor before spending any AI budget.
  async function extractFindingsFromAttachments(attachments){
    var imageBlobs = [];
    var textParts = [];
    for (var i=0;i<attachments.length;i++){
      var a = attachments[i];
      var ext = extOf(a.name);
      if (IMAGE_EXTS.indexOf(ext) !== -1 && a.file){
        imageBlobs.push(a.file);
      } else if (ext === "pdf" && a.file){
        try {
          var t = await extractPdfText(a.file, 20000);
          textParts.push("[첨부파일: " + a.name + "]\n" + t);
        } catch(e){
          textParts.push("[첨부파일: " + a.name + " - 텍스트 추출 실패]");
        }
      }
    }
    var catNames = state.categories.map(function(c){ return c.name; });
    var promptText =
      "다음은 근로감독 관련 첨부자료(감독결과통지서/시정지시서 등)의 내용입니다. 이 내용을 분석해서 근로감독에서 적발되거나 지적된 사항을 구조화된 JSON으로 추출해주세요.\n\n" +
      "사용 가능한 카테고리 목록: " + catNames.join(", ") + "\n\n" +
      "각 적발 항목마다 다음 필드를 채워주세요 (알 수 없는 값은 빈 문자열 또는 null로 두세요):\n" +
      "- categoryName: 위 카테고리 목록 중 가장 가까운 것 하나\n" +
      "- severity: \"시정명령\", \"시정지시\", \"개선권고\" 중 하나 (자료에 '시정명령'이라는 표현이 명시되어 있으면 시정명령, '시정지시'라는 표현이 명시되어 있거나 일반적인 시정조치 통보이면 시정지시, 실제 위반으로 공식 처분된 것이 아니라 감독관이 리스크로 지적만 하고 시정지시서/명령서에는 최종 포함되지 않은 사항이면 개선권고)\n" +
      "- lawRef: 근거법령/조항\n" +
      "- foundDate: 감독일 또는 적발일 (YYYY-MM-DD)\n" +
      "- disposition: 처분결과 (예: 과태료, 시정지시, 사법처리 등)\n" +
      "- dispositionAmount: 처분금액을 반드시 \"만원\" 단위 숫자로 변환해서 기입 (예: 자료에 \"3,951,983원\"이라고 적혀 있으면 3951983이 아니라 395.1983으로, \"195,000원\"이면 195000이 아니라 19.5로 변환. 절대 원(₩) 단위 그대로 넣지 말 것), 없으면 null\n" +
      "- fineImposed: \"부과\" 또는 \"미부과\"\n" +
      "- correctionDeadline: 개선기한 (YYYY-MM-DD), 있으면\n" +
      "- violationDesc: 위반/지적 내용 요약\n" +
      "- correctionPlan: 개선방안 (자료에 명시되어 있으면)\n\n" +
      "반드시 아래 JSON 형식으로만 답변하세요 (다른 설명 문장이나 마크다운 코드블록 없이 순수 JSON만): " +
      '{"items":[{"categoryName":"","severity":"","lawRef":"","foundDate":"","disposition":"","dispositionAmount":null,"fineImposed":"","correctionDeadline":"","violationDesc":"","correctionPlan":""}]}' + "\n\n" +
      (textParts.length ? ("--- 첨부 텍스트 내용 ---\n" + textParts.join("\n\n").slice(0, 50000)) : "(텍스트 자료 없음 — 첨부된 이미지를 참고해 분석하세요)");

    var fd = new FormData();
    fd.append("prompt", promptText);
    imageBlobs.slice(0, 5).forEach(function(blob){ fd.append("image", blob, blob.name || "image"); });

    var res = await sb.functions.invoke("analyze-inspection-doc", { body: fd });
    if (res.error){
      var detail = "";
      try { if (res.error.context && typeof res.error.context.json === "function"){ var body = await res.error.context.json(); detail = body && body.error ? body.error : ""; } } catch(e){}
      throw new Error(detail || res.error.message || "AI 분석 요청에 실패했습니다.");
    }
    if (res.data && res.data.error) throw new Error(res.data.error);
    var raw = res.data && res.data.text;
    if (!raw) throw new Error("AI 응답이 비어 있습니다.");
    var jsonStr = raw.trim();
    var m = jsonStr.match(/\{[\s\S]*\}/);
    if (m) jsonStr = m[0];
    return JSON.parse(jsonStr);
  }
  function matchCategoryByName(name){
    if (!name) return state.categories[0] ? state.categories[0].id : "";
    var n = String(name).trim();
    var exact = state.categories.filter(function(c){ return c.name === n; })[0];
    if (exact) return exact.id;
    var partial = state.categories.filter(function(c){ return c.name.indexOf(n) !== -1 || n.indexOf(c.name) !== -1; })[0];
    if (partial) return partial.id;
    return state.categories[0] ? state.categories[0].id : "";
  }
  async function sha256Hex(text){
    var enc = new TextEncoder().encode(text);
    var buf = await crypto.subtle.digest("SHA-256", enc);
    var arr = Array.from(new Uint8Array(buf));
    return arr.map(function(b){ return b.toString(16).padStart(2,"0"); }).join("");
  }
  function safeJSONStringify(obj){
    return JSON.stringify(obj).replace(/</g, "\\u003c");
  }

  /* ---------- load state / draft ---------- */
  var APP_STATE_ROW_ID = "main";
  async function loadStateFromServer(){
    var raw = null;
    if (sb){
      var res = await sb.from("app_state").select("data").eq("id", APP_STATE_ROW_ID).maybeSingle();
      if (res.error) throw res.error;
      raw = res.data ? res.data.data : null;
    }
    applyState(raw);
  }
  function applyState(raw){
    state = raw && typeof raw === "object" ? raw : {meta:{},categories:[],inspections:[],selfCheckRounds:[],materials:[],selfCheckTemplate:{}};
    normalizeState();
  }
  function normalizeState(){
    if (!state.meta) state.meta = {};
    if (!state.meta.defaultRepeatWindowYears) state.meta.defaultRepeatWindowYears = 3;
    if (!state.meta.selfCheckIntervalMonths) state.meta.selfCheckIntervalMonths = 6;
    if (!state.meta.changeLog) state.meta.changeLog = [];
    if (!state.categories) state.categories = [];
    if (!state.inspections) state.inspections = [];
    if (!state.selfCheckRounds) state.selfCheckRounds = [];
    if (!state.materials) state.materials = [];
    if (!state.selfCheckTemplate) state.selfCheckTemplate = {};
    if (!state.inspectionRounds) state.inspectionRounds = [];
    if (!state.legalAlerts) state.legalAlerts = [];
    if (!state.legalWatchlist) state.legalWatchlist = [];
    if (!state.meta.lawReview) state.meta.lawReview = { reviewedDate: "", reviewedBy: "" };
    if (!state.guideChecklistChecked) state.guideChecklistChecked = {};
    state.inspections.forEach(function(i){
      if (!i.correctionEvidenceFiles) i.correctionEvidenceFiles = [];
      if (i.correctionResult === undefined) i.correctionResult = "";
      if (!i.links) i.links = [];
    });
    migrateInspectionRounds();
    state.inspectionRounds.forEach(function(r){
      if (!r.attachments) r.attachments = [];
      if (r.department === undefined) r.department = "";
    });
  }
  // Older data only had a free-text "inspectionRound" label per finding. Turn each
  // distinct label into a proper round record (with its own materials list) and
  // link the findings to it, so existing data keeps working with the new
  // "감독 시기별 이력" view without the user having to re-enter anything.
  function migrateInspectionRounds(){
    var byId = {};
    (state.inspectionRounds||[]).forEach(function(r){ byId[r.id] = r; });
    var byLabel = {};
    (state.inspectionRounds||[]).forEach(function(r){ byLabel[r.label] = r; });
    state.inspections.forEach(function(i){
      if (i.roundId && byId[i.roundId]) return; // already linked to a real round record
      var label = (i.inspectionRound || "").trim();
      if (!label) return;
      var round = byLabel[label];
      if (!round){
        round = { id: uid(), label: label, date: i.foundDate || "", type: i.inspectionType || "", agency: "", target: "", notes: "", materials: [], createdAt: new Date().toISOString() };
        state.inspectionRounds.push(round);
        byLabel[label] = round;
        byId[round.id] = round;
      } else if (i.foundDate && (!round.date || i.foundDate < round.date)){
        round.date = i.foundDate;
      }
      i.roundId = round.id;
    });
  }
  function loadDraft(){
    try {
      var raw = sessionStorage.getItem(DRAFT_KEY);
      draftAnswers = raw ? JSON.parse(raw) : {};
    } catch(e){ draftAnswers = {}; }
  }
  function saveDraft(){
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draftAnswers)); } catch(e){}
  }
  // Publishing a full-document ("html" string form) republish reloads THIS view too
  // (not just other open tabs) — so any save (commit()) causes a hard reload of the
  // page's own script. editMode/activeTab/etc. are plain JS variables that would
  // otherwise reset to their defaults on that reload. Stash them in sessionStorage
  // (survives a reload, cleared only when the tab/session ends) and restore them on
  // boot, so edit mode and the current screen persist across saves until the user
  // explicitly exits edit mode.
  function saveUiState(){
    try {
      sessionStorage.setItem(UI_STATE_KEY, JSON.stringify({
        editMode: editMode,
        editorName: editorName,
        activeTab: activeTab,
        inspectionViewMode: inspectionViewMode,
        selectedRoundId: selectedRoundId
      }));
    } catch(e){}
  }
  function loadUiState(){
    try {
      var raw = sessionStorage.getItem(UI_STATE_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (s.editMode) editMode = true;
      if (s.editorName) editorName = s.editorName;
      // "materials" (자료실) was removed as a standalone tab — a session saved before
      // that change could still have it stashed; fall back to the dashboard instead of
      // restoring a tab whose view section no longer exists.
      if (s.activeTab && s.activeTab !== "materials") activeTab = s.activeTab;
      if (s.inspectionViewMode) inspectionViewMode = s.inspectionViewMode;
      if (s.selectedRoundId) selectedRoundId = s.selectedRoundId;
    } catch(e){}
  }
  function getAnswer(itemId){
    return draftAnswers[itemId] || {result:"적정", note:""};
  }
  function setAnswer(itemId, result, note){
    draftAnswers[itemId] = {result:result, note:note||""};
    saveDraft();
  }
  function findTemplateItem(itemId){
    var all = state.selfCheckTemplate || {};
    for (var catId in all){
      var found = (all[catId]||[]).filter(function(x){ return x.id === itemId; })[0];
      if (found) return found;
    }
    return null;
  }

  /* ---------- derived / computed ---------- */
  function effectiveRepeatWindowYears(insp){
    // 0 is a deliberate "재적발 제한 없음" setting (e.g. 개선권고), not "unset" —
    // `insp.repeatWindowYears || default` would wrongly fall back to the default
    // because 0 is falsy in JS, so this needs an explicit check.
    var raw = insp.repeatWindowYears;
    if (raw === 0 || raw === "0") return 0;
    return raw || state.meta.defaultRepeatWindowYears;
  }
  function repeatDeadlineText(flags){
    if (flags.noRepeatLimit) return "제한없음";
    return flags.repeatDeadline ? fmtDate(flags.repeatDeadline) : "-";
  }
  function computeInspectionFlags(insp){
    var rwYears = effectiveRepeatWindowYears(insp);
    var noRepeatLimit = rwYears === 0;
    var repeatDeadline = (insp.foundDate && !noRepeatLimit) ? addYears(insp.foundDate, rwYears) : null;
    var withinWindow = repeatDeadline ? daysUntil(repeatDeadline) >= 0 : false;
    var overdue = insp.status !== "개선완료" && insp.correctionDeadline && daysUntil(insp.correctionDeadline) < 0;
    return { repeatDeadline: repeatDeadline, withinWindow: withinWindow, overdue: overdue, noRepeatLimit: noRepeatLimit };
  }
  function latestInspectionDate(){
    var dates = state.inspections.map(function(i){ return i.foundDate; }).filter(Boolean).sort();
    return dates.length ? dates[dates.length-1] : null;
  }
  function latestRound(){
    if (!state.selfCheckRounds.length) return null;
    var sorted = state.selfCheckRounds.slice().sort(function(a,b){ return (a.date||"").localeCompare(b.date||""); });
    return sorted[sorted.length-1];
  }
  function roundCategoryRisk(round){
    var map = {};
    state.categories.forEach(function(c){ map[c.id] = "good"; });
    (round.answers||[]).forEach(function(a){
      if (a.result === "위반"){ map[a.categoryId] = "danger"; }
      else if (a.result === "부족" && map[a.categoryId] !== "danger"){ map[a.categoryId] = "watch"; }
    });
    return map;
  }
  function riskWatchlist(){
    // 가중처벌 위험구간: 시정명령/시정지시 중 "최초 적발일로부터 재적발 기준기간이
    // 지나지 않은" 항목 전체. 개선 완료 여부는 무관하다 — 재적발 시 처벌이 가중되는
    // 리스크는 개선을 마쳤는지와 별개로 그 위반이 재적발 제한기간 내인지로 결정되기
    // 때문. 개선권고는 재적발 개념 자체가 적용되지 않으므로 제외하고, 재적발 기준기간을
    // 0(제한없음)으로 설정한 항목도 제외한다.
    return state.inspections
      .filter(function(i){ return i.severity !== "개선권고"; })
      .map(function(i){ return Object.assign({}, i, {flags: computeInspectionFlags(i)}); })
      .filter(function(i){ return i.flags.repeatDeadline; });
  }
  function riskWatchlistGrouped(){
    var all = riskWatchlist();
    return {
      active: all.filter(function(i){ return i.flags.withinWindow; })
        .sort(function(a,b){ return daysUntil(a.flags.repeatDeadline) - daysUntil(b.flags.repeatDeadline); }),
      expired: all.filter(function(i){ return !i.flags.withinWindow; })
        .sort(function(a,b){ return daysUntil(b.flags.repeatDeadline) - daysUntil(a.flags.repeatDeadline); })
    };
  }
  function overdueList(){
    return state.inspections
      .map(function(i){ return Object.assign({}, i, {flags: computeInspectionFlags(i)}); })
      .filter(function(i){ return i.flags.overdue; });
  }
  function openIssuesList(){
    return state.inspections.filter(function(i){ return i.status === "미착수" || i.status === "진행중"; });
  }
  function inspectionsBySeverityGroup(sevGroup, list){
    list = list || state.inspections;
    return list.filter(function(i){ return sevGroup === "advisory" ? i.severity === "개선권고" : i.severity !== "개선권고"; });
  }

  /* ---------- rendering: shell ---------- */
  function render(){
    var app = document.getElementById("app");
    app.innerHTML = shellTemplate();
    wireShell();
    renderActiveTab();
  }

  function shellTemplate(){
    return (
      '<div class="shell">' +
        '<div class="topbar"><div class="topbar-inner">' +
          '<div class="brand-row">' +
            '<div class="brand">' +
              '<h1>' + esc(state.meta.title || TITLE) + '</h1>' +
              (state.meta.orgName ? '<span class="org">' + esc(state.meta.orgName) + '</span>' : '') +
            '</div>' +
            '<div class="topbar-actions" id="editToggleWrap"></div>' +
          '</div>' +
          '<nav class="tabs" role="tablist">' +
            tabBtn("guide","근로감독 안내") +
            tabBtn("dashboard","대시보드") +
            tabBtn("findings","적발 사항") +
            tabBtn("inspections","근로감독 이력") +
            tabBtn("selfcheck","모의점검") +
            tabBtn("settings","설정") +
          '</nav>' +
        '</div></div>' +
        '<section class="view" id="view-guide"></section>' +
        '<section class="view" id="view-dashboard"></section>' +
        '<section class="view" id="view-findings"></section>' +
        '<section class="view" id="view-inspections"></section>' +
        '<section class="view" id="view-selfcheck"></section>' +
        '<section class="view" id="view-settings"></section>' +
        '<p class="footer-note">최근 저장: ' + (state.meta.lastUpdated ? fmtDate(state.meta.lastUpdated) + ' ' + (state.meta.lastUpdated.split("T")[1]||"").slice(0,5) : "-") +
          ' · 이 페이지의 실제 저장 권한은 등록된 편집자 계정(로그인) 기준입니다.</p>' +
      '</div>' +
      '<div id="modalRoot"></div>'
    );
  }
  function tabBtn(id, label){
    return '<button class="tab" role="tab" aria-selected="' + (activeTab===id) + '" data-tab="' + id + '">' + label + '</button>';
  }

  function wireShell(){
    $all(".tab").forEach(function(btn){
      btn.addEventListener("click", function(){
        activeTab = btn.getAttribute("data-tab");
        saveUiState();
        $all(".tab").forEach(function(b){ b.setAttribute("aria-selected", b===btn); });
        $all(".view").forEach(function(v){ v.classList.remove("active"); });
        document.getElementById("view-"+activeTab).classList.add("active");
        renderActiveTab();
      });
    });
    document.getElementById("view-"+activeTab).classList.add("active");
    renderEditToggle();
  }

  function renderEditToggle(){
    var wrap = document.getElementById("editToggleWrap");
    if (!wrap) return;
    var who = '<span class="hint" style="margin-right:10px;font-size:12px;">' + esc((currentUser && currentUser.email) || editorName || "") + '</span>';
    var logoutBtn = '<button class="btn sm ghost" id="btnLogout" style="margin-right:6px;">로그아웃</button>';
    if (editMode){
      wrap.innerHTML = who +
        '<span class="badge good" style="margin-right:6px;"><span class="dot"></span>편집모드</span>' +
        '<button class="btn sm" id="btnExitEdit" style="margin-right:6px;">보기 전용으로</button>' + logoutBtn;
      $("#btnExitEdit").addEventListener("click", function(){ editMode=false; saveUiState(); render(); });
    } else {
      wrap.innerHTML = who + '<button class="btn primary sm" id="btnEnterEdit" style="margin-right:6px;">✎ 편집모드</button>' + logoutBtn;
      $("#btnEnterEdit").addEventListener("click", function(){ editMode=true; saveUiState(); render(); });
    }
    $("#btnLogout").addEventListener("click", async function(){
      if (sb) await sb.auth.signOut();
      window.location.reload();
    });
  }

  function renderActiveTab(){
    if (activeTab === "guide") renderGuide();
    else if (activeTab === "dashboard") renderDashboard();
    else if (activeTab === "findings") renderFindings();
    else if (activeTab === "inspections") renderInspections();
    else if (activeTab === "selfcheck") renderSelfCheck();
    else if (activeTab === "settings") renderSettings();
  }

  /* ---------- dashboard ---------- */
  function renderDashboard(){
    var el = document.getElementById("view-dashboard");
    var lastInsp = latestInspectionDate();
    var openGrouped = openIssuesListGrouped();
    var watchGrouped = riskWatchlistGrouped();
    var watchActive = watchGrouped.active;
    var watchExpired = watchGrouped.expired;
    var overdue = overdueList();
    var overdueStrict = overdue.filter(function(i){ return i.severity !== "개선권고"; });
    var overdueAdvisory = overdue.filter(function(i){ return i.severity === "개선권고"; });
    var strictTotal = state.inspections.filter(function(i){return i.severity!=="개선권고";}).length;
    var advisoryTotal = state.inspections.filter(function(i){return i.severity==="개선권고";}).length;
    var lr = latestRound();
    var nextCheckDue = lr ? addMonths(lr.date, state.meta.selfCheckIntervalMonths) : null;
    var riskMap = lr ? roundCategoryRisk(lr) : {};
    var dangerCats = Object.keys(riskMap).filter(function(k){ return riskMap[k]==="danger"; }).length;
    var watchCats = Object.keys(riskMap).filter(function(k){ return riskMap[k]==="watch"; }).length;

    var html = "";
    if (!state.inspections.length && !state.selfCheckRounds.length){
      html += '<div class="banner info">아직 등록된 데이터가 없습니다. <b>적발 사항</b> 탭과 <b>모의점검</b> 탭에서 편집모드로 항목을 추가해보세요.</div>';
    }
    html += '<div class="grid-stats">';
    html += statCard("최근 근로감독일", lastInsp ? fmtDate(lastInsp) : "이력 없음", "");
    html += dualStatCard("누적 적발 건수", [
      {key:"cumulative-strict", labelText:"시정지시/시정명령", count: strictTotal},
      {key:"cumulative-advisory", labelText:"개선권고", count: advisoryTotal}
    ]);
    html += dualStatCard("미개선 건수", [
      {key:"open-strict", labelText:"시정지시/시정명령", count: openGrouped.strict.length},
      {key:"open-advisory", labelText:"개선권고", count: openGrouped.advisory.length}
    ]);
    html += '<div class="stat" id="statNextCheck" style="cursor:pointer;" title="클릭해서 가장 최근 모의점검 내역 보기"><div class="label">다음 모의점검 권장일</div><div class="value">' + (nextCheckDue ? fmtDate(nextCheckDue) : "미실시") + '</div><div class="sub">' + esc(lr ? ("최근 " + lr.roundLabel + " · 위험 " + dangerCats + " / 주의 " + watchCats + " · 클릭해서 보기 ↗") : "아직 등록된 점검 없음") + '</div></div>';
    html += '</div>';

    html += '<div class="grid-stats">';
    html += statCard("가중처벌 적용기간 내", String(watchActive.length) + '<small>건</small>', "시정명령·시정지시 기준 · 재적발 기준기간이 아직 지나지 않은 항목(개선 완료 여부 무관) · 재적발 시 처벌 가중 위험", watchActive.length>0);
    html += statCard("개선기한 초과", String(overdueStrict.length) + '<small>건</small>', "시정지시·시정명령 기준 · 시정 완료가 지연되고 있는 항목", overdueStrict.length>0);
    html += '</div>';

    var makeWatchLi = function(expired){
      return function(i){
        var statusBadge = i.status === "개선완료" ? '<span class="badge good">개선완료</span>' : '<span class="badge neutral">' + esc(i.status) + '</span>';
        var periodBadge = expired
          ? '<span class="badge neutral">' + fmtDate(i.flags.repeatDeadline) + ' 만료</span>'
          : '<span class="badge warn">D-' + daysUntil(i.flags.repeatDeadline) + ' · ' + fmtDate(i.flags.repeatDeadline) + ' 까지</span>';
        return '<li class="clickable-row" data-goto-insp="' + i.id + '"><div class="wl-main"><span class="wl-cat">' + esc(catName(i.categoryId)) + '</span><span>' + esc(i.violationDesc || i.lawRef || "(내용 미입력)") + '</span></div>' +
          '<div style="display:flex;gap:6px;flex:none;">' + statusBadge + periodBadge + '</div></li>';
      };
    };
    var watchActiveLi = makeWatchLi(false);
    var watchExpiredLi = makeWatchLi(true);
    var bySev = function(sev){ return function(i){ return i.severity === sev; }; };

    html += '<div class="panel"><div class="panel-head"><div><h2>가중처벌 위험구간 워치리스트</h2><div class="desc">최초 적발일로부터 재적발 기준기간이 아직 지나지 않은 시정명령·시정지시 항목입니다(개선 완료 여부와 무관하게 모두 표기, 개선권고와 재적발 기준기간을 0(제한없음)으로 둔 항목은 제외). 이 기간 중 동일 위반이 재적발되면 과태료·처벌이 가중될 수 있습니다.</div></div></div>';
    if (!watchActive.length && !watchExpired.length){
      html += '<div class="empty-row">해당 항목이 없습니다.</div>';
    } else {
      if (!watchActive.length){
        html += '<div class="empty-row">재적발 기준기간이 남아있는 항목이 없습니다.</div>';
      } else {
        html += severityGroupBlock("시정명령", watchActive.filter(bySev("시정명령")), watchActiveLi) +
          severityGroupBlock("시정지시", watchActive.filter(bySev("시정지시")), watchActiveLi);
      }
      if (watchExpired.length){
        html += '<details class="cat" style="margin-top:10px;"><summary><span class="cat-title"><span class="cat-chevron">▸</span>재적발 기준기간이 지난 항목<span class="badge neutral">' + watchExpired.length + '건</span></span></summary><div class="cat-body">' +
          severityGroupBlock("시정명령", watchExpired.filter(bySev("시정명령")), watchExpiredLi) +
          severityGroupBlock("시정지시", watchExpired.filter(bySev("시정지시")), watchExpiredLi) +
        '</div></details>';
      }
    }
    html += '</div>';

    if (overdue.length){
      var overdueLi = function(i){
        return '<li class="clickable-row" data-goto-insp="' + i.id + '"><div class="wl-main"><span class="wl-cat">' + esc(catName(i.categoryId)) + '</span><span>' + esc(i.violationDesc || i.lawRef || "") + '</span></div>' +
          '<span class="badge danger">기한 ' + fmtDate(i.correctionDeadline) + ' 초과</span></li>';
      };
      html += '<div class="panel"><div class="panel-head"><div><h2>개선기한 초과 항목</h2><div class="desc">개선기한을 넘겼지만 아직 완료 처리되지 않은 항목입니다. (시정지시와 개선권고 구분 표기)</div></div></div>';
      html += severityGroupBlock("시정지시/시정명령", overdueStrict, overdueLi) + severityGroupBlock("개선권고", overdueAdvisory, overdueLi);
      html += '</div>';
    }

    el.innerHTML = html;
    var dualActions = {
      "cumulative-strict": function(){ openFindingsListModal("누적 적발 건수 · 시정지시/시정명령", "", inspectionsBySeverityGroup("strict")); },
      "cumulative-advisory": function(){ openFindingsListModal("누적 적발 건수 · 개선권고", "", inspectionsBySeverityGroup("advisory")); },
      "open-strict": function(){ openFindingsListModal("미개선 건수 · 시정지시/시정명령", "진행중·미착수 항목", openGrouped.strict); },
      "open-advisory": function(){ openFindingsListModal("미개선 건수 · 개선권고", "진행중·미착수 항목", openGrouped.advisory); }
    };
    $all("[data-dual-key]", el).forEach(function(row){
      var key = row.getAttribute("data-dual-key");
      row.addEventListener("click", function(){ if (dualActions[key]) dualActions[key](); });
    });
    var nextCheckBtn = document.getElementById("statNextCheck");
    if (nextCheckBtn) nextCheckBtn.addEventListener("click", openLatestSelfCheckModal);
    $all("[data-goto-insp]", el).forEach(function(li){
      li.addEventListener("click", function(){ goToInspection(li.getAttribute("data-goto-insp")); });
    });
  }
  function statCard(label, value, sub, flag){
    return '<div class="stat' + (flag?" flag":"") + '"><div class="label">' + esc(label) + '</div><div class="value">' + value + '</div><div class="sub">' + esc(sub||"") + '</div></div>';
  }
  function dualStatCard(label, rows){
    var rowsHtml = rows.map(function(r){
      return '<div class="stat-dual-row clickable-row" data-dual-key="' + esc(r.key) + '" title="클릭해서 목록 보기"><span class="stat-dual-label">' + esc(r.labelText) + '</span><span class="stat-dual-num">' + r.count + '<small> 건</small></span></div>';
    }).join("");
    return '<div class="stat"><div class="label">' + esc(label) + '</div><div class="stat-dual">' + rowsHtml + '</div></div>';
  }
  function severityGroupBlock(title, items, renderItem){
    if (!items.length) return "";
    return '<div class="sev-group" style="margin-bottom:10px;">' +
      '<div class="sev-group-title" style="font-size:12px;font-weight:700;color:var(--ink-500);margin:8px 0 4px;">' + esc(title) + ' (' + items.length + '건)</div>' +
      '<ul class="watchlist">' + items.map(renderItem).join("") + '</ul>' +
    '</div>';
  }
  function openIssuesListGrouped(){
    var list = openIssuesList();
    return {
      strict: list.filter(function(i){ return i.severity !== "개선권고"; }),
      advisory: list.filter(function(i){ return i.severity === "개선권고"; })
    };
  }
  function openFindingsListModal(title, hintText, list){
    var body = '<h3>' + esc(title) + ' (' + list.length + '건)</h3>' +
      (hintText ? '<p class="hint" style="margin-top:2px;">' + esc(hintText) + '</p>' : '');
    if (!list.length){
      body += '<p class="hint">해당 항목이 없습니다.</p>';
    } else {
      var renderIssueLi = function(i){
        return '<li class="clickable-row" data-goto-insp="' + i.id + '"><div class="wl-main"><span class="wl-cat">' + esc(catName(i.categoryId)) + ' · ' + esc(i.status) + '</span><span>' + esc(i.violationDesc || i.lawRef || "-") + '</span></div>' +
          '<span class="mono" style="font-size:11.5px;color:var(--ink-500);flex:none;">' + fmtDate(i.foundDate) + '</span></li>';
      };
      var sorted = list.slice().sort(function(a,b){ return (b.foundDate||"").localeCompare(a.foundDate||""); });
      body += '<div style="max-height:420px;overflow-y:auto;"><ul class="watchlist">' + sorted.map(renderIssueLi).join("") + '</ul></div>';
    }
    body += '<div class="modal-actions"><button class="btn ghost" id="closeFindingsListModal">닫기</button></div>';
    showModal(body, true);
    document.getElementById("closeFindingsListModal").addEventListener("click", closeModal);
    $all("[data-goto-insp]", document.getElementById("modalRoot")).forEach(function(li){
      li.addEventListener("click", function(){ goToInspection(li.getAttribute("data-goto-insp")); });
    });
  }
  function goToInspection(id){
    closeModal();
    pendingHighlightId = id;
    inspectionViewMode = "byCategory";
    activeTab = "inspections";
    saveUiState();
    render();
  }
  function openLatestSelfCheckModal(){
    var lr = latestRound();
    if (!lr){
      var emptyBody = '<h3>모의점검 내역</h3><p class="hint">아직 등록된 모의점검이 없습니다. 모의점검 탭에서 체크리스트를 작성하고 등록해주세요.</p>' +
        '<div class="modal-actions"><button class="btn ghost" id="closeLatestCheckModal">닫기</button><button class="btn primary" id="gotoSelfCheckTabEmpty">모의점검 탭으로 이동</button></div>';
      showModal(emptyBody, true);
      document.getElementById("closeLatestCheckModal").addEventListener("click", closeModal);
      document.getElementById("gotoSelfCheckTabEmpty").addEventListener("click", function(){
        closeModal(); activeTab = "selfcheck"; saveUiState(); render();
      });
      return;
    }
    var counts = {"적정":0,"부족":0,"위반":0};
    (lr.answers||[]).forEach(function(a){ counts[a.result] = (counts[a.result]||0) + 1; });
    var riskMap = roundCategoryRisk(lr);
    var dangerCats = Object.keys(riskMap).filter(function(k){ return riskMap[k]==="danger"; });
    var watchCats = Object.keys(riskMap).filter(function(k){ return riskMap[k]==="watch"; });
    var body = '<h3>가장 최근 모의점검 내역</h3>' +
      '<div style="margin:8px 0;"><div style="font-weight:700;font-size:15px;">' + esc(lr.roundLabel) + '</div>' +
      '<div style="font-size:12.5px;color:var(--ink-500);margin-top:2px;">점검일 ' + fmtDate(lr.date) + ' · 점검자 ' + esc(lr.checker||"-") + '</div></div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0;">' +
        '<span class="badge good">적정 ' + (counts["적정"]||0) + '</span>' +
        (counts["부족"] ? '<span class="badge warn">부족 ' + counts["부족"] + '</span>' : '') +
        (counts["위반"] ? '<span class="badge danger">위반 ' + counts["위반"] + '</span>' : '') +
      '</div>' +
      (dangerCats.length || watchCats.length ?
        '<div class="item-desc" style="font-size:12.5px;">' +
          (dangerCats.length ? '위험: ' + dangerCats.map(catName).join(", ") : '') +
          (dangerCats.length && watchCats.length ? ' · ' : '') +
          (watchCats.length ? '주의: ' + watchCats.map(catName).join(", ") : '') +
        '</div>' : '') +
      '<div style="font-size:12.5px;font-weight:700;color:var(--ink-500);margin-top:12px;">부족·위반 항목</div>' +
      '<div style="max-height:320px;overflow-y:auto;margin-top:6px;">' + roundDetailTable(lr) + '</div>' +
      '<div class="modal-actions"><button class="btn ghost" id="closeLatestCheckModal">닫기</button><button class="btn primary" id="gotoSelfCheckTab">모의점검 탭으로 이동</button></div>';
    showModal(body, true);
    document.getElementById("closeLatestCheckModal").addEventListener("click", closeModal);
    document.getElementById("gotoSelfCheckTab").addEventListener("click", function(){
      closeModal(); activeTab = "selfcheck"; saveUiState(); render();
    });
  }

  /* ---------- findings tab (flat register) ---------- */
  function renderFindings(){
    var el = document.getElementById("view-findings");
    var html = '<div class="panel-head" style="margin-top:0;"><div><h2 style="font-size:19px;">적발 사항</h2><div class="desc">근로감독에서 적발된 사항을 한 줄씩 빠르게 기록·조회하는 목록입니다. 근거법령·개선방안·자료 링크 등 자세한 내용은 항목을 열어 입력합니다.</div></div>' +
      (editMode ? '<button class="btn primary sm" id="btnAddFinding">+ 새 적발사항 추가</button>' : '') + '</div>';

    html += '<details class="cat" style="margin-bottom:12px;"><summary><span class="cat-title"><span class="cat-chevron">▸</span>시정지시 · 시정명령 · 개선권고란?</span></summary>' +
      '<div class="cat-body" style="font-size:13px;line-height:1.6;color:var(--ink-700);">' +
        '<div><b>시정지시</b> — 근로감독 결과 법 위반사항이 확인되었을 때, 근로감독관이 사업주에게 일정 기한 내 스스로 고치도록 통보하는 행정지도 성격의 1차 조치입니다. 통상 "시정지시서"로 서면 통보되며, 기한 내 이행하면 별도 처벌 없이 종결됩니다.</div>' +
        '<div><b>시정명령</b> — 관계법령에 근거해 고용노동관서장이 발하는 보다 공식적인 처분으로, 시정지시보다 강한 행정조치입니다. 기한까지 이행하지 않으면 과태료 부과나 사법처리로 이어질 수 있습니다. (실무상 두 용어가 혼용되기도 하니 실제 통지서상의 명칭을 함께 확인하는 것이 좋습니다.)</div>' +
        '<div><b>개선권고</b> — 근로감독 과정에서 감독관이 리스크로 지적하였지만, 시정지시서·시정명령서에는 최종 포함되지 않은 사항입니다. 공식 처분은 아니지만 향후 동일 사안이 재적발될 경우를 대비해 관리 유의가 필요합니다.</div>' +
        '<div style="color:var(--ink-500);font-size:12px;">※ 위 구분은 일반적인 행정 실무 기준이며, 개별 사안의 정확한 법적 성격은 실제 통지서 문구와 담당 노무사·변호사 확인을 통해 판단하시기 바랍니다.</div>' +
      '</div>' +
    '</details>';

    var all = state.inspections;
    var list = all.slice();
    if (findingsFilter.severity !== "all") list = list.filter(function(i){ return i.severity === findingsFilter.severity; });
    if (findingsFilter.status !== "all") list = list.filter(function(i){ return i.status === findingsFilter.status; });
    list.sort(function(a,b){ return (b.foundDate||"").localeCompare(a.foundDate||""); });

    html += '<div class="panel" style="padding:14px 16px;display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;">' +
      filterSelect("항목구분", "filterSeverity", findingsFilter.severity, [["all","전체"],["시정명령","시정명령"],["시정지시","시정지시"],["개선권고","개선권고"]]) +
      filterSelect("개선여부", "filterStatus", findingsFilter.status, [["all","전체"],["미착수","미착수"],["진행중","진행중"],["개선완료","개선완료"]]) +
      (list.length !== all.length ? '<span class="badge neutral">' + list.length + ' / ' + all.length + '건 표시 중</span>' : '') +
      ((findingsFilter.severity !== "all" || findingsFilter.status !== "all") ? '<button class="btn sm ghost" id="btnResetFilter">필터 초기화</button>' : '') +
    '</div>';

    html += '<div class="panel scrollx"><table class="tbl"><thead><tr>' +
      '<th>항목구분</th><th>카테고리</th><th>내용</th><th>감독 일시</th><th>개선 여부</th><th>개선 일자</th><th>보고 일자</th><th>과태료</th><th>재적발 제한일</th>' +
      (editMode ? '<th></th>' : '') + '</tr></thead><tbody>';

    if (!all.length){
      html += '<tr><td colspan="10" class="empty-row">등록된 적발사항이 없습니다.</td></tr>';
    } else if (!list.length){
      html += '<tr><td colspan="10" class="empty-row">선택한 조건에 해당하는 적발사항이 없습니다.</td></tr>';
    } else {
      list.forEach(function(i){
        var flags = computeInspectionFlags(i);
        var sevBadge = severityBadge(i.severity);
        var statusBadge = i.status === "개선완료" ? '<span class="badge good">개선완료</span>' : (flags.overdue ? '<span class="badge danger">기한초과</span>' : '<span class="badge neutral">' + esc(i.status) + '</span>');
        html += '<tr>' +
          '<td>' + sevBadge + '</td>' +
          '<td>' + esc(catName(i.categoryId)) + '</td>' +
          '<td style="max-width:280px;">' + esc(i.violationDesc || i.lawRef || "-") + '</td>' +
          '<td class="mono">' + fmtDate(i.foundDate) + '</td>' +
          '<td>' + statusBadge + '</td>' +
          '<td class="mono">' + (i.correctionCompletedDate ? fmtDate(i.correctionCompletedDate) : "-") + '</td>' +
          '<td class="mono">' + (i.reportDate ? fmtDate(i.reportDate) : "-") + '</td>' +
          '<td>' + (i.fineImposed === "부과" ? '<span class="badge warn">부과</span>' : '<span class="badge neutral">미부과</span>') + '</td>' +
          '<td class="mono">' + repeatDeadlineText(flags) + '</td>' +
          (editMode ? ('<td style="white-space:nowrap;"><button class="btn sm" data-edit-finding="' + i.id + '">수정</button> <button class="btn sm danger" data-del-insp="' + i.id + '">삭제</button></td>') : '') +
        '</tr>';
      });
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;

    var sevSel = document.getElementById("filterSeverity");
    var statSel = document.getElementById("filterStatus");
    if (sevSel) sevSel.addEventListener("change", function(){ findingsFilter.severity = sevSel.value; renderFindings(); });
    if (statSel) statSel.addEventListener("change", function(){ findingsFilter.status = statSel.value; renderFindings(); });
    var resetBtn = document.getElementById("btnResetFilter");
    if (resetBtn) resetBtn.addEventListener("click", function(){ findingsFilter = {severity:"all", status:"all"}; renderFindings(); });

    if (editMode){
      var addBtn = document.getElementById("btnAddFinding");
      if (addBtn) addBtn.addEventListener("click", function(){ openFindingModal(null); });
      $all("[data-edit-finding]", el).forEach(function(btn){
        btn.addEventListener("click", function(){
          var id = btn.getAttribute("data-edit-finding");
          var insp = state.inspections.filter(function(x){ return x.id === id; })[0];
          openFindingModal(insp);
        });
      });
    }
    bindDeleteInspection(el);
  }
  function severityBadge(sev){
    if (sev === "시정명령") return '<span class="badge danger">시정명령</span>';
    if (sev === "시정지시") return '<span class="badge info">시정지시</span>';
    return '<span class="badge warn">개선권고</span>';
  }
  function filterSelect(label, id, val, options){
    var opts = options.map(function(o){ return '<option value="' + o[0] + '"' + (o[0]===val?" selected":"") + '>' + o[1] + '</option>'; }).join("");
    return '<label style="display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;color:var(--ink-500);">' + esc(label) +
      '<select id="' + id + '" style="padding:7px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;background:var(--surface);color:var(--ink-900);min-width:130px;">' + opts + '</select></label>';
  }

  function openFindingModal(insp){
    var defaultCat = insp ? insp.categoryId : (state.categories[0] ? state.categories[0].id : "");
    var draft = insp || newInspectionDraft(defaultCat);
    var body = '<h3>' + (insp ? "적발사항 수정" : "새 적발사항 추가") + '</h3><div id="findingFormHost"></div>';
    showModal(body, true);
    var host = document.getElementById("findingFormHost");
    host.innerHTML = inspectionForm(draft, defaultCat);
    bindInspectionForm(host, draft, defaultCat, closeModal);
  }

  /* ---------- inspections tab (categorized detail archive) ---------- */
  function renderInspections(){
    var el = document.getElementById("view-inspections");
    var curRound = selectedRoundId ? roundById(selectedRoundId) : null;
    var html = '<div class="panel-head" style="margin-top:0;"><div><h2 style="font-size:19px;">근로감독 이력 관리</h2><div class="desc">노동관계법령 카테고리별로 실제 근로감독에서 적발된 사항의 상세 이력을 관리합니다. 각 항목의 재적발 기준기간(기본 3년)이 지나기 전 같은 위반이 재적발되면 처벌이 가중될 수 있습니다.</div></div></div>';

    html += '<div style="display:flex;align-items:center;gap:10px;margin:-4px 0 16px;flex-wrap:wrap;">' +
      '<div style="display:flex;gap:6px;">' +
        '<button class="btn sm' + (inspectionViewMode === "byCategory" ? " primary" : "") + '" id="btnViewByCategory">항목별 이력</button>' +
        '<button class="btn sm' + (inspectionViewMode === "byRound" ? " primary" : "") + '" id="btnViewByRound">감독 시기별 이력</button>' +
      '</div>' +
      (inspectionViewMode === "byRound" && curRound ? ('<button type="button" class="btn sm ghost" id="btnChangeRound">📅 ' + esc(curRound.label) + ' · 시기 변경</button>') : '') +
    '</div>';

    if (inspectionViewMode === "byRound"){
      if (!curRound){
        html += '<div class="panel"><div class="empty-row">아직 선택된 감독 시기가 없습니다.</div>' +
          '<div style="padding:0 16px 16px;"><button class="btn primary sm" id="btnPickRoundEmpty">감독 시기 선택하기</button></div></div>';
      } else {
        html += renderRoundMetaAndMaterials(curRound);
        var roundItems = state.inspections.filter(function(i){ return i.roundId === curRound.id; });
        html += renderCategoryGroups(roundItems, {addPresetRoundId: curRound.id, hideEmpty: true});
        if (!roundItems.length){
          html += '<div class="panel"><div class="empty-row">이 감독 시기에 연결된 적발 이력이 없습니다. 아래 카테고리에서 새로 추가하거나, 기존 적발 이력을 수정해 이 시기와 연결해주세요.</div></div>';
        }
      }
    } else {
      html += renderCategoryGroups(state.inspections, {});
    }

    el.innerHTML = html;

    var b1 = document.getElementById("btnViewByCategory");
    var b2 = document.getElementById("btnViewByRound");
    if (b1) b1.addEventListener("click", function(){ inspectionViewMode = "byCategory"; saveUiState(); renderInspections(); });
    if (b2) b2.addEventListener("click", function(){ inspectionViewMode = "byRound"; saveUiState(); renderInspections(); openRoundPicker(); });
    var chg = document.getElementById("btnChangeRound");
    if (chg) chg.addEventListener("click", openRoundPicker);
    var pickEmpty = document.getElementById("btnPickRoundEmpty");
    if (pickEmpty) pickEmpty.addEventListener("click", openRoundPicker);

    if (inspectionViewMode === "byRound" && curRound){
      if (editMode){
        var matHost = document.getElementById("roundMaterialFormHost");
        if (matHost){ matHost.innerHTML = roundMaterialForm(); bindRoundMaterialForm(matHost, curRound.id); }
        bindEditRoundButton(el);
        bindDeleteRound(el);
      }
      bindDeleteRoundMaterial(el);
      bindDeleteRoundAttachment(el);
    }

    wireAddInspButtons(el);
    bindInspectionCardActions(el);
    bindDeleteInspection(el);

    if (pendingHighlightId){
      var targetId = pendingHighlightId;
      pendingHighlightId = null;
      var targetEl = document.getElementById("insp-" + targetId);
      if (targetEl){
        targetEl.scrollIntoView({behavior:"smooth", block:"center"});
        targetEl.classList.add("flash-highlight");
        setTimeout(function(){ targetEl.classList.remove("flash-highlight"); }, 2200);
      }
    }
  }

  function renderCategoryGroups(itemsAll, opts){
    opts = opts || {};
    var html = "";
    state.categories.forEach(function(cat){
      var items = itemsAll.filter(function(i){ return i.categoryId === cat.id; });
      if (opts.hideEmpty && !items.length) return;
      var openN = items.filter(function(i){ return i.status !== "개선완료"; }).length;
      html += '<details class="cat"' + (items.length ? ' open' : '') + '>';
      html += '<summary><span class="cat-title"><span class="cat-chevron">▸</span>' + esc(cat.name) + '<span class="badge neutral">' + items.length + '건</span></span>' +
              '<span class="cat-counts">' + (openN ? '<span class="badge warn">미개선 ' + openN + '</span>' : '') + '</span></summary>';
      html += '<div class="cat-body">';
      if (!items.length){
        html += '<div class="empty-row">등록된 적발 이력이 없습니다.</div>';
      } else {
        items.forEach(function(i){ html += inspectionCard(i); });
      }
      if (editMode){
        var formId = "addform-" + cat.id + (opts.addPresetRoundId ? "-" + opts.addPresetRoundId : "");
        html += '<button class="btn sm" data-add-insp="' + cat.id + '"' + (opts.addPresetRoundId ? ' data-add-insp-round="' + opts.addPresetRoundId + '"' : '') + ' data-add-form-id="' + formId + '">+ 이 카테고리에 적발 이력 추가</button>';
        html += '<div class="add-card" style="display:none;" id="' + formId + '"></div>';
      }
      html += '</div></details>';
    });
    return html;
  }

  function wireAddInspButtons(el){
    $all("[data-add-insp]", el).forEach(function(btn){
      btn.addEventListener("click", function(){
        var catId = btn.getAttribute("data-add-insp");
        var presetRoundId = btn.getAttribute("data-add-insp-round") || "";
        var formId = btn.getAttribute("data-add-form-id");
        var host = document.getElementById(formId);
        var show = host.style.display === "none";
        host.style.display = show ? "block" : "none";
        if (show){ var draft = newInspectionDraft(catId, presetRoundId); host.innerHTML = inspectionForm(draft, catId, presetRoundId); bindInspectionForm(host, draft, catId); }
      });
    });
  }

  /* ---------- 감독 시기별 이력: round picker popup + per-round materials ---------- */
  function openRoundPicker(){
    var rounds = (state.inspectionRounds||[]).slice().sort(function(a,b){ return (b.date||"").localeCompare(a.date||""); });
    var body = '<h3>감독 시기 선택</h3><div style="display:flex;flex-direction:column;gap:8px;margin-top:12px;max-height:50vh;overflow-y:auto;">';
    if (!rounds.length){
      body += '<div class="empty-row">등록된 감독 시기가 없습니다.</div>';
    } else {
      rounds.forEach(function(r){
        var cnt = state.inspections.filter(function(i){ return i.roundId === r.id; }).length;
        var active = r.id === selectedRoundId;
        body += '<button type="button" class="round-pick-item" data-pick-round="' + r.id + '" style="text-align:left;padding:12px 14px;border:1px solid ' + (active?'var(--accent-700)':'var(--line)') + ';border-radius:10px;background:' + (active?'var(--accent-050)':'var(--surface)') + ';cursor:pointer;color:var(--ink-900);font-family:var(--font-body);">' +
          '<div style="font-weight:700;">' + esc(r.label) + '</div>' +
          '<div style="font-size:12px;color:var(--ink-500);margin-top:3px;">' + (r.date ? fmtDate(r.date) : "일자 미상") + (r.agency ? ' · ' + esc(r.agency) : '') + (r.type ? ' · ' + esc(r.type) + '감독' : '') + ' · 적발 ' + cnt + '건</div>' +
        '</button>';
      });
    }
    body += '</div>';
    if (editMode){
      body += '<div style="border-top:1px solid var(--line-soft);margin-top:14px;padding-top:14px;">' +
        '<button type="button" class="btn sm" id="btnNewRoundToggle">+ 새 감독 시기 추가</button>' +
        '<div id="newRoundFormHost" style="display:none;margin-top:10px;"></div>' +
      '</div>';
    }
    body += '<div class="modal-actions" style="margin-top:16px;"><button class="btn ghost" id="roundPickClose">닫기</button></div>';
    showModal(body, true);
    $all("[data-pick-round]").forEach(function(btn){
      btn.addEventListener("click", function(){
        selectedRoundId = btn.getAttribute("data-pick-round");
        inspectionViewMode = "byRound";
        saveUiState();
        closeModal();
        renderInspections();
      });
    });
    var closeBtn = document.getElementById("roundPickClose");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (editMode){
      var newBtn = document.getElementById("btnNewRoundToggle");
      var newHost = document.getElementById("newRoundFormHost");
      if (newBtn) newBtn.addEventListener("click", function(){
        var show = newHost.style.display === "none";
        newHost.style.display = show ? "block" : "none";
        if (show){ newHost.innerHTML = newRoundForm(); bindNewRoundForm(newHost); }
      });
    }
  }
  function newRoundForm(){
    return '<form class="f" id="newRoundForm">' +
      field("감독 시기 명칭 *", 'input', 'label', "", 'text', '예: 2026년 정기근로감독') +
      field("감독 일자", 'input', 'date', todayStr(), 'date') +
      selectField("감독구분", 'type', "정기", [["정기","정기"],["수시","수시"],["특별","특별"],["기타","기타"]]) +
      field("감독기관", 'input', 'agency', "", 'text', '예: 서울관악지청') +
      field("대상 사업장", 'input', 'target', "", 'text') +
      field("담당 부서", 'input', 'department', "", 'text', '예: 인사팀') +
      fieldFull("비고", 'textarea', 'notes', "") +
      '<div class="full">' +
        '<label style="margin-bottom:4px;display:block;">첨부목록 (선택, 모든 파일 형식 업로드 가능)</label>' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<button type="button" class="btn sm" id="roundAttachAddBtn">+ 파일 추가</button>' +
          '<input type="file" id="roundAttachInput" multiple style="display:none;">' +
          '<span id="roundAttachStatus" style="font-size:12px;color:var(--ink-500);"></span>' +
        '</div>' +
        '<div id="roundAttachListHost" style="margin-top:8px;"></div>' +
        '<div class="hint" style="font-size:11.5px;color:var(--ink-500);margin-top:4px;">PDF/이미지 파일은 첨부 후 내용을 AI로 읽어 근로감독 이력에 자동 입력할지 물어봅니다. (엑셀·워드·한글 등 다른 형식도 업로드는 되지만 AI 자동인식은 지원되지 않습니다.)</div>' +
      '</div>' +
      '<div class="form-actions"><button type="submit" class="btn primary sm">추가</button></div>' +
    '</form>';
  }
  function bindNewRoundForm(host){
    var form = host.querySelector("#newRoundForm");
    if (!form) return;
    var pendingAttachments = [];
    var listHost = host.querySelector("#roundAttachListHost");
    var statusEl = host.querySelector("#roundAttachStatus");
    var addBtn = host.querySelector("#roundAttachAddBtn");
    var fileInput = host.querySelector("#roundAttachInput");
    var submitBtn = form.querySelector('button[type="submit"]');

    function renderList(){
      listHost.innerHTML = renderAttachmentList(pendingAttachments, "del-pending-round-attach");
      $all("[data-del-pending-round-attach]", listHost).forEach(function(btn){
        btn.addEventListener("click", function(){
          var id = btn.getAttribute("data-del-pending-round-attach");
          pendingAttachments = pendingAttachments.filter(function(f){ return f.id !== id; });
          renderList();
        });
      });
    }
    renderList();

    if (addBtn) addBtn.addEventListener("click", function(){ fileInput.click(); });
    if (fileInput) fileInput.addEventListener("change", function(){
      var files = Array.prototype.slice.call(fileInput.files||[]);
      fileInput.value = "";
      if (!files.length) return;
      statusEl.textContent = "업로드 중...";
      addBtn.disabled = true;
      (async function(){
        for (var i=0;i<files.length;i++){
          var res = await uploadOneFile(files[i], "attachments/rounds");
          if (res.ok){ pendingAttachments.push(Object.assign({}, res.meta, {file: res.file})); }
          else { alert(res.message); }
        }
        statusEl.textContent = "";
        addBtn.disabled = false;
        renderList();
      })();
    });

    form.addEventListener("submit", function(e){
      e.preventDefault();
      var fd = new FormData(form);
      if (!fd.get("label")){ alert("감독 시기 명칭은 필수입니다."); return; }
      var r = { id: uid(), label: fd.get("label"), date: fd.get("date")||todayStr(), type: fd.get("type"), agency: fd.get("agency")||"", target: fd.get("target")||"", department: fd.get("department")||"", notes: fd.get("notes")||"",
        materials: [],
        attachments: pendingAttachments.map(function(f){ return {id:f.id, name:f.name, path:f.path, contentType:f.contentType, size:f.size, uploadedDate:f.uploadedDate}; }),
        createdAt: new Date().toISOString() };
      state.inspectionRounds.push(r);
      selectedRoundId = r.id;
      inspectionViewMode = "byRound";
      saveUiState();
      closeModal();
      if (pendingAttachments.length){
        processRoundAttachmentsForAutofill(r, pendingAttachments, "감독 시기 추가: " + r.label);
      } else {
        commit("감독 시기 추가: " + r.label);
      }
    });
  }
  // Shared by both (1) creating a new 감독 시기 with attachments, and (2) adding a
  // 자료 to an EXISTING round via "자료 추가" — either flow saves the file(s) first,
  // then offers to auto-fill 적발 이력 from their content. `baseCommitMsg` is the
  // commit message used when there's nothing to auto-fill (or the user declines);
  // when the user accepts, the AI-filled item count is appended to it.
  async function processRoundAttachmentsForAutofill(round, attachmentsWithFiles, baseCommitMsg){
    if (!sb){
      commit(baseCommitMsg);
      toast("첨부파일이 저장되었습니다. 저장소 연결이 없어 AI 자동인식을 사용할 수 없습니다.");
      return;
    }
    var recognizable = attachmentsWithFiles.filter(function(a){ var ext = extOf(a.name); return a.file && (ext === "pdf" || IMAGE_EXTS.indexOf(ext) !== -1); });
    if (!recognizable.length){
      commit(baseCommitMsg);
      toast("첨부파일이 저장되었습니다. (PDF/이미지 파일만 AI 자동인식이 가능합니다 — 적발 이력은 직접 입력해주세요.)");
      return;
    }
    toast("첨부파일 내용을 분석하는 중입니다...");
    try {
      var extracted = await extractFindingsFromAttachments(recognizable);
      var items = (extracted && extracted.items) ? extracted.items.filter(function(it){ return it && (it.violationDesc || it.lawRef); }) : [];
      if (!items.length){
        commit(baseCommitMsg);
        toast("첨부파일이 저장되었습니다. 첨부파일에서 적발 항목을 인식하지 못했습니다 — 직접 입력해주세요.");
        return;
      }
      showAutofillConfirm(round, items, baseCommitMsg);
    } catch(err){
      commit(baseCommitMsg);
      var msg = (err && err.message) ? err.message : "AI 자동인식 중 오류가 발생했습니다";
      toast("첨부파일이 저장되었습니다. " + msg + " — 적발 이력은 직접 입력해주세요.");
    }
  }
  function showAutofillConfirm(round, items, baseCommitMsg){
    var body = '<h3>이 자료로 이력을 자동 등록하시겠습니까?</h3>' +
      '<p class="hint">첨부파일에서 <b>' + items.length + '건</b>의 적발/지적 사항을 인식했습니다. 아래 내용을 근로감독 이력에 자동으로 등록할까요? 등록 후에도 각 항목은 직접 수정할 수 있습니다.</p>' +
      '<div style="max-height:280px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;margin:10px 0;">' +
      items.map(function(it){
        return '<div class="item-card" style="padding:9px 11px;">' +
          '<div style="font-weight:700;font-size:13px;">' + esc(it.categoryName||"미분류") + ' · ' + esc(it.severity||"-") + '</div>' +
          '<div style="font-size:12.5px;color:var(--ink-500);margin-top:2px;">' + esc(it.violationDesc || it.lawRef || "-") + '</div>' +
        '</div>';
      }).join("") +
      '</div>' +
      '<div class="modal-actions"><button class="btn ghost" id="autofillNo">아니오 (직접 입력)</button><button class="btn primary" id="autofillYes">예 (자동 입력)</button></div>';
    showModal(body, true);
    document.getElementById("autofillNo").addEventListener("click", function(){
      closeModal();
      commit(baseCommitMsg);
      toast("첨부파일이 저장되었습니다. 직접 이력을 입력해주세요.");
    });
    document.getElementById("autofillYes").addEventListener("click", function(){
      closeModal();
      items.forEach(function(it){
        var catId = matchCategoryByName(it.categoryName);
        var obj = {
          id: uid(), createdAt: new Date().toISOString(), links: [], correctionEvidenceFiles: [],
          categoryId: catId, roundId: round.id, inspectionRound: round.label,
          severity: (it.severity === "개선권고" ? "개선권고" : (it.severity === "시정지시" ? "시정지시" : "시정명령")),
          lawRef: it.lawRef || "", foundDate: it.foundDate || round.date || todayStr(),
          inspectionType: round.type || "정기", status: "미착수",
          disposition: it.disposition || "", dispositionAmount: it.dispositionAmount ? Number(it.dispositionAmount) : null,
          fineImposed: it.fineImposed === "부과" ? "부과" : "미부과",
          repeatWindowYears: state.meta.defaultRepeatWindowYears,
          correctionDeadline: it.correctionDeadline || "", correctionCompletedDate: "", reportDate: "",
          violationDesc: it.violationDesc || "", correctionPlan: it.correctionPlan || "", correctionResult: "", notes: ""
        };
        state.inspections.push(obj);
      });
      commit(baseCommitMsg + " · AI 자동 입력 " + items.length + "건");
      toast(items.length + "건이 근로감독 이력에 자동 입력되었습니다. 내용을 확인해주세요.");
    });
  }
  function renderRoundMetaAndMaterials(round){
    var html = '<div class="panel">' +
      '<div class="panel-head"><div><h2 style="font-size:16px;">' + esc(round.label) + '</h2>' +
      '<div class="desc">' + (round.date ? fmtDate(round.date) : "일자 미상") + (round.agency ? ' · ' + esc(round.agency) : '') + (round.target ? ' · ' + esc(round.target) : '') + (round.type ? ' · ' + esc(round.type) + '감독' : '') + (round.department ? ' · 담당 ' + esc(round.department) : '') + '</div></div>' +
      (editMode ? ('<div style="display:flex;gap:6px;flex-shrink:0;"><button class="btn sm" data-edit-round="' + round.id + '">수정</button><button class="btn sm danger" data-del-round="' + round.id + '">삭제</button></div>') : '') +
    '</div>';
    if (editMode) html += '<div id="roundEditFormHost" style="display:none;margin:0 0 12px;"></div>';
    if (round.notes) html += '<div class="item-desc" style="color:var(--ink-500);">' + esc(round.notes) + '</div>';
    if ((round.attachments||[]).length){
      html += '<div class="panel-head" style="margin-top:14px;"><div><h2 style="font-size:14px;">첨부목록</h2></div></div>';
      html += renderAttachmentList(round.attachments, editMode ? "del-round-attach" : null, round.id);
    }
    html += '<div class="panel-head" style="margin-top:14px;"><div><h2 style="font-size:14px;">이 시기 관련 자료 (제출자료 / 시정지시서·명령서 / 보고자료 등)</h2></div></div>';
    var mats = round.materials || [];
    html += '<div class="scrollx"><table class="tbl"><thead><tr><th>구분</th><th>자료명</th><th>파일/링크</th><th>등록일</th><th>비고</th>' + (editMode?'<th></th>':'') + '</tr></thead><tbody>';
    if (!mats.length){
      html += '<tr><td colspan="6" class="empty-row">등록된 자료가 없습니다.</td></tr>';
    } else {
      mats.slice().sort(function(a,b){ return (b.uploadedDate||"").localeCompare(a.uploadedDate||""); }).forEach(function(m){
        var openLink = m.file ? ('<a href="#" data-storage-path="' + esc(m.file.path) + '">📎 ' + esc(m.file.name) + '</a> <a href="#" data-storage-download-path="' + esc(m.file.path) + '" data-storage-download-name="' + esc(m.file.name) + '" style="font-size:11px;">다운로드</a>') :
          (m.url ? ('<a href="' + esc(m.url) + '" target="_blank" rel="noopener">열기 ↗</a>') : '-');
        html += '<tr><td>' + esc(m.kind) + '</td><td>' + esc(m.name) + '</td>' +
          '<td>' + openLink + '</td>' +
          '<td class="mono">' + fmtDate(m.uploadedDate) + '</td><td>' + esc(m.notes||"-") + '</td>' +
          (editMode ? ('<td><button class="btn sm danger" data-del-round-material="' + round.id + '|' + m.id + '">삭제</button></td>') : '') + '</tr>';
      });
    }
    html += '</tbody></table></div>';
    if (editMode){
      html += '<div id="roundMaterialFormHost" style="margin-top:12px;"></div>';
    }
    html += '</div>';
    return html;
  }
  function roundMaterialForm(){
    return '<form class="f" id="roundMaterialForm">' +
      selectField("구분 *", 'kind', "제출자료", [["제출자료","제출자료"],["시정지시서/명령서","시정지시서/명령서"],["보고자료(내부용)","보고자료(내부용)"],["보고자료(노동부)","보고자료(노동부)"],["기타","기타"]]) +
      field("자료명 *", 'input', 'name', "", 'text', '예: 2026년 정기감독 제출자료') +
      '<div class="full">' +
        '<label style="margin-bottom:4px;display:block;">파일 업로드 (모든 파일 형식 가능 — PDF/이미지는 AI 자동인식 지원)</label>' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<button type="button" class="btn sm" id="matAttachAddBtn">+ 파일 추가</button>' +
          '<input type="file" id="matAttachInput" style="display:none;">' +
          '<span id="matAttachStatus" style="font-size:12px;color:var(--ink-500);"></span>' +
        '</div>' +
        '<div id="matAttachListHost" style="margin-top:8px;"></div>' +
      '</div>' +
      field("자료 링크 (선택)", 'input', 'url', "", 'url', 'https://...') +
      field("등록일", 'input', 'uploadedDate', todayStr(), 'date') +
      fieldFull("비고", 'textarea', 'notes', "") +
      '<div class="form-actions"><button type="submit" class="btn primary sm">자료 추가</button></div>' +
    '</form>';
  }
  function bindRoundMaterialForm(host, roundId){
    var form = host.querySelector("#roundMaterialForm");
    if (!form) return;
    var pendingFile = null;
    var pendingFileBlob = null; // the raw File object, kept alongside pendingFile's serializable meta — needed for AI extraction, never written into state
    var listHost = host.querySelector("#matAttachListHost");
    var addBtn = host.querySelector("#matAttachAddBtn");
    var fileInput = host.querySelector("#matAttachInput");
    var statusEl = host.querySelector("#matAttachStatus");

    function renderList(){
      listHost.innerHTML = pendingFile ? renderAttachmentList([pendingFile], "del-pending-material") : '';
      $all("[data-del-pending-material]", listHost).forEach(function(btn){
        btn.addEventListener("click", function(){ pendingFile = null; pendingFileBlob = null; renderList(); });
      });
    }
    renderList();
    if (addBtn) addBtn.addEventListener("click", function(){ fileInput.click(); });
    if (fileInput) fileInput.addEventListener("change", function(){
      var files = Array.prototype.slice.call(fileInput.files||[]);
      fileInput.value = "";
      if (!files.length) return;
      statusEl.textContent = "업로드 중...";
      addBtn.disabled = true;
      (async function(){
        var res = await uploadOneFile(files[0], "attachments/round-materials/" + roundId);
        if (res.ok){ pendingFile = res.meta; pendingFileBlob = res.file; }
        else { alert(res.message); }
        statusEl.textContent = "";
        addBtn.disabled = false;
        renderList();
      })();
    });

    form.addEventListener("submit", function(e){
      e.preventDefault();
      var fd = new FormData(form);
      var materialName = fd.get("name");
      if (!materialName){ alert("자료명은 필수입니다."); return; }
      if (!pendingFile && !fd.get("url")){ alert("파일을 업로드하거나 자료 링크를 입력해주세요."); return; }
      var round = roundById(roundId);
      if (!round) return;
      if (!round.materials) round.materials = [];
      round.materials.push({
        id: uid(), kind: fd.get("kind"), name: materialName,
        file: pendingFile ? { id: pendingFile.id, name: pendingFile.name, path: pendingFile.path, contentType: pendingFile.contentType, size: pendingFile.size } : null,
        url: fd.get("url") || "",
        uploadedDate: fd.get("uploadedDate")||todayStr(), notes: fd.get("notes")||"", createdAt: new Date().toISOString()
      });
      var baseMsg = "감독 시기 자료 추가: " + materialName;
      if (pendingFile && pendingFileBlob){
        // Same AI auto-fill pipeline used when attaching files at round-creation time:
        // save first (already done above), then offer to auto-fill 적발 이력 from the file.
        processRoundAttachmentsForAutofill(round, [{ name: pendingFile.name, file: pendingFileBlob }], baseMsg);
      } else {
        commit(baseMsg);
      }
    });
  }
  function bindDeleteRoundMaterial(root){
    $all("[data-del-round-material]", root).forEach(function(btn){
      btn.addEventListener("click", function(){
        var parts = btn.getAttribute("data-del-round-material").split("|");
        var roundId = parts[0], matId = parts[1];
        confirmModal("이 자료를 삭제할까요?", function(){
          var round = roundById(roundId);
          if (round) round.materials = (round.materials||[]).filter(function(m){ return m.id !== matId; });
          commit("감독 시기 자료 삭제");
        });
      });
    });
  }
  function bindDeleteRoundAttachment(root){
    $all("[data-del-round-attach]", root).forEach(function(btn){
      btn.addEventListener("click", function(){
        var parts = btn.getAttribute("data-del-round-attach").split("|");
        var roundId = parts[0], attId = parts[1];
        confirmModal("이 첨부파일을 목록에서 삭제할까요?", function(){
          var round = roundById(roundId);
          if (round) round.attachments = (round.attachments||[]).filter(function(a){ return a.id !== attId; });
          commit("감독 시기 첨부목록 삭제");
        });
      });
    });
  }
  function roundEditForm(round){
    return '<form class="f" id="roundEditForm">' +
      field("감독 시기 명칭 *", 'input', 'label', round.label, 'text', '예: 2026년 정기근로감독') +
      field("감독 일자", 'input', 'date', round.date||todayStr(), 'date') +
      selectField("감독구분", 'type', round.type||"정기", [["정기","정기"],["수시","수시"],["특별","특별"],["기타","기타"]]) +
      field("감독기관", 'input', 'agency', round.agency||"", 'text', '예: 서울관악지청') +
      field("대상 사업장", 'input', 'target', round.target||"", 'text') +
      field("담당 부서", 'input', 'department', round.department||"", 'text', '예: 인사팀') +
      fieldFull("비고", 'textarea', 'notes', round.notes||"") +
      '<div class="form-actions"><button type="button" class="btn ghost sm" data-cancel-form="1">취소</button><button type="submit" class="btn primary sm">저장</button></div>' +
    '</form>';
  }
  function bindEditRoundButton(root){
    $all("[data-edit-round]", root).forEach(function(btn){
      btn.addEventListener("click", function(){
        var id = btn.getAttribute("data-edit-round");
        var round = roundById(id);
        if (!round) return;
        var host = document.getElementById("roundEditFormHost");
        if (!host) return;
        var show = host.style.display === "none";
        host.style.display = show ? "block" : "none";
        if (show){ host.innerHTML = roundEditForm(round); bindRoundEditForm(host, round.id); }
        else { host.innerHTML = ""; }
      });
    });
  }
  function bindRoundEditForm(host, roundId){
    var form = host.querySelector("#roundEditForm");
    if (!form) return;
    var cancel = form.querySelector("[data-cancel-form]");
    if (cancel) cancel.addEventListener("click", function(){ host.style.display = "none"; host.innerHTML = ""; });
    form.addEventListener("submit", function(e){
      e.preventDefault();
      var fd = new FormData(form);
      if (!fd.get("label")){ alert("감독 시기 명칭은 필수입니다."); return; }
      var round = roundById(roundId);
      if (!round) return;
      round.label = fd.get("label");
      round.date = fd.get("date") || round.date || "";
      round.type = fd.get("type");
      round.agency = fd.get("agency") || "";
      round.target = fd.get("target") || "";
      round.department = fd.get("department") || "";
      round.notes = fd.get("notes") || "";
      commit("감독 시기 수정: " + round.label);
    });
  }
  function bindDeleteRound(root){
    $all("[data-del-round]", root).forEach(function(btn){
      btn.addEventListener("click", function(){
        var id = btn.getAttribute("data-del-round");
        var round = roundById(id);
        if (!round) return;
        var linkedCount = state.inspections.filter(function(i){ return i.roundId === id; }).length;
        var msg = "이 감독 시기(" + round.label + ")를 삭제할까요? 되돌릴 수 없습니다." +
          (linkedCount ? (" 연결된 적발 이력 " + linkedCount + "건은 삭제되지 않고 이 시기와의 연결만 해제됩니다.") : "");
        confirmModal(msg, function(){
          state.inspections.forEach(function(i){ if (i.roundId === id) i.roundId = ""; });
          state.inspectionRounds = state.inspectionRounds.filter(function(r){ return r.id !== id; });
          if (selectedRoundId === id) selectedRoundId = null;
          saveUiState();
          commit("감독 시기 삭제: " + round.label);
        });
      });
    });
  }

  function inspectionCard(i){
    var flags = computeInspectionFlags(i);
    var sevBadge = severityBadge(i.severity);
    var statusBadge = i.status === "개선완료" ? '<span class="badge good">개선완료</span>' : (flags.overdue ? '<span class="badge danger">기한초과</span>' : '<span class="badge neutral">' + esc(i.status) + '</span>');
    var repeatBadge = flags.withinWindow ? '<span class="badge warn">재적발 위험 · D-' + daysUntil(flags.repeatDeadline) + '</span>' : '';
    var editBtns = editMode ? '<div class="item-actions"><button class="btn sm" data-edit-insp="' + i.id + '">수정</button><button class="btn sm danger" data-del-insp="' + i.id + '">삭제</button></div>' : '';
    var links = (i.links||[]).map(function(l){ return '<a class="link-chip" href="' + esc(l.url) + '" target="_blank" rel="noopener">🔗 ' + esc(l.label || "관련자료") + '</a>'; }).join("");
    if (i.correctionEvidenceUrl) links += '<a class="link-chip" href="' + esc(i.correctionEvidenceUrl) + '" target="_blank" rel="noopener">✅ 개선완료 증빙자료(링크)</a>';
    var evidenceFiles = (i.correctionEvidenceFiles||[]).map(function(f){ return '<a class="link-chip" href="#" data-storage-path="' + esc(f.path) + '">✅ ' + esc(f.name) + '</a><a class="link-chip" href="#" data-storage-download-path="' + esc(f.path) + '" data-storage-download-name="' + esc(f.name) + '">⬇ 다운로드</a>'; }).join("");
    return '<div class="item-card" id="insp-' + i.id + '">' +
      '<div class="item-top"><div class="item-badges">' + sevBadge + statusBadge + repeatBadge + '</div>' +
        '<span class="mono" style="font-size:12px;color:var(--ink-500);">감독일시 ' + fmtDate(i.foundDate) + '</span></div>' +
      '<div style="font-weight:700;margin-top:8px;">' + esc(i.lawRef || "(근거법령 미입력)") + '</div>' +
      '<div class="item-desc">' + esc(i.violationDesc || "") + '</div>' +
      '<div class="item-meta">' +
        metaField("감독구분", i.inspectionType) +
        metaField("감독 시기", roundLabel(i)) +
        metaField("처분결과", (i.disposition||"-") + (i.dispositionAmount ? " (" + Number(i.dispositionAmount).toLocaleString() + "만원)" : "")) +
        metaField("과태료 부과여부", i.fineImposed || "미부과") +
        metaField("재적발 기준기간", flags.noRepeatLimit ? "제한없음" : (effectiveRepeatWindowYears(i) + "년")) +
        metaField("재적발 제한일", repeatDeadlineText(flags)) +
        metaField("개선기한", i.correctionDeadline ? fmtDate(i.correctionDeadline) : "-") +
        metaField("개선일자", i.correctionCompletedDate ? fmtDate(i.correctionCompletedDate) : "-") +
        metaField("보고일자", i.reportDate ? fmtDate(i.reportDate) : "-") +
      '</div>' +
      (i.correctionPlan || i.correctionResult ? '<div class="item-meta" style="margin-top:2px;">' +
        (i.correctionPlan ? '<div class="item-note-block"><div class="k">개선방안</div><div class="v">' + esc(i.correctionPlan) + '</div></div>' : '') +
        (i.correctionResult ? '<div class="item-note-block"><div class="k">개선결과</div><div class="v">' + esc(i.correctionResult) + '</div></div>' : '') +
      '</div>' : '') +
      (links ? '<div class="links-row">' + links + '</div>' : '') +
      (evidenceFiles ? '<div class="links-row">' + evidenceFiles + '</div>' : '') +
      (i.notes ? '<div class="item-desc" style="color:var(--ink-500);font-size:12.5px;">비고: ' + esc(i.notes) + '</div>' : '') +
      editBtns +
      '<div class="add-card" style="display:none;margin-top:10px;" id="editform-' + i.id + '"></div>' +
    '</div>';
  }
  function metaField(k,v){
    return '<div><div class="k">' + esc(k) + '</div><div class="v">' + esc(v||"-") + '</div></div>';
  }

  function newInspectionDraft(catId, presetRoundId){
    return {id: uid(), categoryId: catId, severity:"시정명령", status:"미착수", fineImposed:"미부과", repeatWindowYears: state.meta.defaultRepeatWindowYears, inspectionType:"정기", links:[], correctionEvidenceFiles:[], roundId: presetRoundId || ""};
  }
  function inspectionForm(insp, catId, presetRoundId){
    insp = insp || newInspectionDraft(catId, presetRoundId);
    if (!insp.id) insp.id = uid();
    var linksVal = (insp.links||[]).map(function(l){ return l.label + "|" + l.url; }).join("\n");
    var catOpts = state.categories.map(function(c){ return '<option value="' + c.id + '"' + (c.id === (insp.categoryId||catId) ? " selected" : "") + '>' + esc(c.name) + '</option>'; }).join("");
    var previewRwYears = effectiveRepeatWindowYears(insp);
    var previewDeadline = (insp.foundDate && previewRwYears > 0) ? addYears(insp.foundDate, previewRwYears) : null;
    var curRoundId = insp.roundId || presetRoundId || "";
    var roundOpts = '<option value="">(연결 안 함)</option>' + (state.inspectionRounds||[]).slice().sort(function(a,b){ return (b.date||"").localeCompare(a.date||""); }).map(function(r){
      return '<option value="' + r.id + '"' + (r.id === curRoundId ? " selected" : "") + '>' + esc(r.label) + '</option>';
    }).join("");
    return (
      '<form class="f" data-insp-id="' + (insp.id||"") + '">' +
        '<label>카테고리 *<select name="categoryId">' + catOpts + '</select></label>' +
        selectField("항목 구분 *", 'severity', insp.severity, [["시정명령","시정명령"],["시정지시","시정지시"],["개선권고","개선권고"]]) +
        field("근거법령/조항", 'input', 'lawRef', insp.lawRef, 'text', '예: 근로기준법 제17조') +
        field("감독 일시 *", 'input', 'foundDate', insp.foundDate, 'date') +
        selectField("감독구분", 'inspectionType', insp.inspectionType, [["정기","정기감독"],["수시","수시감독"],["특별","특별감독"],["기타","기타"]]) +
        '<label>감독 시기(라운드) 연결<select name="roundId">' + roundOpts + '</select></label>' +
        field("감독차수/명 (자유 입력, 표시용)", 'input', 'inspectionRound', insp.inspectionRound, 'text', '예: 2026년 정기근로감독') +
        selectField("개선 여부 *", 'status', insp.status, [["미착수","미착수"],["진행중","진행중"],["개선완료","개선완료"]]) +
        field("처분결과", 'input', 'disposition', insp.disposition, 'text', '예: 과태료, 시정지시, 사법처리') +
        field("처분금액(만원)", 'input', 'dispositionAmount', insp.dispositionAmount, 'number') +
        selectField("과태료 부과 여부", 'fineImposed', insp.fineImposed, [["미부과","미부과"],["부과","부과"]]) +
        field("재적발 기준기간(년)", 'input', 'repeatWindowYears', insp.repeatWindowYears, 'number') +
        field("개선기한", 'input', 'correctionDeadline', insp.correctionDeadline, 'date') +
        field("개선 일자", 'input', 'correctionCompletedDate', insp.correctionCompletedDate, 'date') +
        field("보고 일자", 'input', 'reportDate', insp.reportDate, 'date') +
        '<div class="full" style="font-size:11.5px;color:var(--ink-500);margin-top:-8px;">0으로 두면 재적발 제한 없음으로 처리됩니다 (예: 개선권고).</div>' +
        '<div class="full" style="font-size:12px;color:var(--ink-500);margin-top:-4px;">재적발 제한일 (자동계산): <span class="mono repeat-preview">' + (previewRwYears === 0 ? "제한없음" : (previewDeadline ? fmtDate(previewDeadline) : "-")) + '</span></div>' +
        fieldFull("위반/부족 내용", 'textarea', 'violationDesc', insp.violationDesc) +
        fieldFull("개선방안", 'textarea', 'correctionPlan', insp.correctionPlan) +
        fieldFull("개선결과", 'textarea', 'correctionResult', insp.correctionResult) +
        fieldFull("관련자료 링크 (한 줄에 하나, '이름|URL' 형식, 예: 시정보고서|https://...)", 'textarea', 'links', linksVal) +
        '<div class="full">' +
          '<label style="margin-bottom:4px;display:block;">개선 완료 증빙자료 (파일 업로드)</label>' +
          (insp.correctionEvidenceUrl ? ('<div class="hint" style="font-size:11.5px;color:var(--ink-500);margin-bottom:6px;">기존 링크 자료: <a href="' + esc(insp.correctionEvidenceUrl) + '" target="_blank" rel="noopener">' + esc(insp.correctionEvidenceUrl) + '</a></div>') : '') +
          '<div style="display:flex;align-items:center;gap:8px;">' +
            '<button type="button" class="btn sm" id="evidenceAttachAddBtn">+ 파일 추가</button>' +
            '<input type="file" id="evidenceAttachInput" multiple style="display:none;">' +
            '<span id="evidenceAttachStatus" style="font-size:12px;color:var(--ink-500);"></span>' +
          '</div>' +
          '<div id="evidenceAttachListHost" style="margin-top:8px;"></div>' +
        '</div>' +
        fieldFull("비고", 'textarea', 'notes', insp.notes) +
        '<div class="form-actions"><button type="button" class="btn ghost sm" data-cancel-form="1">취소</button><button type="submit" class="btn primary sm">저장</button></div>' +
      '</form>'
    );
  }
  function field(label, tag, name, val, type, placeholder){
    return '<label>' + esc(label) + '<input name="' + name + '" type="' + (type||"text") + '" value="' + esc(val||"") + '" placeholder="' + esc(placeholder||"") + '"></label>';
  }
  function fieldFull(label, tag, name, val){
    return '<label class="full">' + esc(label) + '<textarea name="' + name + '">' + esc(val||"") + '</textarea></label>';
  }
  function selectField(label, name, val, options){
    var opts = options.map(function(o){ return '<option value="' + o[0] + '"' + (o[0]===val?" selected":"") + '>' + o[1] + '</option>'; }).join("");
    return '<label>' + esc(label) + '<select name="' + name + '">' + opts + '</select></label>';
  }

  function bindInspectionForm(host, insp, catId, onCancel){
    var form = host.querySelector("form");
    if (!form) return;
    insp = insp || newInspectionDraft(catId);
    var isNew = state.inspections.findIndex(function(x){ return x.id === insp.id; }) === -1;

    var foundDateInput = form.querySelector('[name="foundDate"]');
    var yearsInput = form.querySelector('[name="repeatWindowYears"]');
    var preview = form.querySelector('.repeat-preview');
    function updatePreview(){
      var fd = foundDateInput.value;
      var yrsRaw = yearsInput.value;
      var yrs = yrsRaw === "" ? state.meta.defaultRepeatWindowYears : Number(yrsRaw);
      if (yrs === 0){ preview.textContent = "제한없음"; return; }
      preview.textContent = fd ? fmtDate(addYears(fd, yrs)) : "-";
    }
    if (foundDateInput) foundDateInput.addEventListener("input", updatePreview);
    if (yearsInput) yearsInput.addEventListener("input", updatePreview);

    var pendingEvidenceFiles = (insp.correctionEvidenceFiles||[]).slice();
    var evListHost = host.querySelector("#evidenceAttachListHost");
    var evAddBtn = host.querySelector("#evidenceAttachAddBtn");
    var evInput = host.querySelector("#evidenceAttachInput");
    var evStatus = host.querySelector("#evidenceAttachStatus");
    function renderEvList(){
      if (!evListHost) return;
      evListHost.innerHTML = renderAttachmentList(pendingEvidenceFiles, "del-pending-evidence");
      $all("[data-del-pending-evidence]", evListHost).forEach(function(btn){
        btn.addEventListener("click", function(){
          var id = btn.getAttribute("data-del-pending-evidence");
          pendingEvidenceFiles = pendingEvidenceFiles.filter(function(f){ return f.id !== id; });
          renderEvList();
        });
      });
    }
    renderEvList();
    if (evAddBtn) evAddBtn.addEventListener("click", function(){ evInput.click(); });
    if (evInput) evInput.addEventListener("change", function(){
      var files = Array.prototype.slice.call(evInput.files||[]);
      evInput.value = "";
      if (!files.length) return;
      evStatus.textContent = "업로드 중...";
      evAddBtn.disabled = true;
      (async function(){
        for (var i=0;i<files.length;i++){
          var res = await uploadOneFile(files[i], "attachments/evidence/" + insp.id);
          if (res.ok){ pendingEvidenceFiles.push({id:res.meta.id, name:res.meta.name, path:res.meta.path, contentType:res.meta.contentType, size:res.meta.size, uploadedDate:res.meta.uploadedDate}); }
          else { alert(res.message); }
        }
        evStatus.textContent = "";
        evAddBtn.disabled = false;
        renderEvList();
      })();
    });

    form.addEventListener("submit", function(e){
      e.preventDefault();
      var fd = new FormData(form);
      var obj = Object.assign({}, insp);
      if (!obj.createdAt) obj.createdAt = new Date().toISOString();
      if (!obj.links) obj.links = [];
      ["categoryId","lawRef","severity","foundDate","inspectionType","inspectionRound","roundId","status","disposition","correctionDeadline","correctionCompletedDate","reportDate","fineImposed","violationDesc","correctionPlan","correctionResult","notes"].forEach(function(k){
        obj[k] = fd.get(k);
      });
      obj.correctionEvidenceFiles = pendingEvidenceFiles.slice();
      obj.dispositionAmount = fd.get("dispositionAmount") ? Number(fd.get("dispositionAmount")) : null;
      obj.repeatWindowYears = fd.get("repeatWindowYears") ? Number(fd.get("repeatWindowYears")) : state.meta.defaultRepeatWindowYears;
      var linksRaw = (fd.get("links")||"").split("\n").map(function(s){ return s.trim(); }).filter(Boolean);
      obj.links = linksRaw.map(function(row){
        var idx = row.indexOf("|");
        if (idx === -1) return {label:"관련자료", url: row};
        return {label: row.slice(0,idx).trim() || "관련자료", url: row.slice(idx+1).trim()};
      });
      obj.updatedAt = new Date().toISOString();
      if (!obj.categoryId || !obj.foundDate){ alert("카테고리와 감독 일시는 필수입니다."); return; }
      var idx2 = state.inspections.findIndex(function(x){ return x.id === obj.id; });
      if (idx2 !== -1){
        state.inspections[idx2] = obj;
      } else {
        state.inspections.push(obj);
      }
      commit(idx2 !== -1 && !isNew ? "적발 이력 수정: " + (obj.lawRef||obj.violationDesc||"") : "적발 이력 추가: " + (obj.lawRef||obj.violationDesc||""));
    });
    var cancel = host.querySelector("[data-cancel-form]");
    if (cancel) cancel.addEventListener("click", onCancel || function(){ host.style.display = "none"; host.innerHTML=""; });
  }

  function bindInspectionCardActions(root){
    $all("[data-edit-insp]", root).forEach(function(btn){
      btn.addEventListener("click", function(){
        var id = btn.getAttribute("data-edit-insp");
        var insp = state.inspections.filter(function(x){ return x.id === id; })[0];
        var host = document.getElementById("editform-" + id);
        var show = host.style.display === "none";
        host.style.display = show ? "block" : "none";
        if (show){ host.innerHTML = inspectionForm(insp, insp.categoryId); bindInspectionForm(host, insp, insp.categoryId); }
      });
    });
  }
  function bindDeleteInspection(root){
    $all("[data-del-insp]", root).forEach(function(btn){
      btn.addEventListener("click", function(){
        var id = btn.getAttribute("data-del-insp");
        confirmModal("이 적발 이력을 삭제할까요? 되돌릴 수 없습니다.", function(){
          state.inspections = state.inspections.filter(function(x){ return x.id !== id; });
          commit("적발 이력 삭제");
        });
      });
    });
  }

  /* ---------- self-check tab (모의점검) ---------- */
  function renderSelfCheck(){
    var el = document.getElementById("view-selfcheck");
    var lr = latestRound();
    var nextDue = lr ? addMonths(lr.date, state.meta.selfCheckIntervalMonths) : null;
    var sorted = state.selfCheckRounds.slice().sort(function(a,b){ return (b.date||"").localeCompare(a.date||""); });

    var html = '<div class="panel-head" style="margin-top:0;"><div><h2 style="font-size:19px;">모의점검</h2><div class="desc">노동관계법령 카테고리별 체크리스트로 자체 모의점검을 진행하고, 완료되면 등록하여 분기별 이력으로 남깁니다.</div></div>' +
      (editMode ? '<button class="btn primary" id="btnRegisterCheck">등록</button>' : '') + '</div>';

    html += '<div class="banner ' + (nextDue && daysUntil(nextDue) < 0 ? "danger" : "info") + '">다음 모의점검 권장일: <b>&nbsp;' + (nextDue ? fmtDate(nextDue) : "아직 등록된 점검이 없습니다") + '</b>' +
      (nextDue ? ('&nbsp; (' + (daysUntil(nextDue) >= 0 ? "D-" + daysUntil(nextDue) : (-daysUntil(nextDue)) + "일 지남") + ')') : '') + '</div>';

    html += renderLegalReviewPanel();

    html += '<div class="panel"><div class="panel-head"><div><h2>체크리스트</h2><div class="desc">' +
      (editMode ? '항목별로 적정 / 부족 / 위반을 선택하세요. 입력 내용은 이 브라우저에 임시 저장되며, 상단 "등록" 버튼을 눌러야 점검 이력으로 저장됩니다.' : '카테고리별 점검 문항입니다. 응답을 입력하려면 편집모드로 전환하세요.') +
      '</div></div></div>';
    state.categories.forEach(function(cat){
      var items = (state.selfCheckTemplate||{})[cat.id] || [];
      if (!items.length) return;
      html += '<details class="cat" open><summary><span class="cat-title"><span class="cat-chevron">▸</span>' + esc(cat.name) + '<span class="badge neutral">' + items.length + '항목</span></span></summary><div class="cat-body">';
      items.forEach(function(it){ html += checklistItemRow(it, getAnswer(it.id), editMode); });
      html += '</div></details>';
    });
    html += '</div>';

    html += '<div class="panel"><div class="panel-head"><h2>점검 이력</h2></div>';
    if (!sorted.length){
      html += '<div class="empty-row">등록된 모의점검 이력이 없습니다.</div>';
    } else {
      sorted.forEach(function(r){ html += roundCard(r); });
    }
    html += '</div>';

    el.innerHTML = html;
    if (editMode){
      bindChecklistInputs(el);
      var regBtn = document.getElementById("btnRegisterCheck");
      if (regBtn) regBtn.addEventListener("click", openRegisterModal);
    }
    bindRoundActions(el);
    bindLegalReviewPanel(el);
  }

  /* ---------- 법령 최신성 검토 패널 (모의점검 상단) ---------- */
  function renderLegalReviewPanel(){
    var lr = state.meta.lawReview || {};
    var alerts = (state.legalAlerts||[]).slice().sort(function(a,b){ return (b.date||"").localeCompare(a.date||""); });
    var watch = (state.legalWatchlist||[]).slice();
    var html = '<div class="panel">' +
      '<div class="panel-head"><div><h2 style="font-size:15px;">법령 최신성 검토</h2><div class="desc">체크리스트 근거 법령이 현행 기준과 일치하는지 확인한 이력입니다. 관련 법령이 개정되면 여기에 반영 내역과 확인이 필요한 사항이 쌓입니다.</div></div>' +
      (editMode ? ('<div style="display:flex;gap:6px;flex:none;"><button class="btn sm" id="btnRefreshLegalReview">⟳ 갱신</button><button class="btn sm" id="btnAddLegalItem">+ 법령 변경사항 기록</button></div>') : '') + '</div>';
    html += '<div class="item-desc" style="color:var(--ink-500);">최근 검토 기준일: <b class="mono">' + (lr.reviewedDate ? fmtDate(lr.reviewedDate) : "-") + '</b>' + (lr.reviewedBy ? (' · ' + esc(lr.reviewedBy)) : '') + '</div>';

    if (alerts.length){
      html += '<div style="margin-top:10px;font-size:12.5px;font-weight:700;color:var(--ink-500);">반영된 개정 내역</div>';
      alerts.forEach(function(a){
        html += '<div class="item-card" style="margin-top:8px;">' +
          '<div class="item-top"><div class="item-badges"><span class="badge good">' + esc(a.status||"반영완료") + '</span></div>' +
          '<span class="mono" style="font-size:12px;color:var(--ink-500);">' + fmtDate(a.date) + '</span></div>' +
          '<div style="font-weight:700;margin-top:6px;">' + esc(a.title) + '</div>' +
          '<div class="item-desc">' + esc(a.summary||"") + '</div>' +
          (a.sourceNote ? ('<div class="item-desc" style="color:var(--ink-500);font-size:12px;">' + esc(a.sourceNote) + '</div>') : '') +
          (editMode ? ('<div class="item-actions"><button class="btn sm danger" data-del-legal="alert|' + a.id + '">삭제</button></div>') : '') +
        '</div>';
      });
    }
    if (watch.length){
      html += '<div style="margin-top:14px;font-size:12.5px;font-weight:700;color:var(--ink-500);">모니터링 중 / 확인이 필요한 사항</div>';
      watch.forEach(function(w){
        var badgeCls = w.status && w.status.indexOf("확인 필요") !== -1 ? "warn" : "neutral";
        html += '<div class="item-card" style="margin-top:8px;">' +
          '<div class="item-top"><div class="item-badges"><span class="badge ' + badgeCls + '">' + esc(w.status||"모니터링 중") + '</span></div>' +
          '<span class="mono" style="font-size:12px;color:var(--ink-500);">확인일 ' + fmtDate(w.checkedDate) + '</span></div>' +
          '<div style="font-weight:700;margin-top:6px;">' + esc(w.topic) + '</div>' +
          '<div class="item-desc">' + esc(w.summary||"") + '</div>' +
          (editMode ? ('<div class="item-actions"><button class="btn sm danger" data-del-legal="watch|' + w.id + '">삭제</button></div>') : '') +
        '</div>';
      });
    }
    if (!alerts.length && !watch.length){
      html += '<div class="empty-row">기록된 법령 검토 내역이 없습니다.</div>';
    }
    if (editMode){
      html += '<div id="legalItemFormHost" style="display:none;margin-top:12px;"></div>';
    }
    html += '</div>';
    return html;
  }
  function legalItemForm(){
    return '<form class="f" id="legalItemForm">' +
      selectField("구분 *", 'kind', "alert", [["alert","반영된 개정 내역"],["watch","모니터링/확인 필요 사항"]]) +
      field("제목 *", 'input', 'title', "", 'text', '예: 배우자 출산휴가 관련 법령 개정') +
      selectField("관련 카테고리", 'categoryId', "", [["",""]].concat(state.categories.map(function(c){ return [c.id, c.name]; }))) +
      fieldFull("내용", 'textarea', 'summary', "") +
      field("출처/참고 링크", 'input', 'sourceUrl', "", 'url', 'https://www.law.go.kr/...') +
      field("기준일", 'input', 'date', todayStr(), 'date') +
      '<div class="form-actions"><button type="button" class="btn ghost sm" data-cancel-form="1">취소</button><button type="submit" class="btn primary sm">기록 추가</button></div>' +
    '</form>';
  }
  function bindLegalReviewPanel(el){
    var refreshBtn = document.getElementById("btnRefreshLegalReview");
    if (refreshBtn) refreshBtn.addEventListener("click", runLegalReview);
    var addBtn = document.getElementById("btnAddLegalItem");
    var host = document.getElementById("legalItemFormHost");
    if (addBtn && host){
      addBtn.addEventListener("click", function(){
        var show = host.style.display === "none";
        host.style.display = show ? "block" : "none";
        if (show){
          host.innerHTML = legalItemForm();
          var form = document.getElementById("legalItemForm");
          form.addEventListener("submit", function(e){
            e.preventDefault();
            var fd = new FormData(form);
            if (!fd.get("title")){ alert("제목은 필수입니다."); return; }
            var kind = fd.get("kind");
            if (kind === "watch"){
              state.legalWatchlist.push({ id: uid(), topic: fd.get("title"), status: "확인 필요", summary: fd.get("summary")||"", checkedDate: fd.get("date")||todayStr() });
            } else {
              state.legalAlerts.push({ id: uid(), date: fd.get("date")||todayStr(), title: fd.get("title"), summary: fd.get("summary")||"", sourceNote: fd.get("sourceUrl") ? ("참고: " + fd.get("sourceUrl")) : "", status: "반영완료", relatedCategoryId: fd.get("categoryId")||"" });
            }
            state.meta.lawReview = { reviewedDate: todayStr(), reviewedBy: (editorName || "담당자") + " 수동 기록" };
            commit("법령 검토 기록 추가: " + fd.get("title"));
          });
          var cancel = document.getElementById("legalItemForm").querySelector("[data-cancel-form]");
          if (cancel) cancel.addEventListener("click", function(){ host.style.display = "none"; host.innerHTML = ""; });
        }
      });
    }
    $all("[data-del-legal]", el).forEach(function(btn){
      btn.addEventListener("click", function(){
        var parts = btn.getAttribute("data-del-legal").split("|");
        var kind = parts[0], id = parts[1];
        confirmModal("이 기록을 삭제할까요?", function(){
          if (kind === "alert") state.legalAlerts = state.legalAlerts.filter(function(x){ return x.id !== id; });
          else state.legalWatchlist = state.legalWatchlist.filter(function(x){ return x.id !== id; });
          commit("법령 검토 기록 삭제");
        });
      });
    });
  }
  async function runLegalReview(){
    var categories = state.categories.map(function(cat){
      var items = ((state.selfCheckTemplate||{})[cat.id] || []).filter(function(it){ return it.law; });
      return { categoryId: cat.id, categoryName: cat.name, items: items.map(function(it){ return {id: it.id, text: it.text, law: it.law}; }) };
    }).filter(function(c){ return c.items.length; });

    if (!categories.length){
      toast("체크리스트에 근거 법령이 기재된 항목이 없어 갱신할 내용이 없습니다.");
      return;
    }
    if (!sb){
      toast("저장소 연결이 없어 법령 갱신 기능을 사용할 수 없습니다.");
      return;
    }
    toast("최신 법령을 조회하는 중입니다... (최대 1분 정도 걸릴 수 있습니다)");
    try {
      var res = await sb.functions.invoke("review-legal-updates", { body: { categories: categories } });
      if (res.error){
        var detail = "";
        try { if (res.error.context && typeof res.error.context.json === "function"){ var errBody = await res.error.context.json(); detail = errBody && errBody.error ? errBody.error : ""; } } catch(e){}
        throw new Error(detail || res.error.message || "법령 갱신 요청에 실패했습니다.");
      }
      if (res.data && res.data.error) throw new Error(res.data.error);
      var raw = res.data && res.data.text;
      if (!raw) throw new Error("AI 응답이 비어 있습니다.");
      var jsonStr = raw.trim();
      var m = jsonStr.match(/\{[\s\S]*\}/);
      if (m) jsonStr = m[0];
      var result = JSON.parse(jsonStr);
      var updates = (result.updates || []).filter(function(u){ return u && u.itemId && u.newLaw; });
      var alerts = (result.alerts || []).filter(function(a){ return a && a.title; });
      if (!updates.length && !alerts.length){
        state.meta.lawReview = { reviewedDate: todayStr(), reviewedBy: "AI 자동 갱신" };
        commit("법령 최신성 검토 (변경사항 없음)");
        toast("확인 결과 반영이 필요한 변경사항이 없습니다. 검토일이 갱신되었습니다.");
        return;
      }
      showLegalReviewConfirm(updates, alerts);
    } catch(err){
      var msg = (err && err.message) ? err.message : "법령 갱신 중 오류가 발생했습니다";
      toast(msg);
    }
  }
  function showLegalReviewConfirm(updates, alerts){
    var body = '<h3>법령 갱신 내용을 반영하시겠습니까?</h3>' +
      '<p class="hint">AI가 웹검색으로 확인한 결과입니다. 내용을 검토한 뒤 반영해주세요.</p>' +
      '<div style="max-height:340px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;margin:10px 0;">';
    if (updates.length){
      body += '<div style="font-size:12.5px;font-weight:700;color:var(--ink-500);">근거 법령 업데이트 (' + updates.length + '건)</div>';
      updates.forEach(function(u){
        body += '<div class="item-card" style="padding:9px 11px;">' +
          '<div style="font-weight:700;font-size:13px;">' + esc(u.categoryName||"") + '</div>' +
          '<div style="font-size:12.5px;color:var(--ink-500);margin-top:2px;">' + esc(u.oldLaw||"-") + ' → <b>' + esc(u.newLaw||"-") + '</b></div>' +
          (u.reason ? ('<div style="font-size:12px;color:var(--ink-500);margin-top:2px;">' + esc(u.reason) + '</div>') : '') +
        '</div>';
      });
    }
    if (alerts.length){
      body += '<div style="font-size:12.5px;font-weight:700;color:var(--ink-500);margin-top:6px;">신규 반영 내역 (' + alerts.length + '건)</div>';
      alerts.forEach(function(a){
        body += '<div class="item-card" style="padding:9px 11px;">' +
          '<div style="font-weight:700;font-size:13px;">' + esc(a.title||"") + '</div>' +
          (a.categoryName ? ('<div style="font-size:12px;color:var(--ink-500);">' + esc(a.categoryName) + '</div>') : '') +
          (a.summary ? ('<div style="font-size:12.5px;color:var(--ink-700);margin-top:2px;">' + esc(a.summary) + '</div>') : '') +
          (a.effectiveDate ? ('<div style="font-size:12px;color:var(--ink-500);margin-top:2px;">시행일: ' + esc(a.effectiveDate) + '</div>') : '') +
        '</div>';
      });
    }
    body += '</div>' +
      '<div class="modal-actions"><button class="btn ghost" id="legalReviewNo">아니오</button><button class="btn primary" id="legalReviewYes">예 (반영)</button></div>';
    showModal(body, true);
    document.getElementById("legalReviewNo").addEventListener("click", closeModal);
    document.getElementById("legalReviewYes").addEventListener("click", function(){
      closeModal();
      updates.forEach(function(u){
        state.categories.forEach(function(cat){
          var items = (state.selfCheckTemplate||{})[cat.id] || [];
          items.forEach(function(it){
            if (it.id === u.itemId) it.law = u.newLaw;
          });
        });
      });
      alerts.forEach(function(a){
        var relatedCat = state.categories.filter(function(c){ return c.name === a.categoryName; })[0];
        state.legalAlerts.push({
          id: uid(), date: todayStr(), title: a.title, summary: a.summary || "",
          sourceNote: a.sourceUrl ? ("참고: " + a.sourceUrl) : "", status: "반영완료",
          relatedCategoryId: relatedCat ? relatedCat.id : ""
        });
      });
      state.meta.lawReview = { reviewedDate: todayStr(), reviewedBy: "AI 자동 갱신" };
      commit("법령 최신성 검토 반영 (근거법령 " + updates.length + "건, 신규 " + alerts.length + "건)");
      toast("법령 갱신 내용이 반영되었습니다.");
    });
  }

  function checklistItemRow(it, ans, interactive){
    var segs = ["적정","부족","위반"].map(function(v){
      var active = ans.result === v;
      var vcls = v === "위반" ? "danger" : (v === "부족" ? "warn" : "good");
      return '<button type="button" class="btn sm" ' + (interactive ? ('data-set-result="' + it.id + '" data-val="' + v + '"') : 'disabled') + ' style="' + (active ? segActiveStyle(vcls) : '') + (interactive ? '' : 'opacity:' + (active?'1':'.45') + ';cursor:default;') + '">' + v + '</button>';
    }).join("");
    return '<div class="item-card" data-item-id="' + it.id + '">' +
      '<div class="item-top"><div style="flex:1;min-width:200px;">' +
        (it.sub ? '<div style="font-size:11.5px;font-weight:700;color:var(--ink-500);margin-bottom:2px;">' + esc(it.sub) + '</div>' : '') +
        '<div style="font-size:13px;">' + esc(it.text) + '</div>' +
        (it.law ? '<div style="font-size:11.5px;color:var(--ink-300);margin-top:3px;">' + esc(it.law) + '</div>' : '') +
      '</div>' +
      '<div style="display:flex;gap:4px;flex:none;">' + segs + '</div></div>' +
      (interactive ?
        ('<input type="text" class="checklist-note" data-note-for="' + it.id + '" placeholder="코멘트(선택)" value="' + esc(ans.note||"") + '" style="margin-top:8px;width:100%;padding:6px 9px;border:1px solid var(--line);border-radius:7px;font-size:12.5px;background:var(--surface);color:var(--ink-900);">')
        : (ans.note ? ('<div style="margin-top:8px;font-size:12.5px;color:var(--ink-500);">' + esc(ans.note) + '</div>') : '')) +
    '</div>';
  }
  function segActiveStyle(vcls){
    var bg = vcls==="danger" ? "var(--danger-100)" : (vcls==="warn" ? "var(--warn-100)" : "var(--good-100)");
    var fg = vcls==="danger" ? "var(--danger-700)" : (vcls==="warn" ? "var(--warn-700)" : "var(--good-700)");
    return "background:" + bg + ";color:" + fg + ";border-color:transparent;";
  }
  function bindChecklistInputs(root){
    $all("[data-set-result]", root).forEach(function(btn){
      btn.addEventListener("click", function(){
        var id = btn.getAttribute("data-set-result");
        var val = btn.getAttribute("data-val");
        var cur = getAnswer(id);
        setAnswer(id, val, cur.note);
        renderActiveTab();
      });
    });
    $all("[data-note-for]", root).forEach(function(inp){
      inp.addEventListener("input", function(){
        var id = inp.getAttribute("data-note-for");
        var cur = getAnswer(id);
        setAnswer(id, cur.result, inp.value);
      });
    });
  }

  function openRegisterModal(){
    var defaultLabel = currentQuarterLabel(todayStr());
    var body = '<h3>모의점검 등록</h3><p class="hint">현재 체크리스트 응답을 하나의 점검 회차로 저장합니다.</p>' +
      '<input type="text" id="regLabel" placeholder="점검 회차명" value="' + esc(defaultLabel) + '">' +
      '<input type="date" id="regDate" value="' + todayStr() + '">' +
      '<input type="text" id="regChecker" placeholder="점검자 이름" value="' + esc(editorName) + '">' +
      '<div class="modal-actions"><button class="btn ghost" id="regCancel">취소</button><button class="btn primary" id="regOk">등록</button></div>';
    showModal(body);
    document.getElementById("regCancel").addEventListener("click", closeModal);
    document.getElementById("regOk").addEventListener("click", function(){
      var label = document.getElementById("regLabel").value.trim() || defaultLabel;
      var date = document.getElementById("regDate").value || todayStr();
      var checker = document.getElementById("regChecker").value.trim();
      var answers = [];
      state.categories.forEach(function(cat){
        var items = (state.selfCheckTemplate||{})[cat.id] || [];
        items.forEach(function(it){
          var a = getAnswer(it.id);
          answers.push({ itemId: it.id, categoryId: cat.id, result: a.result, note: a.note || "" });
        });
      });
      state.selfCheckRounds.push({
        id: uid(), roundLabel: label, date: date, checker: checker,
        answers: answers, createdAt: new Date().toISOString()
      });
      draftAnswers = {};
      try { sessionStorage.removeItem(DRAFT_KEY); } catch(e){}
      closeModal();
      commit("모의점검 등록: " + label);
    });
  }

  function roundCard(r){
    var counts = {"적정":0,"부족":0,"위반":0};
    (r.answers||[]).forEach(function(a){ counts[a.result] = (counts[a.result]||0) + 1; });
    var riskMap = roundCategoryRisk(r);
    var dangerCats = Object.keys(riskMap).filter(function(k){ return riskMap[k]==="danger"; });
    var watchCats = Object.keys(riskMap).filter(function(k){ return riskMap[k]==="watch"; });
    var delBtn = editMode ? '<button class="btn sm danger" data-del-round="' + r.id + '">삭제</button>' : '';
    var detailId = "round-detail-" + r.id;
    return '<div class="round-card" style="margin-bottom:12px;">' +
      '<div class="round-head"><span class="rl">' + esc(r.roundLabel) + '</span>' +
      '<span class="mono" style="font-size:12px;color:var(--ink-500);">점검일 ' + fmtDate(r.date) + ' · 점검자 ' + esc(r.checker||"-") + '</span></div>' +
      '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">' +
        '<span class="badge good">적정 ' + (counts["적정"]||0) + '</span>' +
        (counts["부족"] ? '<span class="badge warn">부족 ' + counts["부족"] + '</span>' : '') +
        (counts["위반"] ? '<span class="badge danger">위반 ' + counts["위반"] + '</span>' : '') +
      '</div>' +
      (dangerCats.length || watchCats.length ?
        '<div class="item-desc" style="font-size:12.5px;">' +
          (dangerCats.length ? '위험: ' + dangerCats.map(catName).join(", ") : '') +
          (dangerCats.length && watchCats.length ? ' · ' : '') +
          (watchCats.length ? '주의: ' + watchCats.map(catName).join(", ") : '') +
        '</div>' : '') +
      '<button class="btn sm ghost" data-toggle-detail="' + detailId + '" style="margin-top:8px;">세부 항목 보기</button>' +
      '<div id="' + detailId + '" style="display:none;margin-top:10px;">' + roundDetailTable(r) + '</div>' +
      (delBtn ? '<div class="item-actions">' + delBtn + '</div>' : '') +
    '</div>';
  }
  function roundDetailTable(r){
    var byCat = {};
    (r.answers||[]).forEach(function(a){ (byCat[a.categoryId] = byCat[a.categoryId] || []).push(a); });
    var html = "";
    Object.keys(byCat).forEach(function(catId){
      var flagged = byCat[catId].filter(function(a){ return a.result !== "적정"; });
      if (!flagged.length) return;
      html += '<div style="margin-bottom:8px;"><div style="font-weight:700;font-size:12.5px;margin-bottom:4px;">' + esc(catName(catId)) + '</div>';
      flagged.forEach(function(a){
        var item = findTemplateItem(a.itemId);
        var cls = a.result === "위반" ? "danger" : "warn";
        html += '<div style="font-size:12.5px;padding:4px 0;border-bottom:1px solid var(--line-soft);"><span class="badge ' + cls + '">' + a.result + '</span> ' + esc(item ? item.text : a.itemId) + (a.note ? ' — <span style="color:var(--ink-500);">' + esc(a.note) + '</span>' : '') + '</div>';
      });
      html += '</div>';
    });
    return html || '<div class="empty-row">부족·위반으로 표시된 항목이 없습니다 (전 항목 적정).</div>';
  }
  function bindRoundActions(root){
    $all("[data-toggle-detail]", root).forEach(function(btn){
      btn.addEventListener("click", function(){
        var id = btn.getAttribute("data-toggle-detail");
        var target = document.getElementById(id);
        target.style.display = target.style.display === "none" ? "block" : "none";
      });
    });
    $all("[data-del-round]", root).forEach(function(btn){
      btn.addEventListener("click", function(){
        var id = btn.getAttribute("data-del-round");
        confirmModal("이 점검 회차를 삭제할까요?", function(){
          state.selfCheckRounds = state.selfCheckRounds.filter(function(r){ return r.id !== id; });
          commit("모의점검 회차 삭제");
        });
      });
    });
  }

  /* ---------- 근로감독 안내 tab ---------- */
  function renderGuide(){
    var el = document.getElementById("view-guide");
    var html = '<div class="panel-head" style="margin-top:0;"><div><h2 style="font-size:19px;">근로감독 안내</h2><div class="desc">근로감독관집무규정을 기준으로 근로감독의 종류·절차·확인서류·조치기준을 정리한 참고 자료입니다.</div></div></div>';

    html += '<div class="panel"><div class="panel-head"><h2>근로감독이란</h2></div>' +
      '<div class="intro-text">근로감독은 고용노동부 소속 근로감독관이 사업장을 방문하거나 자료를 확인하여 근로기준법 등 노동관계법령의 준수 여부를 점검하고, 위반사항이 확인되면 시정지시·시정명령·과태료·형사처벌 등의 조치를 취하는 행정 활동입니다. 근로감독관집무규정이 감독의 종류·절차·조치기준을 정하고 있으며, 이 탭은 그 핵심 내용을 정리해 상시 점검 체계를 갖추는 데 참고하기 위한 자료입니다.</div>' +
    '</div>';

    html += '<div class="panel"><div class="panel-head"><h2>근로감독의 종류</h2><div class="desc">근로감독관집무규정 제12조 기준</div></div>' +
      '<div class="type-grid">' +
      GUIDE_TYPES.map(function(t){
        return '<div class="type-card' + (t.tagClass ? ' ' + t.tagClass : '') + '">' +
          '<div class="tname"><span class="dot"></span>' + esc(t.name) + '</div>' +
          '<p>' + esc(t.desc) + '</p>' +
          '<span class="tag">' + esc(t.tag) + '</span>' +
        '</div>';
      }).join("") +
      '</div></div>';

    html += '<div class="panel"><div class="panel-head"><h2>근로감독 절차</h2><div class="desc">근로감독관집무규정 및 실무 안내를 종합한 일반적 흐름 (정기감독 기준 · 수시/특별감독은 사전통보 없이 진행될 수 있음)</div></div>' +
      '<div class="flow">' +
      GUIDE_STEPS.map(function(s, i){
        var branchHtml = "";
        if (s.branch && s.branch.length){
          branchHtml = '<div class="flow-branch">' +
            s.branch.map(function(b){
              return '<div class="bopt ' + esc(b.cls) + '"><b>' + esc(b.label) + '</b>' + esc(b.text) + '</div>';
            }).join("") +
          '</div>';
        }
        return '<div class="flow-step">' +
          '<div class="flow-num">' + (i+1) + '</div>' +
          '<div class="flow-card">' +
            '<div class="ft">' + esc(s.title) + (s.ref ? ('<span class="fref">' + esc(s.ref) + '</span>') : '') + '</div>' +
            '<div class="fd">' + esc(s.desc) + '</div>' +
            branchHtml +
          '</div>' +
        '</div>';
      }).join("") +
      '</div></div>';

    html += '<div class="panel"><div class="panel-head"><h2>사업장 감독 시 주요 확인 서류 체크리스트</h2><div class="desc">근로감독관집무규정 별표2 · 13개 법령분야' + (editMode ? '' : ' · 편집모드에서 항목을 체크할 수 있습니다') + '</div></div>' +
      '<details class="cat">' +
        '<summary><span class="cat-title"><span class="cat-chevron">▸</span>사업장감독 시 점검 확인 주요 서류 (별표2)<span class="badge">13개 분야</span></span></summary>' +
        '<div class="cat-body">' +
        GUIDE_CHECKLIST.map(function(cat){
          return '<details class="subcat">' +
            '<summary><span class="subcat-chevron">▸</span>' + cat.no + '. ' + esc(cat.title) + '</summary>' +
            '<div class="subcat-body"><div class="checklist-grid">' +
              cat.items.map(function(item, idx){
                var itemId = "g2-" + cat.no + "-" + idx;
                var checked = !!((state.guideChecklistChecked || {})[itemId]);
                return '<div class="ci"><input type="checkbox" id="gc-' + itemId + '" data-guide-check="' + itemId + '"' + (checked ? ' checked' : '') + (editMode ? '' : ' disabled') + '><label for="gc-' + itemId + '">' + esc(item) + '</label></div>';
              }).join("") +
            '</div></div>' +
          '</details>';
        }).join("") +
        '</div>' +
      '</details>' +
    '</div>';

    html += '<div class="panel"><div class="panel-head"><h2>개별근로관계법 위반사항 조치기준</h2><div class="desc">근로감독관집무규정 별표3 · ' + GUIDE_SANCTIONS.length + '개 법률</div></div>' +
      '<details class="cat">' +
        '<summary><span class="cat-title"><span class="cat-chevron">▸</span>개별근로관계법 위반사항 조치기준 (별표3)<span class="badge">' + GUIDE_SANCTIONS.length + '개 법률</span></span></summary>' +
        '<div class="cat-body">' +
        '<div class="sanction-note"><b>일반조치기준</b><ul>' +
          GUIDE_SANCTION_GENERAL.map(function(g){ return '<li>' + esc(g) + '</li>'; }).join("") +
        '</ul></div>' +
        GUIDE_SANCTIONS.map(function(law){
          return '<details class="subcat">' +
            '<summary><span class="subcat-chevron">▸</span>' + esc(law.law) + '<span class="badge neutral">' + law.rows.length + '개 조문</span></summary>' +
            '<div class="subcat-body scrollx"><table class="tbl"><thead><tr><th>법조문</th><th>위반사례</th><th>조치기준</th></tr></thead><tbody>' +
              law.rows.map(function(r){
                return '<tr><td class="mono">' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td></tr>';
              }).join("") +
            '</tbody></table></div>' +
          '</details>';
        }).join("") +
        '</div>' +
      '</details>' +
    '</div>';

    el.innerHTML = html;
    bindGuideChecklist(el);
  }
  function bindGuideChecklist(el){
    $all("[data-guide-check]", el).forEach(function(cb){
      cb.addEventListener("change", function(){
        if (!editMode){ cb.checked = !cb.checked; return; }
        var id = cb.getAttribute("data-guide-check");
        if (!state.guideChecklistChecked) state.guideChecklistChecked = {};
        state.guideChecklistChecked[id] = cb.checked;
        commit("체크리스트 항목 " + (cb.checked ? "체크" : "체크 해제") + " (" + id + ")");
      });
    });
  }

  /* ---------- settings tab ---------- */
  function renderSettings(){
    var el = document.getElementById("view-settings");
    var html = '<div class="panel-head" style="margin-top:0;"><div><h2 style="font-size:19px;">설정</h2></div></div>';

    html += '<div class="panel"><h2 style="font-size:15px;margin-bottom:10px;">권한 안내</h2>' +
      '<div class="kv">' +
      '<div class="row"><span>로그인 계정</span><span>' + esc((currentUser && currentUser.email) || "-") + '</span></div>' +
      '<div class="row"><span>실제 저장 권한</span><span>Supabase에 등록된 <b>편집자 계정</b>으로 로그인한 사람만 저장 가능 (관리자에게 계정 등록 요청)</span></div>' +
      '</div></div>';

    html += '<div class="panel"><h2 style="font-size:15px;margin-bottom:10px;">기본 설정</h2>';
    if (editMode){
      html += '<form class="f" id="settingsForm">' +
        field("문서 제목", 'input', 'title', state.meta.title, 'text') +
        field("회사/조직명", 'input', 'orgName', state.meta.orgName, 'text') +
        field("기본 재적발 기준기간(년)", 'input', 'defaultRepeatWindowYears', state.meta.defaultRepeatWindowYears, 'number') +
        field("모의점검 주기(개월)", 'input', 'selfCheckIntervalMonths', state.meta.selfCheckIntervalMonths, 'number') +
        '<div class="form-actions"><button type="submit" class="btn primary sm">저장</button></div>' +
      '</form>';
    } else {
      html += '<div class="kv">' +
        '<div class="row"><span>회사/조직명</span><span>' + esc(state.meta.orgName||"-") + '</span></div>' +
        '<div class="row"><span>기본 재적발 기준기간</span><span>' + state.meta.defaultRepeatWindowYears + '년</span></div>' +
        '<div class="row"><span>모의점검 주기</span><span>' + state.meta.selfCheckIntervalMonths + '개월</span></div>' +
      '</div>';
    }
    html += '</div>';

    html += '<div class="panel"><h2 style="font-size:15px;margin-bottom:10px;">변경 이력</h2><ul class="changelog">' +
      state.meta.changeLog.slice().reverse().slice(0,30).map(function(c){
        return '<li><time>' + esc(c.date) + '</time><span>' + esc(c.editor||"") + ' — ' + esc(c.summary) + '</span></li>';
      }).join("") + '</ul></div>';

    el.innerHTML = html;
    if (editMode){
      var sf = document.getElementById("settingsForm");
      sf.addEventListener("submit", function(e){
        e.preventDefault();
        var fd = new FormData(sf);
        state.meta.title = fd.get("title") || TITLE;
        state.meta.orgName = fd.get("orgName") || "";
        state.meta.defaultRepeatWindowYears = Number(fd.get("defaultRepeatWindowYears")) || 3;
        state.meta.selfCheckIntervalMonths = Number(fd.get("selfCheckIntervalMonths")) || 6;
        commit("기본 설정 변경");
      });
    }
  }
  function confirmModal(msg, onOk){
    var body = '<h3>확인</h3><p class="hint" style="margin-bottom:16px;">' + esc(msg) + '</p>' +
      '<div class="modal-actions"><button class="btn ghost" id="cfCancel">취소</button><button class="btn danger" id="cfOk">삭제</button></div>';
    showModal(body);
    document.getElementById("cfOk").addEventListener("click", function(){ closeModal(); onOk(); });
    document.getElementById("cfCancel").addEventListener("click", closeModal);
  }
  function showModal(innerHtml, wide){
    var root = document.getElementById("modalRoot");
    root.innerHTML = '<div class="modal-backdrop" id="modalBackdrop"><div class="modal"' + (wide ? ' style="max-width:640px;"' : '') + '>' + innerHtml + '</div></div>';
    document.getElementById("modalBackdrop").addEventListener("click", function(e){ if (e.target.id === "modalBackdrop") closeModal(); });
  }
  function closeModal(){ var r = document.getElementById("modalRoot"); if (r) r.innerHTML = ""; }

  function toast(msg){
    var t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function(){ t.remove(); }, 3200);
  }

  /* ---------- save (Supabase) ---------- */
  var lastSavedSnapshotAt = null; // dedupe our own realtime echo, see subscribeRealtime()
  var busy = false;
  async function commit(summary){
    if (busy) return;
    if (!sb){ alert("저장소 연결이 초기화되지 않았습니다. 새로고침 후 다시 시도해주세요."); return; }
    busy = true;
    state.meta.lastUpdated = new Date().toISOString();
    state.meta.changeLog.push({ date: todayStr(), editor: editorName || "익명", summary: summary });
    if (state.meta.changeLog.length > 200) state.meta.changeLog = state.meta.changeLog.slice(-200);
    saveUiState();
    lastSavedSnapshotAt = state.meta.lastUpdated;
    try {
      var res = await sb.from("app_state").upsert({
        id: APP_STATE_ROW_ID,
        data: state,
        updated_at: new Date().toISOString(),
        updated_by: (currentUser && currentUser.email) || editorName || ""
      }, { onConflict: "id" });
      if (res.error) throw res.error;
      busy = false;
      toast("저장되었습니다.");
      render();
    } catch(err){
      busy = false;
      alert("저장 중 문제가 발생했습니다: " + ((err && err.message) || err));
      render();
    }
  }

  /* ---------- realtime: reflect other editors' saves live ---------- */
  function subscribeRealtime(){
    if (!sb) return;
    sb.channel("app_state_changes")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "app_state", filter: "id=eq." + APP_STATE_ROW_ID }, function(payload){
        var incoming = payload.new && payload.new.data;
        if (!incoming) return;
        // Skip the echo of our own just-committed save (already reflected locally).
        if (incoming.meta && incoming.meta.lastUpdated && incoming.meta.lastUpdated === lastSavedSnapshotAt) return;
        state = incoming;
        normalizeState();
        toast("다른 편집자의 변경 사항이 반영되었습니다.");
        render();
      })
      .subscribe();
  }

  /* ---------- auth screens ---------- */
  function renderCenteredScreen(innerHtml){
    var app = document.getElementById("app");
    app.innerHTML = '<div class="auth-screen"><div class="auth-card">' + innerHtml + '</div></div>';
  }
  function renderLoadingScreen(msg){
    renderCenteredScreen('<h1 style="font-size:18px;margin-bottom:8px;">' + esc(TITLE) + '</h1><p class="hint">' + esc(msg||"불러오는 중...") + '</p>');
  }
  function renderLoginScreen(errorMsg){
    renderCenteredScreen(
      '<h1 style="font-size:18px;margin-bottom:4px;">' + esc(TITLE) + '</h1>' +
      '<p class="hint" style="margin-bottom:16px;">등록된 편집자 계정으로 로그인하세요.</p>' +
      (errorMsg ? '<p class="hint" style="color:#c0392b;margin-bottom:10px;">' + esc(errorMsg) + '</p>' : '') +
      '<form id="loginForm" class="f">' +
        '<input type="email" id="loginEmail" placeholder="이메일" autocomplete="username" required>' +
        '<input type="password" id="loginPw" placeholder="비밀번호" autocomplete="current-password" required>' +
        '<div class="form-actions"><button type="submit" class="btn primary sm" id="loginSubmitBtn">로그인</button></div>' +
      '</form>' +
      '<p class="hint" style="margin-top:10px;font-size:12px;">계정이 없거나 비밀번호를 잊으셨다면 관리자에게 문의하세요.</p>'
    );
    document.getElementById("loginForm").addEventListener("submit", async function(e){
      e.preventDefault();
      var email = document.getElementById("loginEmail").value.trim();
      var pw = document.getElementById("loginPw").value;
      document.getElementById("loginSubmitBtn").disabled = true;
      var res = await sb.auth.signInWithPassword({ email: email, password: pw });
      if (res.error){ renderLoginScreen("로그인에 실패했습니다: " + res.error.message); return; }
      await afterLogin(res.data.user);
    });
  }
  function renderSetPasswordScreen(){
    renderCenteredScreen(
      '<h1 style="font-size:18px;margin-bottom:4px;">' + esc(TITLE) + '</h1>' +
      '<p class="hint" style="margin-bottom:16px;">처음 로그인하셨네요. 앞으로 사용할 비밀번호를 설정해주세요.</p>' +
      '<form id="setPwForm" class="f">' +
        '<input type="password" id="setPw1" placeholder="새 비밀번호 (6자 이상)" required minlength="6">' +
        '<input type="password" id="setPw2" placeholder="새 비밀번호 확인" required minlength="6">' +
        '<div class="form-actions"><button type="submit" class="btn primary sm">비밀번호 설정</button></div>' +
      '</form>'
    );
    document.getElementById("setPwForm").addEventListener("submit", async function(e){
      e.preventDefault();
      var p1 = document.getElementById("setPw1").value;
      var p2 = document.getElementById("setPw2").value;
      if (p1.length < 6){ alert("비밀번호는 6자 이상이어야 합니다."); return; }
      if (p1 !== p2){ alert("비밀번호 확인이 일치하지 않습니다."); return; }
      var res = await sb.auth.updateUser({ password: p1 });
      if (res.error){ alert("비밀번호 설정에 실패했습니다: " + res.error.message); return; }
      pendingPasswordRecovery = false;
      var sess = await sb.auth.getSession();
      await afterLogin(sess.data.session ? sess.data.session.user : null);
    });
  }
  function renderNotEditorScreen(email){
    renderCenteredScreen(
      '<h1 style="font-size:18px;margin-bottom:4px;">' + esc(TITLE) + '</h1>' +
      '<p class="hint" style="margin-bottom:16px;">' + esc(email) + ' 계정은 이 문서의 편집자로 등록되어 있지 않습니다. 관리자에게 등록을 요청해주세요.</p>' +
      '<button class="btn sm" id="btnBackToLogin">로그아웃</button>'
    );
    document.getElementById("btnBackToLogin").addEventListener("click", async function(){
      await sb.auth.signOut();
      renderLoginScreen();
    });
  }
  async function afterLogin(user){
    if (!user){ renderLoginScreen(); return; }
    renderLoadingScreen("편집자 확인 중...");
    var chk = await sb.from("editors").select("id,email,name").eq("id", user.id).maybeSingle();
    if (chk.error || !chk.data){ renderNotEditorScreen(user.email); return; }
    currentUser = { id: user.id, email: user.email };
    isRegisteredEditor = true;
    editorName = chk.data.name || user.email;
    editMode = true;
    renderLoadingScreen("데이터를 불러오는 중...");
    try { await loadStateFromServer(); }
    catch(err){
      renderCenteredScreen('<p class="hint">데이터를 불러오지 못했습니다: ' + esc((err && err.message) || err) + '</p><button class="btn sm" id="btnRetry">다시 시도</button>');
      var rb = document.getElementById("btnRetry");
      if (rb) rb.addEventListener("click", function(){ afterLogin(user); });
      return;
    }
    loadDraft();
    loadUiState();
    render();
    subscribeRealtime();
  }

  /* ---------- boot ---------- */
  async function boot(){
    if (!sb){
      renderCenteredScreen('<p class="hint">저장소 연결 설정(config.js)이 올바르지 않습니다.</p>');
      return;
    }
    renderLoadingScreen("로그인 확인 중...");
    // Give supabase-js a brief tick to finish processing an invite/recovery token
    // in the URL hash (it does this as soon as the client was created above).
    await new Promise(function(resolve){ setTimeout(resolve, 50); });
    if (pendingPasswordRecovery){ renderSetPasswordScreen(); return; }
    var sess = await sb.auth.getSession();
    if (sess.data.session) await afterLogin(sess.data.session.user);
    else renderLoginScreen();
  }
  document.addEventListener("DOMContentLoaded", boot);

})();
