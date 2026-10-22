// ===== 锻炼计划生成器 =====

// 难度/强度映射
const LEVELS = { 1: "入门", 2: "标准", 3: "进阶" };
const TYPE_CN = { static: "静态保持", dynamic: "动态动作" };

// 目标 -> 动作标签权重
const GOAL_TAGS = {
  "预防肌肉减少": ["防肌肉流失"],
  "下肢力量": ["下肢"],
  "上肢力量": ["上肢"],
  "核心稳定": ["核心"],
  "柔韧拉伸": ["拉伸"],
};

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// HTML 转义（防用户名输入注入）
function esc(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

// 图片加载失败自动重试一次（CDN 偶发超时）
function imgRetry(el) {
  if (el.dataset.retried) return;
  el.dataset.retried = "1";
  const src = el.src;
  setTimeout(() => { el.src = src + (src.includes("?") ? "&" : "?") + "r=1"; }, 800);
}

function getForm() {
  const goals = [...document.querySelectorAll('input[name=goal]:checked')].map(e => e.value);
  const level = document.querySelector('input[name=intensity]:checked').value; // easy|normal|hard
  const minutes = parseInt(document.querySelector('input[name=minutes]:checked').value, 10);
  const pref = document.querySelector('input[name=pref]:checked').value; // static|mix|dynamic
  return { goals: goals.length ? goals : ["预防肌肉减少"], level, minutes, pref };
}

function levelCap(level) { return level === "easy" ? 1 : level === "normal" ? 2 : 3; }

function pickExercises(pool, n, typePref) {
  // typePref: 'static' | 'dynamic' | 'mix'
  pool = shuffle(pool);
  let statics = pool.filter(e => e.type === "static");
  let dynamics = pool.filter(e => e.type === "dynamic");
  let out = [];
  if (typePref === "static") {
    out = statics.concat(dynamics);
  } else if (typePref === "dynamic") {
    out = dynamics.concat(statics);
  } else {
    // 动静结合：交错
    const m = Math.max(statics.length, dynamics.length);
    for (let i = 0; i < m; i++) {
      if (i < statics.length) out.push(statics[i]);
      if (i < dynamics.length) out.push(dynamics[i]);
    }
  }
  // 去重保序
  const seen = new Set(); out = out.filter(e => !seen.has(e.id) && seen.add(e.id));
  return out.slice(0, n);
}

function dosing(ex, level) {
  if (ex.type === "static") {
    const hold = level === "easy" ? 20 : level === "normal" ? 30 : 45;
    const sets = level === "easy" ? 2 : 3;
    const rest = level === "easy" ? 30 : level === "normal" ? 45 : 60;
    return { text: `每组保持 ${hold} 秒 × ${sets} 组`, rest: `组间休息 ${rest} 秒` };
  }
  const reps = level === "easy" ? 8 : level === "normal" ? 12 : 15;
  const sets = level === "easy" ? 2 : 3;
  const rest = level === "easy" ? 30 : level === "normal" ? 45 : 60;
  return { text: `每组 ${reps} 次 × ${sets} 组`, rest: `组间休息 ${rest} 秒` };
}

function generatePlan() {
  const f = getForm();
  const cap = levelCap(f.level);

  // 按目标收集候选
  let wanted = new Set();
  f.goals.forEach(g => (GOAL_TAGS[g] || []).forEach(t => wanted.add(t)));
  let pool = EXERCISES.filter(e => e.level <= cap && e.tags.some(t => wanted.has(t)));
  if (pool.length < 4) pool = EXERCISES.filter(e => e.level <= cap); // 兜底

  const mainCount = f.minutes <= 15 ? 5 : f.minutes <= 30 ? 8 : 11;
  const typePref = f.pref === "static" ? "static" : f.pref === "dynamic" ? "dynamic" : "mix";

  const warmupPool = EXERCISES.filter(e => e.tags.includes("拉伸") && e.level <= cap);
  const warmup = shuffle(warmupPool).slice(0, 2);
  const main = pickExercises(pool.filter(e => !e.tags.includes("拉伸")), mainCount, typePref);
  const cooldown = shuffle(warmupPool.filter(e => !warmup.includes(e))).slice(0, 2);

  return { form: f, warmup, main, cooldown };
}

function exCard(ex, level, idx) {
  const d = dosing(ex, level);
  const steps = ex.steps.map((s, i) => `<li>${s}</li>`).join("");
  return `
  <div class="card">
    <div class="card-head">
      <img src="${ex.gif}" alt="${ex.zh}" loading="lazy" onerror="imgRetry(this)">
      <div class="card-title">
        <div class="idx">${idx}</div>
        <h3>${ex.zh}</h3>
        <div class="meta">${TYPE_CN[ex.type]} · ${LEVELS[ex.level]} · 目标:${ex.target}</div>
        <div class="dose">${d.text}</div>
        <div class="rest">${d.rest}</div>
      </div>
    </div>
    <details><summary>动作步骤</summary><ol>${steps}</ol></details>
  </div>`;
}

function renderPlan(p) {
  const f = p.form;
  const levelCn = f.level === "easy" ? "轻松" : f.level === "normal" ? "标准" : "挑战";
  const prefCn = f.pref === "static" ? "静态为主" : f.pref === "dynamic" ? "动态为主" : "动静结合";
  let html = `
    <div class="plan-head">
      <h2>🏋️ 你的锻炼计划</h2>
      <p>目标：${f.goals.join("、")} ｜ 强度：${levelCn} ｜ 时长：约${f.minutes}分钟 ｜ 偏好：${prefCn}</p>
      <p class="tip">💡 防肌肉流失关键：每周练 3 次以上 + 保证蛋白质（每天每公斤体重 1.2g 左右）+ 动作宁慢勿快</p>
      <div class="plan-actions">
        <button onclick="copyShare()">🔗 复制分享（链接+密码）</button>
        <button onclick="regenerate()">🔄 换一套动作</button>
      </div>
    </div>
    <h3 class="section">🔥 热身（每个 30 秒）</h3>
    ${p.warmup.map((e, i) => exCard(e, f.level, "热身" + (i + 1))).join("")}
    <h3 class="section">💪 主训练</h3>
    ${p.main.map((e, i) => exCard(e, f.level, i + 1)).join("")}
    <h3 class="section">🧘 放松拉伸（每个 30 秒）</h3>
    ${p.cooldown.map((e, i) => exCard(e, f.level, "放松" + (i + 1))).join("")}
  `;
  document.getElementById("plan").innerHTML = html;
  document.getElementById("plan").scrollIntoView({ behavior: "smooth" });
}

function regenerate() { renderPlan(generatePlan()); }

function copyShare() {
  const text = `家庭锻炼计划工具：${location.origin}${location.pathname}\n（登录密码找分享人要）`;
  navigator.clipboard.writeText(text).then(
    () => alert("已复制！把链接发给家人朋友，密码另行告诉他们。"),
    () => prompt("复制失败，请手动复制：", text)
  );
}

// ===== AI 定制计划 =====
function aiCard(ex, idx) {
  const steps = (ex.steps || []).map(s => `<li>${s}</li>`).join("");
  return `
  <div class="card">
    <div class="card-head">
      <img src="${ex.gif}" alt="${ex.zh}" loading="lazy" onerror="imgRetry(this)">
      <div class="card-title">
        <div class="idx">${idx}</div>
        <h3>${ex.zh}</h3>
        <div class="meta">目标:${ex.target || ""}</div>
        <div class="dose">${ex.dose || ""}</div>
      </div>
    </div>
    ${steps ? `<details><summary>动作步骤</summary><ol>${steps}</ol></details>` : ""}
  </div>`;
}

// 当前展示的 AI 计划（用于保存）
let currentAiPlan = null;

function renderAiPlan(plan) {
  currentAiPlan = plan;
  let html = `
    <div class="plan-head">
      <h2>🤖 ${esc(plan.title) || "AI 定制锻炼计划"}</h2>
      ${plan.notes ? `<p class="tip">💡 ${esc(plan.notes)}</p>` : ""}
      <div class="plan-actions">
        <button onclick="copyShare()">🔗 复制分享（链接+密码）</button>
      </div>
      <div class="save-row">
        <input id="plan-name" placeholder="给这个计划取个名字，如：爸爸的护膝计划" maxlength="30">
        <button onclick="saveCurrentPlan()">💾 取名保存</button>
      </div>
    </div>
    ${plan.warmup && plan.warmup.length ? `<h3 class="section">🔥 热身</h3>` + plan.warmup.map((e, i) => aiCard(e, "热身" + (i + 1))).join("") : ""}
    <h3 class="section">💪 主训练</h3>
    ${(plan.main || []).map((e, i) => aiCard(e, i + 1)).join("")}
    ${plan.cooldown && plan.cooldown.length ? `<h3 class="section">🧘 放松拉伸</h3>` + plan.cooldown.map((e, i) => aiCard(e, "放松" + (i + 1))).join("") : ""}
  `;
  document.getElementById("plan").innerHTML = html;
  document.getElementById("plan").scrollIntoView({ behavior: "smooth" });
}

async function aiGenerate() {
  const demand = document.getElementById("ai-demand").value.trim();
  const st = document.getElementById("ai-status");
  if (demand.length < 4) { st.textContent = "请多写几个字，说说你的情况。"; return; }
  st.textContent = "⏳ 正在联网搜索最优动作并定制计划，请稍候…";
  document.getElementById("ai-gen").disabled = true;
  try {
    const r = await fetch("/api/ai-plan", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ demand, token: sessionStorage.getItem("workout_auth") }),
    });
    const plan = await r.json();
    if (!r.ok) throw new Error(plan.error || "生成失败");
    renderAiPlan(plan);
    st.textContent = "";
  } catch (e) {
    st.textContent = "❌ " + e.message;
  } finally {
    document.getElementById("ai-gen").disabled = false;
  }
}

