import { Redis } from "@upstash/redis";

const redis = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
});

const ADMIN_SECRET = process.env.ADMIN_SECRET;

export default async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).end();

    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${ADMIN_SECRET}`)
        return res.status(401).json({ success: false, message: "Unauthorized." });

    const { action, keyId, name, durationType, days, maxAccess } = req.body;

    // ── ADD / UPDATE ───────────────────────────────────────────────
    if (action === "add") {
        if (!keyId)
            return res.status(400).json({ success: false, message: "Missing key." });

        const dType  = durationType || "permanent";
        const d      = Math.min(9999, Math.max(1, parseInt(days) || 30));
        const access = Math.min(999,  Math.max(1, parseInt(maxAccess) || 1));

        let expireUnix = -1;
        if (dType === "custom")
            expireUnix = Math.floor(Date.now() / 1000) + d * 86400;

        await redis.set(`key:${keyId}`, {
            name:        name || keyId,
            durationType: dType,
            expireUnix,
            days:        dType === "custom" ? d : 0,
            maxAccess:   access,
        });
        await redis.sadd("keys", keyId);

        return res.status(200).json({ success: true, message: "Key added." });
    }

    // ── REMOVE ─────────────────────────────────────────────────────
    if (action === "remove") {
        if (!keyId)
            return res.status(400).json({ success: false, message: "Missing key." });

        await redis.del(`key:${keyId}`);
        await redis.del(`sessions:${keyId}`);
        await redis.srem("keys", keyId);

        return res.status(200).json({ success: true, message: "Key removed." });
    }

    // ── LIST ───────────────────────────────────────────────────────
    if (action === "list") {
        const keyIds = await redis.smembers("keys");
        if (!keyIds || keyIds.length === 0)
            return res.status(200).json({ success: true, keys: [] });

        const now  = Math.floor(Date.now() / 1000);
        const keys = [];

        for (const k of keyIds) {
            const data = await redis.get(`key:${k}`);
            if (!data) continue;

            // Count active sessions
            const sessionsRaw = await redis.hgetall(`sessions:${k}`);
            let activeCount = 0;
            if (sessionsRaw) {
                for (const [, val] of Object.entries(sessionsRaw)) {
                    try {
                        const s = typeof val === "string" ? JSON.parse(val) : val;
                        if (s.expireUnix > now) activeCount++;
                    } catch { /* skip malformed */ }
                }
            }

            keys.push({ keyId: k, ...data, activeCount });
        }

        return res.status(200).json({ success: true, keys });
    }

    // ── EXTEND ─────────────────────────────────────────────────────
    if (action === "extend") {
        if (!keyId)
            return res.status(400).json({ success: false, message: "Missing key." });

        const data = await redis.get(`key:${keyId}`);
        if (!data)
            return res.status(404).json({ success: false, message: "Key not found." });

        const d       = Math.min(9999, Math.max(1, parseInt(days) || 30));
        const base    = data.expireUnix === -1 ? Math.floor(Date.now() / 1000) : data.expireUnix;
        const newExp  = base + d * 86400;

        await redis.set(`key:${keyId}`, {
            ...data,
            durationType: "custom",
            expireUnix:   newExp,
            days:         d,
        });

        return res.status(200).json({ success: true, message: "Key extended." });
    }

    return res.status(400).json({ success: false, message: "Unknown action." });
}
