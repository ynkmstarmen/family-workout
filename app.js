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
      <img src="${ex.gif}" alt="${ex.zh}" loading="lazy">
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
        <button onclick="window.print()">🖨️ 打印计划</button>
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
  const text = `家庭锻炼计划工具：${location.origin}${location.pathname}\n登录密码：${SITE_PASSWORD}`;
  navigator.clipboard.writeText(text).then(
    () => alert("已复制！把链接和密码发给家人朋友即可。"),
    () => prompt("复制失败，请手动复制：", text)
  );
}

// ===== 登录门 =====
function tryLogin() {
  const v = document.getElementById("pwd").value;
  if (v === SITE_PASSWORD) {
    sessionStorage.setItem("workout_auth", "1");
    showApp();
  } else {
    document.getElementById("login-err").textContent = "密码不对，再试试。";
  }
}
function showApp() {
  document.getElementById("login").style.display = "none";
  document.getElementById("app").style.display = "block";
}
window.addEventListener("DOMContentLoaded", () => {
  if (sessionStorage.getItem("workout_auth") === "1") showApp();
  document.getElementById("pwd").addEventListener("keydown", e => { if (e.key === "Enter") tryLogin(); });
  document.getElementById("gen").addEventListener("click", () => renderPlan(generatePlan()));
});