// ===== 保存的计划（云端同步，全设备通用）=====
function authToken() { return sessionStorage.getItem("workout_auth"); }

function fmtTime(v) {
  try { return new Date(v).toLocaleString("zh-CN", { hour12: false }); }
  catch (e) { return v || ""; }
}

async function getSavedPlans() {
  try {
    const r = await fetch("/api/plans?token=" + encodeURIComponent(authToken()));
    if (!r.ok) return [];
    const j = await r.json();
    return j.plans || [];
  } catch (e) { return []; }
}

async function saveCurrentPlan() {
  if (!currentAiPlan) { alert("还没有生成计划，先点「AI 生成我的计划」。"); return; }
  const nameEl = document.getElementById("plan-name");
  const name = (nameEl.value || "").trim();
  if (!name) { alert("请先给计划取个名字。"); nameEl.focus(); return; }
  try {
    const r = await fetch("/api/plans", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, plan: currentAiPlan, token: authToken() }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { alert("保存失败：" + (j.error || "请稍后重试")); return; }
    alert(`已保存「${name}」到云端，手机电脑都能看。`);
    renderSavedPlans();
  } catch (e) { alert("保存失败：网络不通，请稍后重试。"); }
}

async function renderSavedPlans() {
  const el = document.getElementById("saved-plans");
  if (!el) return;
  const list = await getSavedPlans();
  if (!list.length) { el.innerHTML = ""; return; }
  el.innerHTML = `
    <div class="panel">
      <h2>📁 我保存的计划（云端同步）</h2>
      ${list.map(p => `
        <div class="saved-item">
          <div class="saved-info">
            <div class="saved-name">${esc(p.name)}</div>
            <div class="saved-time">${esc(fmtTime(p.createdAt))} · ${(p.plan.main || []).length} 个主动作</div>
          </div>
          <div class="saved-btns">
            <button onclick="loadPlan(${p.id})">打开</button>
            <button onclick="deletePlan(${p.id})" class="danger">删除</button>
          </div>
        </div>`).join("")}
    </div>`;
}

