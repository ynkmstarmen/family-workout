// POST /api/login  {password}
// 服务端校验密码（密码只在 Vercel 环境变量 SITE_PASSWORD 里，代码和仓库里都没有明文）
import { createHash, timingSafeEqual } from "crypto";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "仅支持 POST" });
  const expected = process.env.SITE_PASSWORD || "";
  if (!expected) return res.status(500).json({ error: "服务端未配置密码" });
  const { password } = req.body || {};
  const a = createHash("sha256").update(String(password || "")).digest();
  const b = createHash("sha256").update(expected).digest();
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (!ok) return res.status(401).json({ error: "密码不对，再试试。" });
  const token = createHash("sha256").update("fw-auth:" + expected).digest("hex").slice(0, 32);
  return res.status(200).json({ ok: true, token });
}
