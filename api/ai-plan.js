// POST /api/ai-plan  {demand: string, token: string}
// 流程：校验登录 token -> 博查联网搜最优动作推荐 -> DeepSeek 解析需求 -> 本地过滤1324动作 -> DeepSeek 映射选动作+定量 -> 返回计划
// token 由 /api/login 签发：sha256("fw-auth:"+SITE_PASSWORD) 取前32位十六进制；
// 换密码后旧 token 自动失效。密码本身不经过网络、不进仓库。

import { createHash, timingSafeEqual } from "crypto";

const BOCHA_URL = "https://api.bochaai.com/v1/web-search";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

function validToken(token) {
  const pw = process.env.SITE_PASSWORD || "";
  if (!pw) return false;
  const exp = createHash("sha256").update("fw-auth:" + pw).digest("hex").slice(0, 32);
  const a = Buffer.from(String(token || ""));
  const b = Buffer.from(exp);
  return a.length === b.length && timingSafeEqual(a, b);
}

let CATALOG = null;
async function catalog() {
  if (!CATALOG) {
    const r = await fetch("https://cdn.jsdelivr.net/gh/ynkmstarmen/family-workout@main/api/_catalog.json");
    if (!r.ok) throw new Error("动作库加载失败");
    CATALOG = await r.json();
  }
  return CATALOG;
}

async function bochaSearch(query, key) {
  const r = await fetch(BOCHA_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, summary: true, count: 8 }),
  });
  if (!r.ok) throw new Error("搜索接口异常 " + r.status);
  const j = await r.json();
  const pages = (((j || {}).data || {}).webPages || {}).value || [];
  return pages.map(p => `标题：${p.name}\n摘要：${p.summary || ""}\n链接：${p.url}`).join("\n\n").slice(0, 4000);
}

async function deepseek(messages, key, jsonMode = true) {
  const body = { model: "deepseek-chat", messages, temperature: 0.7 };
  if (jsonMode) body.response_format = { type: "json_object" };
  const r = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("AI 接口异常 " + r.status);
  const j = await r.json();
  return j.choices[0].message.content;
}

// 身体部位中文 -> catalog 的 cat 值
const CAT_MAP = {
  "核心": ["waist"], "腹部": ["waist"], "腰腹": ["waist"],
  "胸": ["chest"], "胸部": ["chest"],
  "背": ["back"], "背部": ["back"],
  "腿": ["upper legs", "lower legs"], "下肢": ["upper legs", "lower legs"], "大腿": ["upper legs"], "臀": ["upper legs"], "小腿": ["lower legs"],
  "手臂": ["upper arms", "lower arms"], "上肢": ["upper arms", "lower arms", "shoulders"], "肩": ["shoulders"],
  "全身": ["waist", "chest", "back", "upper legs", "upper arms", "shoulders"],
  "有氧": ["cardio"], "心肺": ["cardio"],
};