async function loadPlan(id) {
  const list = await getSavedPlans();
  const p = list.find(x => x.id === Number(id));
  if (!p || !p.plan) { alert("计划找不到了，可能已被删除。"); renderSavedPlans(); return; }
  renderAiPlan(p.plan);
  const nameEl = document.getElementById("plan-name");
  if (nameEl) nameEl.value = p.name;
}

async function deletePlan(id) {
  const list = await getSavedPlans();
  const p = list.find(x => x.id === Number(id));
  if (!p) return;
  if (!confirm(`确定删除「${p.name}」吗？全家设备上都会删掉。`)) return;
  try {
    const r = await fetch("/api/plans", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, token: authToken() }),
    });
    if (!r.ok) { const j = await r.json().catch(() => ({})); alert("删除失败：" + (j.error || "")); return; }
    renderSavedPlans();
  } catch (e) { alert("删除失败：网络不通。"); }
}

// 一次性迁移：把之前存在本机的计划搬到云端
async function migrateLocalPlans() {
  if (localStorage.getItem("workout_plans_migrated")) return;
  let local = [];
  try { local = JSON.parse(localStorage.getItem("workout_plans_v1") || "[]"); } catch (e) {}
  if (!local.length) { localStorage.setItem("workout_plans_migrated", "1"); return; }
  for (const p of local) {
    try {
      await fetch("/api/plans", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: p.name, plan: p.plan, createdAt: p.createdAt, token: authToken() }),
      });
    } catch (e) {}
  }
  localStorage.setItem("workout_plans_migrated", "1");
  localStorage.removeItem("workout_plans_v1");
}

// ===== 登录门（服务端校验，密码不在前端出现） =====
async function tryLogin() {
  const v = document.getElementById("pwd").value;
  const errEl = document.getElementById("login-err");
  errEl.textContent = "验证中…";
  try {
    const r = await fetch("/api/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: v }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "登录失败");
    sessionStorage.setItem("workout_auth", j.token);
    showApp();
  } catch (e) {
    errEl.textContent = e.message;
  }
}
function showApp() {
  document.getElementById("login").style.display = "none";
  document.getElementById("app").style.display = "block";
  migrateLocalPlans().then(renderSavedPlans);
}
window.addEventListener("DOMContentLoaded", () => {
  if (sessionStorage.getItem("workout_auth")) showApp();
  document.getElementById("pwd").addEventListener("keydown", e => { if (e.key === "Enter") tryLogin(); });
  document.getElementById("gen").addEventListener("click", () => renderPlan(generatePlan()));
  document.getElementById("ai-gen").addEventListener("click", aiGenerate);
});
