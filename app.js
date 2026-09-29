
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
      "- severity: \"시정명령\" 또는 \"개선권고\" 중 하나 (실제 위반으로 시정을 지시받은 것이면 시정명령, 문제 소지는 있으나 감독기관이 정식으로 문제삼지 않고 권고만 한 것이면 개선권고)\n" +
      "- lawRef: 근거법령/조항\n" +
      "- foundDate: 감독일 또는 적발일 (YYYY-MM-DD)\n" +
      "- disposition: 처분결과 (예: 과태료, 시정지시, 사법처리 등)\n" +
      "- dispositionAmount: 처분금액(만원 단위 숫자), 없으면 null\n" +
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
  function computeInspectionFlags(insp){
    var repeatDeadline = insp.foundDate ? addYears(insp.foundDate, insp.repeatWindowYears || state.meta.defaultRepeatWindowYears) : null;
    var withinWindow = repeatDeadline ? daysUntil(repeatDeadline) >= 0 : false;
    var overdue = insp.status !== "개선완료" && insp.correctionDeadline && daysUntil(insp.correctionDeadline) < 0;
    return { repeatDeadline: repeatDeadline, withinWindow: withinWindow, overdue: overdue };
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
    return state.inspections
      .map(function(i){ return Object.assign({}, i, {flags: computeInspectionFlags(i)}); })
      .filter(function(i){ return i.flags.withinWindow && i.status !== "개선완료"; })
      .sort(function(a,b){ return daysUntil(a.flags.repeatDeadline) - daysUntil(b.flags.repeatDeadline); });
  }
  function overdueList(){
    return state.inspections
      .map(function(i){ return Object.assign({}, i, {flags: computeInspectionFlags(i)}); })
      .filter(function(i){ return i.flags.overdue; });
  }
  function openIssuesList(){
    return state.inspections.filter(function(i){ return i.status === "미착수" || i.status === "진행중"; });
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
            tabBtn("dashboard","대시보드") +
            tabBtn("findings","적발 사항") +
            tabBtn("inspections","근로감독 이력") +
            tabBtn("selfcheck","모의점검") +
            tabBtn("settings","설정") +
          '</nav>' +
        '</div></div>' +
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
    if (activeTab === "dashboard") renderDashboard();
    else if (activeTab === "findings") renderFindings();
    else if (activeTab === "inspections") renderInspections();
    else if (activeTab === "selfcheck") renderSelfCheck();
    else if (activeTab === "settings") renderSettings();
  }

  /* ---------- dashboard ---------- */
  function renderDashboard(){
    var el = document.getElementById("view-dashboard");
    var lastInsp = latestInspectionDate();
    var openCount = openIssuesList().length;
    var watch = riskWatchlist();
    var overdue = overdueList();
    var watchStrict = watch.filter(function(i){ return i.severity === "시정명령"; });
    var watchAdvisory = watch.filter(function(i){ return i.severity !== "시정명령"; });
    var overdueStrict = overdue.filter(function(i){ return i.severity === "시정명령"; });
    var overdueAdvisory = overdue.filter(function(i){ return i.severity !== "시정명령"; });
    var strictTotal = state.inspections.filter(function(i){return i.severity==="시정명령";}).length;
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
    html += statCard("누적 적발 건수", String(strictTotal) + '<small>건</small>', "시정지시 기준 · 개선권고 " + advisoryTotal + "건은 별도 관리(전체 " + state.inspections.length + "건)");
    html += '<div class="stat" id="statOpenIssues" style="cursor:pointer;" title="클릭해서 목록 보기"><div class="label">미개선 건수</div><div class="value">' + openCount + '<small>건</small></div><div class="sub">진행중·미착수 합계 · 클릭해서 목록 보기 ↗</div></div>';
    html += '<div class="stat" id="statNextCheck" style="cursor:pointer;" title="클릭해서 가장 최근 모의점검 내역 보기"><div class="label">다음 모의점검 권장일</div><div class="value">' + (nextCheckDue ? fmtDate(nextCheckDue) : "미실시") + '</div><div class="sub">' + esc(lr ? ("최근 " + lr.roundLabel + " · 위험 " + dangerCats + " / 주의 " + watchCats + " · 클릭해서 보기 ↗") : "아직 등록된 점검 없음") + '</div></div>';
    html += '</div>';

    html += '<div class="grid-stats">';
    html += statCard("가중처벌 적용기간 내 미개선", String(watchStrict.length) + '<small>건</small>', "시정지시 기준 · 적발일로부터 재적발 기준기간 이내 · 재적발 시 처벌 가중 위험", watchStrict.length>0);
    html += statCard("개선기한 초과", String(overdueStrict.length) + '<small>건</small>', "시정지시 기준 · 시정 완료가 지연되고 있는 항목", overdueStrict.length>0);
    html += '</div>';

    var watchLi = function(i){
      var dleft = daysUntil(i.flags.repeatDeadline);
      return '<li class="clickable-row" data-goto-insp="' + i.id + '"><div class="wl-main"><span class="wl-cat">' + esc(catName(i.categoryId)) + '</span><span>' + esc(i.violationDesc || i.lawRef || "(내용 미입력)") + '</span></div>' +
        '<span class="badge warn">D-' + dleft + ' · ' + fmtDate(i.flags.repeatDeadline) + ' 까지</span></li>';
    };
    html += '<div class="panel"><div class="panel-head"><div><h2>가중처벌 위험구간 워치리스트</h2><div class="desc">최초 적발일로부터 재적발 기준기간(기본 3년)이 아직 지나지 않았고, 아직 개선이 완료되지 않은 항목입니다. 이 기간 중 동일 위반이 재적발되면 과태료·처벌이 가중될 수 있습니다. (시정지시와 개선권고는 재적발 위험수준이 달라 구분 표기합니다.)</div></div></div>';
    if (!watch.length){
      html += '<div class="empty-row">해당 항목이 없습니다.</div>';
    } else {
      html += severityGroupBlock("시정지시", watchStrict, watchLi) + severityGroupBlock("개선권고", watchAdvisory, watchLi);
    }
    html += '</div>';

    if (overdue.length){
      var overdueLi = function(i){
        return '<li class="clickable-row" data-goto-insp="' + i.id + '"><div class="wl-main"><span class="wl-cat">' + esc(catName(i.categoryId)) + '</span><span>' + esc(i.violationDesc || i.lawRef || "") + '</span></div>' +
          '<span class="badge danger">기한 ' + fmtDate(i.correctionDeadline) + ' 초과</span></li>';
      };
      html += '<div class="panel"><div class="panel-head"><div><h2>개선기한 초과 항목</h2><div class="desc">개선기한을 넘겼지만 아직 완료 처리되지 않은 항목입니다. (시정지시와 개선권고 구분 표기)</div></div></div>';
      html += severityGroupBlock("시정지시", overdueStrict, overdueLi) + severityGroupBlock("개선권고", overdueAdvisory, overdueLi);
      html += '</div>';
    }

    el.innerHTML = html;
    var openBtn = document.getElementById("statOpenIssues");
    if (openBtn) openBtn.addEventListener("click", openOpenIssuesModal);
    var nextCheckBtn = document.getElementById("statNextCheck");
    if (nextCheckBtn) nextCheckBtn.addEventListener("click", openLatestSelfCheckModal);
    $all("[data-goto-insp]", el).forEach(function(li){
      li.addEventListener("click", function(){ goToInspection(li.getAttribute("data-goto-insp")); });
    });
  }
  function statCard(label, value, sub, flag){
    return '<div class="stat' + (flag?" flag":"") + '"><div class="label">' + esc(label) + '</div><div class="value">' + value + '</div><div class="sub">' + esc(sub||"") + '</div></div>';
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
      strict: list.filter(function(i){ return i.severity === "시정명령"; }),
      advisory: list.filter(function(i){ return i.severity !== "시정명령"; })
    };
  }
  function openOpenIssuesModal(){
    var grouped = openIssuesListGrouped();
    var total = grouped.strict.length + grouped.advisory.length;
    var body = '<h3>미개선 적발사항 (' + total + '건)</h3>' +
      '<p class="hint" style="margin-top:2px;">시정지시(실제 적발)와 개선권고(권고사항)는 재적발 시 위험수준이 달라 구분해 표기합니다.</p>';
    if (!total){
      body += '<p class="hint">미개선 항목이 없습니다.</p>';
    } else {
      var renderIssueLi = function(i){
        return '<li class="clickable-row" data-goto-insp="' + i.id + '"><div class="wl-main"><span class="wl-cat">' + esc(catName(i.categoryId)) + ' · ' + esc(i.status) + '</span><span>' + esc(i.violationDesc || i.lawRef || "-") + '</span></div>' +
          '<span class="mono" style="font-size:11.5px;color:var(--ink-500);flex:none;">' + fmtDate(i.foundDate) + '</span></li>';
      };
      body += '<div style="max-height:420px;overflow-y:auto;">' +
        severityGroupBlock("시정지시", grouped.strict, renderIssueLi) +
        severityGroupBlock("개선권고", grouped.advisory, renderIssueLi) +
      '</div>';
    }
    body += '<div class="modal-actions"><button class="btn ghost" id="closeIssuesModal">닫기</button></div>';
    showModal(body, true);
    document.getElementById("closeIssuesModal").addEventListener("click", closeModal);
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

    var all = state.inspections;
    var list = all.slice();
    if (findingsFilter.severity !== "all") list = list.filter(function(i){ return i.severity === findingsFilter.severity; });
    if (findingsFilter.status !== "all") list = list.filter(function(i){ return i.status === findingsFilter.status; });
    list.sort(function(a,b){ return (b.foundDate||"").localeCompare(a.foundDate||""); });

    html += '<div class="panel" style="padding:14px 16px;display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;">' +
      filterSelect("항목구분", "filterSeverity", findingsFilter.severity, [["all","전체"],["시정명령","시정명령"],["개선권고","개선권고"]]) +
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
        var sevBadge = i.severity === "시정명령" ? '<span class="badge danger">시정명령</span>' : '<span class="badge warn">개선권고</span>';
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
          '<td class="mono">' + (flags.repeatDeadline ? fmtDate(flags.repeatDeadline) : "-") + '</td>' +
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
          severity: (it.severity === "개선권고" ? "개선권고" : "시정명령"),
          lawRef: it.lawRef || "", foundDate: it.foundDate || round.date || todayStr(),
          inspectionType: round.type || "정기", status: "미착수",
          disposition: it.disposition || "", dispositionAmount: it.dispositionAmount ? Number(it.dispositionAmount) : null,
          fineImposed: it.fineImposed === "부과" ? "부과" : "미부과",
          repeatWindowYears: state.meta.defaultRepeatWindowYears,
          correctionDeadline: it.correctionDeadline || "", correctionCompletedDate: "", reportDate: "",
          violationDesc: it.violationDesc || "", correctionPlan: it.correctionPlan || "", correctionResult: "", notes: "AI 자동 인식(첨부파일 기반) — 내용을 검토해주세요."
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
      '<div class="desc">' + (round.date ? fmtDate(round.date) : "일자 미상") + (round.agency ? ' · ' + esc(round.agency) : '') + (round.target ? ' · ' + esc(round.target) : '') + (round.type ? ' · ' + esc(round.type) + '감독' : '') + (round.department ? ' · 담당 ' + esc(round.department) : '') + '</div></div></div>';
    if (round.notes) html += '<div class="item-desc" style="color:var(--ink-500);">' + esc(round.notes) + '</div>';
    if ((round.attachments||[]).length){
      html += '<div class="panel-head" style="margin-top:14px;"><div><h2 style="font-size:14px;">첨부목록</h2></div></div>';
      html += renderAttachmentList(round.attachments, editMode ? "del-round-attach" : null, round.id);
    }
    html += '<div class="panel-head" style="margin-top:14px;"><div><h2 style="font-size:14px;">이 시기 관련 자료 (최종 제출자료 / 시정지시서 / 최종 보고자료)</h2></div></div>';
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
      selectField("구분 *", 'kind', "최종 제출자료", [["최종 제출자료","최종 제출자료"],["시정지시서","시정지시서"],["최종 보고자료","최종 보고자료"],["기타","기타"]]) +
      field("자료명 *", 'input', 'name', "", 'text', '예: 2026년 정기감독 최종 제출자료') +
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

  function inspectionCard(i){
    var flags = computeInspectionFlags(i);
    var sevBadge = i.severity === "시정명령" ? '<span class="badge danger">시정명령</span>' : '<span class="badge warn">개선권고</span>';
    var statusBadge = i.status === "개선완료" ? '<span class="badge good">개선완료</span>' : (flags.overdue ? '<span class="badge danger">기한초과</span>' : '<span class="badge neutral">' + esc(i.status) + '</span>');
    var repeatBadge = (i.status !== "개선완료" && flags.withinWindow) ? '<span class="badge warn">재적발 위험 · D-' + daysUntil(flags.repeatDeadline) + '</span>' : '';
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
        metaField("재적발 기준기간", (i.repeatWindowYears || state.meta.defaultRepeatWindowYears) + "년") +
        metaField("재적발 제한일", flags.repeatDeadline ? fmtDate(flags.repeatDeadline) : "-") +
        metaField("개선기한", i.correctionDeadline ? fmtDate(i.correctionDeadline) : "-") +
        metaField("개선일자", i.correctionCompletedDate ? fmtDate(i.correctionCompletedDate) : "-") +
        metaField("보고일자", i.reportDate ? fmtDate(i.reportDate) : "-") +
      '</div>' +
      (i.correctionPlan || i.correctionResult ? '<div class="item-meta" style="margin-top:2px;">' +
        (i.correctionPlan ? '<div class="full"><div class="k">개선방안</div><div class="v" style="white-space:pre-wrap;">' + esc(i.correctionPlan) + '</div></div>' : '') +
        (i.correctionResult ? '<div class="full"><div class="k">개선결과</div><div class="v" style="white-space:pre-wrap;">' + esc(i.correctionResult) + '</div></div>' : '') +
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
    var previewDeadline = insp.foundDate ? addYears(insp.foundDate, insp.repeatWindowYears || state.meta.defaultRepeatWindowYears) : null;
    var curRoundId = insp.roundId || presetRoundId || "";
    var roundOpts = '<option value="">(연결 안 함)</option>' + (state.inspectionRounds||[]).slice().sort(function(a,b){ return (b.date||"").localeCompare(a.date||""); }).map(function(r){
      return '<option value="' + r.id + '"' + (r.id === curRoundId ? " selected" : "") + '>' + esc(r.label) + '</option>';
    }).join("");
    return (
      '<form class="f" data-insp-id="' + (insp.id||"") + '">' +
        '<label>카테고리 *<select name="categoryId">' + catOpts + '</select></label>' +
        selectField("항목 구분 *", 'severity', insp.severity, [["시정명령","시정명령"],["개선권고","개선권고"]]) +
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
        '<div class="full" style="font-size:12px;color:var(--ink-500);margin-top:-4px;">재적발 제한일 (자동계산): <span class="mono repeat-preview">' + (previewDeadline ? fmtDate(previewDeadline) : "-") + '</span></div>' +
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
      var fd = foundDateInput.value, yrs = Number(yearsInput.value) || state.meta.defaultRepeatWindowYears;
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
      (editMode ? '<button class="btn sm" id="btnAddLegalItem">+ 법령 변경사항 기록</button>' : '') + '</div>';
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
