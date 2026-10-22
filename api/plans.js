import { kv } from "@vercel/kv";
import crypto from "crypto";

const PLANS_KEY = "workout:plans";
const MAX_PLANS = 50;

function validToken(token) {
  if (!token || !process.env.SITE_PASSWORD) return false;
  const expect = crypto.createHash("sha256").update("fw-auth:" + process.env.SITE_PASSWORD).digest("hex").slice(0, 32);
  return token === expect;
}

export default async function handler(req, res) {
  const token = req.method === "GET"
    ? req.query.token
    : (req.body && req.body.token) || req.query.token;
  if (!validToken(token)) {
    return res.status(401).json({ error: "未登录" });
  }

  try {
    if (req.method === "GET") {
      const plans = (await kv.get(PLANS_KEY)) || [];
      return res.status(200).json({ plans });
    }

    if (req.method === "POST") {
      const { name, plan, createdAt } = req.body || {};
      if (!name || !plan) return res.status(400).json({ error: "缺少计划名称或内容" });
      let plans = (await kv.get(PLANS_KEY)) || [];
      plans.unshift({
        id: Date.now(),
        name: String(name).slice(0, 30),
        createdAt: createdAt || new Date().toISOString(),
        plan,
      });
      plans = plans.slice(0, MAX_PLANS);
      await kv.set(PLANS_KEY, plans);
      return res.status(200).json({ ok: true, count: plans.length });
    }

    if (req.method === "DELETE") {
      const id = (req.body && req.body.id) || req.query.id;
      let plans = (await kv.get(PLANS_KEY)) || [];
      plans = plans.filter(p => p.id !== Number(id));
      await kv.set(PLANS_KEY, plans);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "方法不支持" });
  } catch (e) {
    console.error("plans api error:", e.message);
    return res.status(503).json({ error: "云端存储尚未开通，请先在 Vercel 后台连接 KV 数据库。" });
  }
}
