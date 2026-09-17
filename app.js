import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged } from "./firebase-init.js";
import { ALLOWED_EMAIL } from "./firebase-config.js";
import * as data from "./data.js";
import { createRecognizer, isSpeechSupported } from "./speech.js";

const appEl = document.getElementById("app");
const state = {
  user: null,
  students: [],
  selectedStudent: null,   // {id, name, klass, grade}
  target: "導師",
  targetCustom: "",
  transcript: "",
  tags: new Set(),
  lastRecord: null,
  recordDate: todayInputStr(),
  period: ""
};
const ALL_TAGS = ["情緒激動","離座","深呼吸","提示引導","任務分解","增強","替代行為","冷靜角","交回條/聯絡簿","身體不適"];
const PERIOD_OPTIONS = ["早自習","第1節","第2節","第3節","第4節","午休","第5節","第6節","第7節","第8節","課後","其他"];

function todayInputStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function inputDateToDisplay(iso) {
  // "2026-09-17" -> "2026/9/17"
  const [y, m, d] = iso.split("-");
  return `${y}/${Number(m)}/${Number(d)}`;
}

// ---------------- 路由 ----------------
function go(route) { location.hash = route; }
window.addEventListener("hashchange", render);

function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1800);
}

const icon = (path) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
const backBtn = () => `<div class="iconbtn" id="backBtn">${icon('<path d="M15 18l-6-6 6-6"/>')}</div>`;

// ---------------- Auth ----------------
onAuthStateChanged(auth, (user) => {
  state.user = user;
  render();
});

function renderAuth(errorMsg) {
  appEl.innerHTML = `
    <div class="auth-wrap">
      <h1>輔導紀錄小幫手</h1>
      <p>請使用您的學校 Google 帳號登入，<br>資料只有您本人看得到。</p>
      ${errorMsg ? `<div class="auth-error">${errorMsg}</div>` : ""}
      <button class="btn-google" id="loginBtn">${icon('<circle cx="12" cy="12" r="9"/>')}使用 Google 帳號登入</button>
    </div>`;
  document.getElementById("loginBtn").onclick = async () => {
    try {
      const res = await signInWithPopup(auth, googleProvider);
      if (res.user.email !== ALLOWED_EMAIL) {
        await signOut(auth);
        render(null, "這個系統目前僅開放給指定帳號使用，您登入的帳號沒有權限。");
      }
    } catch (e) {
      renderAuth("登入失敗：" + e.message);
    }
  };
}

// ---------------- Shell / Nav ----------------
function shell(contentHtml, activeNav) {
  appEl.innerHTML = `
    <div id="content"></div>
    <div class="bottom-nav">
      ${navBtn("home", "首頁", '<path d="M3 11l9-7 9 7"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/>')}
      ${navBtn("tracking", "待追蹤", '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>')}
      ${navBtn("analysis", "資料分析", '<path d="M4 19V9M12 19V5M20 19v-7"/>')}
    </div>`;
  document.getElementById("content").innerHTML = contentHtml;
  document.querySelectorAll(".nav-btn").forEach(b => {
    b.onclick = () => go("#/" + b.dataset.route);
  });
  function navBtn(route, label, path) {
    return `<button class="nav-btn ${activeNav === route ? "active" : ""}" data-route="${route}">${icon(path)}<span>${label}</span></button>`;
  }
}