async function filterCatalog(profile) {
  let pool = await catalog();
  // 设备过滤：只保留用户明确拥有的器械类型（默认自重）
  const rawDemand = profile.raw || "";
  let allowedEq = ["body weight"];
  if (/健身房/.test(rawDemand)) allowedEq = null; // 健身房=全放开
  else {
    if (/哑铃/.test(rawDemand)) allowedEq.push("dumbbell");
    if (/弹力带|阻力带/.test(rawDemand)) allowedEq.push("band", "resistance band");
    if (/杠铃/.test(rawDemand)) allowedEq.push("barbell", "ez barbell", "olympic barbell", "trap bar");
    if (/壶铃/.test(rawDemand)) allowedEq.push("kettlebell");
  }
  if (allowedEq) pool = pool.filter(e => allowedEq.includes(e.eq));
  // 部位过滤
  let cats = new Set();
  (profile.body_parts || []).forEach(bp => (CAT_MAP[bp] || []).forEach(c => cats.add(c)));
  if (cats.size) pool = pool.filter(e => cats.has(e.cat));
  // 膝盖不好：去掉跳跃、弓步、深蹲大角度变式
  if (/膝盖|膝关节/.test((profile.limitations || []).join(""))) {
    pool = pool.filter(e => !/jump|lunge|pistol|squat/i.test(e.en) || /wall|chair|support|calf/i.test(e.en));
  }
  return pool.slice(0, 150);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "仅支持 POST" });
  if (!validToken((req.body || {}).token))
    return res.status(401).json({ error: "未登录，请刷新页面重新登录" });
  const { demand } = req.body || {};
  if (!demand || demand.trim().length < 4) return res.status(400).json({ error: "请多写几个字，说说你的情况" });
  const BOCHA_KEY = process.env.BOCHA_API_KEY, DS_KEY = process.env.DEEPSEEK_API_KEY;
  if (!BOCHA_KEY || !DS_KEY) return res.status(500).json({ error: "服务端 AI 配置未完成" });

  try {
    // 1) 联网搜最优动作推荐
    const searchText = await bochaSearch(demand.trim() + " 最佳锻炼动作推荐 预防损伤", BOCHA_KEY).catch(() => "");

    // 2) 解析需求结构
    const profileRaw = await deepseek([
      { role: "system", content: "你是健身需求解析器。只输出 JSON。" },
      { role: "user", content: `从用户需求提取结构化信息，只输出 JSON：{"age_group":"中年/老年/青年/未知","limitations":["膝盖不好"],"goals":["预防肌肉减少"],"body_parts":["核心","下肢","上肢","全身"],"prefer_static":true/false/null,"level":1/2/3,"at_home":true}\n用户需求：${demand.trim()}` },
    ], DS_KEY);
    const profile = { ...JSON.parse(profileRaw), raw: demand };
    if (!profile.body_parts || !profile.body_parts.length) profile.body_parts = ["全身"];

    // 3) 本地过滤候选
    const cands = await filterCatalog(profile);
    const candText = cands.map(e => `${e.id} ${e.zh}（${e.target}）`).join("\n");

    // 4) 映射选动作 + 定量
    const planRaw = await deepseek([
      { role: "system", content: "你是家庭健身教练。只从候选动作里选，只输出 JSON。" },
      { role: "user", content:
`用户需求：${demand.trim()}
需求解析：${JSON.stringify(profile)}
联网搜索到的动作推荐（供参考）：
${searchText}

候选动作清单（id 中文名（目标肌群），共${cands.length}个）：
${candText}

请从候选里选 8-12 个最适合的动作编成一次锻炼计划。要求：
- 优先覆盖大肌群（下肢、胸、背），兼顾核心
- 有身体限制的避开相关高风险动作
- 静态动作用"保持X秒"，动态动作用"X次"
只输出 JSON：{"title":"计划标题","notes":"给用户的2-3句注意事项","warmup":[{"id":"动作id","dose":"热身：每个30秒"}],"main":[{"id":"动作id","dose":"每组保持30秒×3组，组休45秒"}],"cooldown":[{"id":"动作id","dose":"放松：每个30秒"}]}
id 必须来自候选清单。` },
    ], DS_KEY);
    const plan = JSON.parse(planRaw);

    // 5) 用目录补全详情
    const byId = Object.fromEntries((await catalog()).map(e => [e.id, e]));
    const enrich = items => (items || []).map(it => {
      const e = byId[it.id]; if (!e) return null;
      return { id: e.id, zh: e.zh, en: e.en, gif: e.gif, target: e.target, dose: it.dose, steps: e.steps };
    }).filter(Boolean);
    plan.warmup = enrich(plan.warmup); plan.main = enrich(plan.main); plan.cooldown = enrich(plan.cooldown);
    return res.status(200).json(plan);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "生成失败，请稍后再试（" + String(err.message || err).slice(0, 60) + "）" });
  }
}
