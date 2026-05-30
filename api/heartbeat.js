import { Redis } from "@upstash/redis";

const redis = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).end();

    const auth = req.headers.authorization;
    const { key } = req.body;
    if (!auth || !key) return res.status(400).end();

    const token = auth.replace("Bearer ", "");
    const now   = Math.floor(Date.now() / 1000);

    const raw = await redis.hget(`sessions:${key}`, token);
    if (!raw) return res.status(200).json({ success: false, revoked: true });

    const session = typeof raw === "string" ? JSON.parse(raw) : raw;

    // Refresh TTL
    await redis.hset(`sessions:${key}`, {
        [token]: JSON.stringify({ ...session, expireUnix: now + 30 }),
    });

    return res.status(200).json({ success: true });
}