// ---------------- 首頁 ----------------
function renderHome() {
  const tiles = [
    { route: "pick", primary: true, title: "學生輔導紀錄", sub: "語音輸入・自動帶班導", icon: '<path d="M9 2v12"/><rect x="4" y="14" width="10" height="8" rx="2"/><circle cx="9" cy="6" r="3"/>' },
    { route: "tracking", title: "待追蹤事項", sub: "", icon: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18"/>' },
    { route: "iep", title: "IEP 目標關聯", sub: "", icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>' },
    { route: "analysis", title: "資料分析", sub: "學生歷程與進步分析", icon: '<path d="M4 19V9M12 19V5M20 19v-7"/>' }
  ];
  const html = `
    <div class="topbar"><div class="title">輔導紀錄小幫手</div>
      <div class="iconbtn" id="logoutBtn">${icon('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>')}</div>
    </div>
    <div class="home-grid">
      ${tiles.map(t => `
        <button class="home-tile ${t.primary ? "primary" : ""}" data-route="${t.route}">
          <div class="icon">${icon(t.icon)}</div>
          <div><div class="tile-title">${t.title}</div>${t.sub ? `<div class="tile-sub">${t.sub}</div>` : ""}</div>
        </button>`).join("")}
    </div>`;
  shell(html, "home");
  document.querySelectorAll(".home-tile").forEach(b => b.onclick = () => go("#/" + b.dataset.route));
  document.getElementById("logoutBtn").onclick = () => signOut(auth);
}

// ---------------- 選學生 ----------------
async function renderPicker() {
  shell(`<div class="loading">載入學生名單中…</div>`, "home");
  state.students = await data.getStudents(true);
  drawPicker("");
}
function drawPicker(filterText) {
  const filtered = state.students.filter(s =>
    (s.name || "").includes(filterText) || (s.klass || "").includes(filterText));
  const html = `
    <div class="topbar">${backBtn()}<div class="title">選擇學生</div></div>
    <div class="search">${icon('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>')}<input id="searchBox" placeholder="搜尋學生姓名或班級" value="${filterText}"></div>
    <div class="list" id="studentList">
      ${filtered.length ? filtered.map(s => `
        <div class="row ${state.selectedStudent && state.selectedStudent.id === s.id ? "selected" : ""}" data-id="${s.id}">
          <div class="avatar">${(s.name || "?").slice(-1)}</div>
          <div class="row-main"><div class="row-name-line"><span class="row-name">${s.name}</span><span class="row-class">${s.klass || ""}</span></div>
          <span class="row-class">${s.grade || ""}</span></div>
        </div>`).join("") : `<div class="empty-hint">目前沒有學生資料，請先在下方新增。</div>`}
    </div>
    <div style="padding:0 20px 8px;display:flex;gap:10px;">
      <button class="cta secondary" id="addStudentBtn" style="flex:1;">＋ 新增學生</button>
      <button class="cta secondary" id="importBtn" style="flex:1;">📋 匯入名單</button>
    </div>
    ${state._showImport ? `
    <div class="card" style="margin:0 20px 14px;">
      <div class="sec-label">貼上多位學生名單，一行一位</div>
      <div style="font-size:11.5px;color:var(--text-muted);margin-bottom:8px;line-height:1.6;">
        格式：班級 姓名 年級（用空白或逗號分隔，年級可省略）<br>例如：<br>210 洪峻耀 國二<br>101 王小明 國一
      </div>
      <textarea class="transcript" id="importBox" placeholder="210 洪峻耀 國二&#10;101 王小明 國一"></textarea>
      <button class="cta" id="importConfirmBtn" style="margin-top:10px;">確認匯入</button>
    </div>` : ""}
    ${state.selectedStudent ? `
    <div class="teacher-card">${icon('<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.9 3.1-6 7-6s7 2.1 7 6"/>')}
      <div class="teacher-text">已選擇：<b>${state.selectedStudent.klass || ""}${state.selectedStudent.name}</b>（${state.selectedStudent.grade || ""}）</div>
    </div>
    <div class="target-section">
      <div class="target-label">本次記錄對象・跟誰談的</div>
      <div class="target-row">
        ${["學生本人","家長","導師","自行輸入"].map(t => `<div class="target-pill ${state.target === t ? "active" : ""}" data-target="${t}">${t}</div>`).join("")}
      </div>
      ${state.target === "自行輸入" ? `<input class="target-custom-input" id="targetCustomInput" placeholder="請輸入對象" value="${state.targetCustom}">` : ""}
    </div>` : ""}
    <div class="cta-wrap"><button class="cta" id="nextBtn" ${state.selectedStudent ? "" : "disabled"}>下一步：開始語音記錄</button></div>`;
  document.getElementById("content").innerHTML = html;
  document.getElementById("backBtn").onclick = () => go("#/home");
  document.getElementById("searchBox").oninput = (e) => drawPicker(e.target.value);
  document.getElementById("addStudentBtn").onclick = onAddStudent;
  document.getElementById("importBtn").onclick = () => { state._showImport = !state._showImport; drawPicker(filterText); };
  const importConfirmBtn = document.getElementById("importConfirmBtn");
  if (importConfirmBtn) importConfirmBtn.onclick = () => onImportStudents(filterText);
  document.querySelectorAll(".row").forEach(r => r.onclick = () => {
    state.selectedStudent = state.students.find(s => s.id === r.dataset.id);
    drawPicker(filterText);
  });
  document.querySelectorAll(".target-pill").forEach(p => p.onclick = () => {
    state.target = p.dataset.target;
    drawPicker(filterText);
  });
  const customInput = document.getElementById("targetCustomInput");
  if (customInput) customInput.oninput = (e) => state.targetCustom = e.target.value;
  const nextBtn = document.getElementById("nextBtn");
  if (nextBtn) nextBtn.onclick = () => {
    state.transcript = ""; state.tags.clear();
    state.recordDate = todayInputStr(); state.period = "";
    go("#/voice");
  };
}
async function onAddStudent() {
  const klass = prompt("班級（例如 210）：");
  if (klass === null) return;
  const name = prompt("姓名：");
  if (name === null || !name.trim()) return;
  const grade = prompt("年級（國一／國二／國三）：", "國一");
  if (grade === null) return;
  await data.addStudent({ name: name.trim(), klass: klass.trim(), grade: grade.trim() });
  toast("已新增學生");
  renderPicker();
}
async function onImportStudents(filterText) {
  const box = document.getElementById("importBox");
  const { valid, invalid } = data.parseStudentLines(box.value);
  if (!valid.length) { toast("沒有解析到任何學生，請檢查格式"); return; }
  const btn = document.getElementById("importConfirmBtn");
  btn.disabled = true;
  btn.textContent = "匯入中…";
  await data.addStudentsBulk(valid);
  state._showImport = false;
  toast(`已匯入 ${valid.length} 位學生${invalid.length ? `，${invalid.length} 行格式錯誤未匯入` : ""}`);
  if (invalid.length) alert("以下這幾行看不懂格式，沒有匯入：\n" + invalid.join("\n"));
  await renderPicker();
}

// ---------------- 語音輸入 ----------------
let recognizer = null;
function renderVoice() {
  if (!state.selectedStudent) { go("#/pick"); return; }
  const targetLabel = state.target === "自行輸入" ? (state.targetCustom || "自行輸入") : state.target;
  const html = `
    <div class="topbar">${backBtn()}<div class="title">語音輸入紀錄</div></div>
    <div class="ctx-chip">${state.selectedStudent.klass || ""}${state.selectedStudent.name}．${state.selectedStudent.grade || ""}．對象：${targetLabel}</div>
    <section class="sec" style="padding-top:2px;">
      <div class="sec-label">紀錄時間</div>
      <div style="display:flex;gap:10px;">
        <input type="date" id="recordDateInput" value="${state.recordDate}" style="flex:1;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13.5px;background:var(--surface);color:var(--text);">
        <select id="periodSelect" style="flex:1;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13.5px;background:var(--surface);color:var(--text);">
          <option value="">節次（選填）</option>
          ${PERIOD_OPTIONS.map(p => `<option value="${p}" ${state.period === p ? "selected" : ""}>${p}</option>`).join("")}
        </select>
      </div>
      ${state.period === "其他" ? `<input id="periodCustomInput" placeholder="請輸入節次／時段" value="${state.periodCustom || ""}" style="margin-top:8px;width:100%;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13.5px;">` : ""}
    </section>
    <div class="mic-area">
      <button class="mic-btn" id="micBtn">${icon('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>')}</button>
      <div class="mic-label" id="micLabel">${isSpeechSupported() ? "點擊開始語音輸入" : "此瀏覽器不支援語音輸入，請直接輸入文字"}</div>
    </div>
    <section class="sec">
      <div class="sec-label">輔導紀錄內容（可直接修改文字）</div>
      <textarea class="transcript" id="transcriptBox" placeholder="可語音輸入，或直接在這裡打字…">${state.transcript}</textarea>
    </section>
    <section class="sec">
      <div class="sec-label">快速標籤（選填）</div>
      <div class="tags-wrap">
        ${ALL_TAGS.map(t => `<div class="tag-pill ${state.tags.has(t) ? "on" : ""}" data-tag="${t}">${t}</div>`).join("")}
      </div>
    </section>
    <div class="cta-wrap"><button class="cta" id="nextBtn">下一步：產生訊息</button></div>`;
  shell(html, "");
  attachVoiceHandlers();
}
function attachVoiceHandlers() {
  document.getElementById("backBtn").onclick = () => go("#/pick");
  const box = document.getElementById("transcriptBox");
  box.oninput = (e) => state.transcript = e.target.value;
  document.getElementById("recordDateInput").onchange = (e) => { state.recordDate = e.target.value || todayInputStr(); };
  document.getElementById("periodSelect").onchange = (e) => { state.period = e.target.value; renderVoice(); };
  const periodCustomInput = document.getElementById("periodCustomInput");
  if (periodCustomInput) periodCustomInput.oninput = (e) => state.periodCustom = e.target.value;
  document.querySelectorAll(".tag-pill").forEach(p => p.onclick = () => {
    const t = p.dataset.tag;
    if (state.tags.has(t)) state.tags.delete(t); else state.tags.add(t);
    p.classList.toggle("on");
  });
  document.getElementById("nextBtn").onclick = () => {
    state.transcript = box.value;
    if (!state.transcript.trim()) { toast("請先輸入輔導紀錄內容"); return; }
    go("#/messages");
  };
  const micBtn = document.getElementById("micBtn");
  const micLabel = document.getElementById("micLabel");
  if (!isSpeechSupported()) { micBtn.disabled = true; return; }
  let recording = false;
  micBtn.onclick = () => {
    if (!recording) {
      recognizer = createRecognizer({
        onResult: (final, interim) => { box.value = (state.transcript ? state.transcript + " " : "") + final + interim; },
        onEnd: (final) => { state.transcript = (state.transcript ? state.transcript + " " : "") + final; box.value = state.transcript; },
        onError: () => toast("語音辨識發生錯誤，請重試或直接打字")
      });
      recognizer.start();
      recording = true;
      micBtn.classList.add("recording");
      micLabel.textContent = "錄音中…再點一次結束";
    } else {
      recognizer && recognizer.stop();
      recording = false;
      micBtn.classList.remove("recording");
      micLabel.textContent = "點擊開始語音輸入";
    }
  };
}

// ---------------- 產生訊息（樣板文字，非 AI） ----------------
function currentPeriodLabel() {
  return state.period === "其他" ? (state.periodCustom || "") : state.period;
}
function buildMessage(kind) {
  const s = state.selectedStudent;
  const [y, m, d] = state.recordDate.split("-");
  const periodLabel = currentPeriodLabel();
  const dateStr = `${Number(m)}/${Number(d)}${periodLabel ? " " + periodLabel : ""}`;
  const content = state.transcript.trim();
  if (kind === "teacher") {
    return `○○老師您好，${dateStr} 與${s.klass || ""}${s.name}談話，內容摘要如下：\n${content}\n以上提供您參考，如有需要請再與我聯繫，謝謝老師！`;
  }
  return `${s.name}家長您好，${dateStr}${content}\n如有任何問題歡迎與我聯繫，謝謝！`;
}
function renderMessages() {
  if (!state.selectedStudent) { go("#/pick"); return; }
  if (state._msgTab === undefined) state._msgTab = "teacher";
  if (state._teacherMsg === undefined) state._teacherMsg = buildMessage("teacher");
  if (state._parentMsg === undefined) state._parentMsg = buildMessage("parent");
  drawMessages();
}
function drawMessages() {
  const isTeacher = state._msgTab === "teacher";
  const html = `
    <div class="topbar">${backBtn()}<div class="title">產生訊息</div></div>
    <div class="status-line">${state.selectedStudent.klass || ""}${state.selectedStudent.name}．依語音紀錄自動套版（未使用 AI 潤飾）</div>
    <div class="tabs">
      <button class="tab ${isTeacher ? "active" : ""}" data-tab="teacher">導師版</button>
      <button class="tab ${!isTeacher ? "active" : ""}" data-tab="parent">家長版</button>
    </div>
    <div class="card">
      <textarea class="msg-text" id="msgBox">${isTeacher ? state._teacherMsg : state._parentMsg}</textarea>
    </div>
    <div class="actions">
      <div class="action-btn" id="copyBtn">${icon('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>')}複製</div>
      <div class="action-btn primary" id="uploadBtn">${icon('<path d="M7 18a4.5 4.5 0 0 1-1-8.9A5.5 5.5 0 0 1 16.9 8 4 4 0 0 1 17 16"/><path d="M12 12v7M9.5 16.5 12 14l2.5 2.5"/>')}上傳雲端</div>
    </div>
    <div class="disclaimer">此版本未串接 AI 潤飾，訊息由樣板自動套入語音紀錄文字產生，傳送前請自行檢查用語是否得體。</div>`;
  document.getElementById("content").innerHTML = html;
  document.getElementById("backBtn").onclick = () => go("#/voice");
  document.querySelectorAll(".tab").forEach(t => t.onclick = () => {
    if (isTeacher) state._teacherMsg = document.getElementById("msgBox").value;
    else state._parentMsg = document.getElementById("msgBox").value;
    state._msgTab = t.dataset.tab;
    drawMessages();
  });
  document.getElementById("copyBtn").onclick = async () => {
    await navigator.clipboard.writeText(document.getElementById("msgBox").value);
    toast("已複製到剪貼簿");
  };
  document.getElementById("uploadBtn").onclick = async () => {
    const msgBox = document.getElementById("msgBox");
    if (isTeacher) state._teacherMsg = msgBox.value; else state._parentMsg = msgBox.value;
    const s = state.selectedStudent;
    const dateStr = inputDateToDisplay(state.recordDate);
    const ref = await data.addRecord({
      studentId: s.id,
      studentDisplay: `${s.klass || ""}${s.name}`,
      grade: s.grade || "",
      target: state.target === "自行輸入" ? (state.targetCustom || "自行輸入") : state.target,
      content: state.transcript,
      teacherMessage: state._teacherMsg,
      parentMessage: state._parentMsg,
      tags: Array.from(state.tags),
      date: dateStr,
      period: currentPeriodLabel()
    });
    state.lastRecord = { id: ref.id, studentDisplay: `${s.klass || ""}${s.name}` };
    toast("已上傳雲端");
    go("#/track-add");
  };
}

// ---------------- 上傳後：詢問是否建立追蹤 ----------------
function renderTrackAdd() {
  const html = `
    <div class="topbar">${backBtn()}<div class="title">建立後續追蹤（選填）</div></div>
    <div class="card" style="margin-top:10px;">
      <div class="sec-label">追蹤內容</div>
      <textarea class="transcript" id="descBox" placeholder="例如：追蹤情緒調節策略成效"></textarea>
      <div class="sec-label" style="margin-top:14px;">預計追蹤日期</div>
      <input type="date" id="dueDate" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;">
    </div>
    <div class="cta-wrap">
      <button class="cta" id="saveTrackBtn">建立追蹤提醒</button>
      <button class="cta secondary" id="skipBtn" style="margin-top:10px;">不需要，回首頁</button>
    </div>`;
  shell(html, "home");
  document.getElementById("backBtn").onclick = () => go("#/home");
  document.getElementById("skipBtn").onclick = () => go("#/home");
  document.getElementById("saveTrackBtn").onclick = async () => {
    const desc = document.getElementById("descBox").value.trim();
    const due = document.getElementById("dueDate").value;
    if (!desc || !due) { toast("請填寫追蹤內容與日期"); return; }
    await data.addTracking({
      studentId: state.selectedStudent.id,
      studentDisplay: state.lastRecord.studentDisplay,
      description: desc,
      dueDate: due.replace(/-/g, "/"),
      recordId: state.lastRecord.id
    });
    toast("已建立追蹤提醒");
    go("#/home");
  };
}

// ---------------- 待追蹤事項 ----------------
async function renderTracking() {
  shell(`<div class="loading">載入中…</div>`, "tracking");
  const list = await data.getTracking();
  drawTracking(list, "all");
}
function drawTracking(list, filter) {
  let filtered = list;
  if (filter === "late") filtered = list.filter(t => t.status === "late");
  if (filter === "week") {
    const in7 = new Date(); in7.setDate(in7.getDate() + 7);
    const in7s = in7.toISOString().slice(0, 10).replace(/-/g, "/");
    filtered = list.filter(t => t.status !== "done" && t.dueDate <= in7s);
  }
  const html = `
    <div class="topbar"><div class="title">待追蹤事項</div></div>
    <div class="chips">
      <div class="chip ${filter === "all" ? "active" : ""}" data-f="all">全部</div>
      <div class="chip ${filter === "week" ? "active" : ""}" data-f="week">本週</div>
      <div class="chip ${filter === "late" ? "active" : ""}" data-f="late">已逾期</div>
    </div>
    <div class="list">
      ${filtered.length ? filtered.map(t => `
        <div class="item ${t.status === "late" ? "overdue" : ""}">
          <div class="item-top">
            <div class="who"><div class="avatar-sm">${(t.studentDisplay || "?").slice(-1)}</div><span class="who-name">${t.studentDisplay || ""}</span></div>
            <div class="status-pill ${t.status === "late" ? "late" : t.status === "done" ? "done" : "due"}">${t.status === "late" ? "已逾期" : t.status === "done" ? "已完成" : "追蹤中"}</div>
          </div>
          <div class="item-desc">${t.description}</div>
          <div class="item-meta">${icon('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>')}預定 ${t.dueDate}</div>
          ${t.status !== "done" ? `<div class="item-actions"><button data-done="${t.id}">標記完成</button></div>` : ""}
        </div>`).join("") : `<div class="empty-hint">目前沒有追蹤事項</div>`}
    </div>`;
  shell(html, "tracking");
  document.querySelectorAll(".chip").forEach(c => c.onclick = () => drawTracking(list, c.dataset.f));
  document.querySelectorAll("[data-done]").forEach(b => b.onclick = async () => {
    await data.markTrackingDone(b.dataset.done);
    renderTracking();
  });
}

// ---------------- IEP 目標關聯 ----------------
async function renderIep() {
  shell(`<div class="loading">載入中…</div>`, "home");
  state.students = state.students.length ? state.students : await data.getStudents(true);
  const html = `
    <div class="topbar">${backBtn()}<div class="title">IEP 目標關聯</div></div>
    <div class="search">${icon('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>')}
      <select id="iepStudentSelect" style="border:none;background:transparent;flex:1;font-size:14px;outline:none;">
        <option value="">請選擇學生</option>
        ${state.students.map(s => `<option value="${s.id}">${s.klass || ""}${s.name}</option>`).join("")}
      </select>
    </div>
    <div id="iepGoalsArea"></div>
    <div style="padding:0 20px;"><button class="cta secondary" id="addGoalBtn">＋ 新增目標</button></div>`;
  document.getElementById("content").innerHTML = html;
  document.getElementById("backBtn").onclick = () => go("#/home");
  async function loadGoals() {
    const sid = document.getElementById("iepStudentSelect").value;
    const area = document.getElementById("iepGoalsArea");
    if (!sid) { area.innerHTML = ""; return; }
    area.innerHTML = `<div class="loading">載入中…</div>`;
    const goals = await data.getIepGoals(sid);
    area.innerHTML = goals.length ? goals.map(g => `
      <div class="goal-card">
        <div class="goal-title">${g.goalTitle}</div>
        <div class="progress-track"><div class="progress-fill" style="width:${g.progress || 0}%"></div></div>
        <div class="goal-notes">${g.notes || ""}</div>
      </div>`).join("") : `<div class="empty-hint">這位學生還沒有 IEP 目標</div>`;
  }
  document.getElementById("iepStudentSelect").onchange = loadGoals;
  document.getElementById("addGoalBtn").onclick = async () => {
    const sid = document.getElementById("iepStudentSelect").value;
    if (!sid) { toast("請先選擇學生"); return; }
    const s = state.students.find(x => x.id === sid);
    const title = prompt("目標名稱：");
    if (!title) return;
    const progress = Number(prompt("目前進度（0-100）：", "0")) || 0;
    const notes = prompt("備註（選填）：", "") || "";
    await data.upsertIepGoal({ studentId: sid, studentDisplay: `${s.klass || ""}${s.name}`, goalTitle: title, progress, notes });
    loadGoals();
  };
}

// ---------------- 資料分析 ----------------
async function renderAnalysis() {
  shell(`<div class="loading">載入中…</div>`, "analysis");
  state.students = state.students.length ? state.students : await data.getStudents(true);
  const html = `
    <div class="topbar"><div class="title">學生歷程・資料分析</div></div>
    <div class="search">${icon('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>')}
      <select id="anaStudentSelect" style="border:none;background:transparent;flex:1;font-size:14px;outline:none;">
        <option value="">請選擇學生</option>
        ${state.students.map(s => `<option value="${s.id}">${s.klass || ""}${s.name}</option>`).join("")}
      </select>
    </div>
    <div id="anaArea"></div>`;
  document.getElementById("content").innerHTML = html;
  const anaSelect = document.getElementById("anaStudentSelect");
  anaSelect.onchange = async (e) => {
    const sid = e.target.value;
    const area = document.getElementById("anaArea");
    if (!sid) { area.innerHTML = ""; return; }
    area.innerHTML = `<div class="loading">分析中…</div>`;
    const records = await data.getRecordsForStudent(sid);
    if (!records.length) { area.innerHTML = `<div class="empty-hint">這位學生還沒有輔導紀錄</div>`; return; }
    const targetCount = {};
    records.forEach(r => { targetCount[r.target] = (targetCount[r.target] || 0) + 1; });
    const byMonth = {};
    records.forEach(r => { const m = (r.date || "").slice(0, 7); byMonth[m] = (byMonth[m] || 0) + 1; });
    const months = Object.keys(byMonth).sort();
    const max = Math.max(1, ...months.map(m => byMonth[m]));
    const points = months.map((m, i) => `${(i / Math.max(1, months.length - 1)) * 260 + 10},${60 - (byMonth[m] / max) * 50}`).join(" ");
    area.innerHTML = `
      <div class="stat-row">
        <div class="stat-tile"><div class="stat-num">${records.length}</div><div class="stat-label">總紀錄數</div></div>
        <div class="stat-tile"><div class="stat-num">${records[0].date}</div><div class="stat-label">最近一次</div></div>
        <div class="stat-tile"><div class="stat-num">${Object.entries(targetCount).map(([k,v]) => k[0]+v).join(" ")}</div><div class="stat-label">對象分布</div></div>
      </div>
      ${months.length > 1 ? `<div class="card" style="margin:0 20px 16px;"><div class="sec-label">每月紀錄次數趨勢</div>
        <svg width="100%" height="70" viewBox="0 0 280 70"><polyline points="${points}" fill="none" stroke="var(--sage)" stroke-width="2.5"/></svg></div>` : ""}
      <section class="sec"><div class="sec-label">歷史紀錄（點一下可修改）</div>
        ${records.map(r => `<div class="timeline-item" data-record-id="${r.id}" style="cursor:pointer;"><span class="timeline-date">${r.date}${r.period ? " ．" + r.period : ""}</span><span class="timeline-target">${r.target}</span><div class="timeline-text">${r.content}</div></div>`).join("")}
      </section>`;
    area.querySelectorAll("[data-record-id]").forEach(el => el.onclick = () => {
      state.editRecordId = el.dataset.recordId;
      state.editReturnStudentId = sid;
      go("#/record-edit");
    });
  };
  if (state.editReturnStudentId) {
    anaSelect.value = state.editReturnStudentId;
    state.editReturnStudentId = null;
    anaSelect.onchange({ target: anaSelect });
  }
}

// ---------------- 修改既有紀錄 ----------------
async function renderRecordEdit() {
  if (!state.editRecordId) { go("#/analysis"); return; }
  shell(`<div class="loading">載入中…</div>`, "analysis");
  const r = await data.getRecord(state.editRecordId);
  if (!r) { toast("找不到這筆紀錄"); go("#/analysis"); return; }
  const [y, m, d] = (r.date || "").split("/");
  const dateInputVal = y && m && d ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : todayInputStr();
  const isOtherPeriod = r.period && !PERIOD_OPTIONS.includes(r.period);
  const html = `
    <div class="topbar">${backBtn()}<div class="title">修改輔導紀錄</div></div>
    <div class="ctx-chip">${r.studentDisplay || ""}．${r.grade || ""}</div>
    <section class="sec">
      <div class="sec-label">紀錄時間</div>
      <div style="display:flex;gap:10px;">
        <input type="date" id="editDateInput" value="${dateInputVal}" style="flex:1;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13.5px;">
        <select id="editPeriodSelect" style="flex:1;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13.5px;">
          <option value="">節次（選填）</option>
          ${PERIOD_OPTIONS.map(p => `<option value="${p}" ${r.period === p || (isOtherPeriod && p === "其他") ? "selected" : ""}>${p}</option>`).join("")}
        </select>
      </div>
      ${isOtherPeriod ? `<input id="editPeriodCustom" value="${r.period}" style="margin-top:8px;width:100%;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13.5px;">` : ""}
    </section>
    <section class="sec">
      <div class="sec-label">對象</div>
      <div class="target-row">
        ${["學生本人","家長","導師","自行輸入"].map(t => `<div class="target-pill ${r.target === t || (t === "自行輸入" && !["學生本人","家長","導師"].includes(r.target)) ? "active" : ""}" data-target="${t}">${t}</div>`).join("")}
      </div>
      <input id="editTargetCustom" placeholder="自訂對象" value="${!["學生本人","家長","導師"].includes(r.target) ? r.target : ""}" style="margin-top:8px;width:100%;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13.5px;display:${!["學生本人","家長","導師"].includes(r.target) ? "block" : "none"};">
    </section>
    <section class="sec">
      <div class="sec-label">輔導紀錄內容</div>
      <textarea class="transcript" id="editContentBox">${r.content || ""}</textarea>
    </section>
    <div class="cta-wrap">
      <button class="cta" id="saveEditBtn">儲存修改</button>
      <button class="cta secondary" id="deleteRecordBtn" style="margin-top:10px;color:var(--rust);">刪除這筆紀錄</button>
    </div>`;
  document.getElementById("content").innerHTML = html;
  document.getElementById("backBtn").onclick = () => { go("#/analysis"); };
  let target = r.target;
  document.querySelectorAll("#content .target-pill").forEach(p => p.onclick = () => {
    target = p.dataset.target;
    document.querySelectorAll("#content .target-pill").forEach(x => x.classList.remove("active"));
    p.classList.add("active");
    document.getElementById("editTargetCustom").style.display = target === "自行輸入" ? "block" : "none";
  });
  document.getElementById("saveEditBtn").onclick = async () => {
    const dateVal = document.getElementById("editDateInput").value;
    let period = document.getElementById("editPeriodSelect").value;
    if (period === "其他") period = document.getElementById("editPeriodCustom")?.value || "其他";
    let finalTarget = target;
    if (target === "自行輸入") finalTarget = document.getElementById("editTargetCustom").value || "自行輸入";
    await data.updateRecord(r.id, {
      date: inputDateToDisplay(dateVal),
      period,
      target: finalTarget,
      content: document.getElementById("editContentBox").value
    });
    toast("已儲存修改");
    go("#/analysis");
  };
  document.getElementById("deleteRecordBtn").onclick = async () => {
    if (!confirm("確定要刪除這筆輔導紀錄嗎？此動作無法復原。")) return;
    await data.deleteRecord(r.id);
    toast("已刪除");
    go("#/analysis");
  };
}

// ---------------- 主渲染 ----------------
function render(_, authError) {
  if (!state.user) { renderAuth(authError); return; }
  const route = (location.hash.replace("#/", "") || "home").split("?")[0];
  const routes = {
    home: renderHome, pick: renderPicker, voice: renderVoice,
    messages: renderMessages, "track-add": renderTrackAdd,
    tracking: renderTracking, iep: renderIep, analysis: renderAnalysis,
    "record-edit": renderRecordEdit
  };
  (routes[route] || renderHome)();
}
render();
