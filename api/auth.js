import { Redis } from "@upstash/redis";
import { createHash } from "crypto";

const redis = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).end();

    const { key, userId } = req.body;
    if (!key || !userId)
        return res.status(400).json({ success: false, message: "Missing fields." });

    // Fetch licence
    const licence = await redis.get(`key:${key}`);
    if (!licence)
        return res.status(403).json({ success: false, message: "Invalid key." });

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (licence.expireUnix !== -1 && now > licence.expireUnix)
        return res.status(403).json({ success: false, message: "Key has expired." });

    // Get active sessions + clean expired ones
    const sessionsRaw = await redis.hgetall(`sessions:${key}`);
    const expired = [];
    let activeCount = 0;

    if (sessionsRaw) {
        for (const [token, val] of Object.entries(sessionsRaw)) {
            try {
                const s = typeof val === "string" ? JSON.parse(val) : val;
                if (s.expireUnix <= now) {
                    expired.push(token);
                } else {
                    activeCount++;
                }
            } catch {
                expired.push(token);
            }
        }
    }

    // Purge expired
    if (expired.length > 0)
        await redis.hdel(`sessions:${key}`, ...expired);

    // Check max concurrent access
    if (activeCount >= licence.maxAccess)
        return res.status(403).json({
            success: false,
            message: `Max concurrent access reached (${licence.maxAccess}).`,
        });

    // Create new session token
    const token = createHash("sha256")
        .update(key + userId + Date.now().toString())
        .digest("hex");

    await redis.hset(`sessions:${key}`, {
        [token]: JSON.stringify({ userId, expireUnix: now + 30 }),
    });

    return res.status(200).json({
        success:    true,
        token,
        name:       licence.name,
        permanent:  licence.expireUnix === -1,
        expireUnix: licence.expireUnix,
        maxAccess:  licence.maxAccess,
    });
}
