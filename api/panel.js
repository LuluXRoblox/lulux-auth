const ADMIN_SECRET = process.env.ADMIN_SECRET;

export default function handler(req, res) {
    const { key } = req.query;
    if (!key || key !== ADMIN_SECRET) return res.status(404).end();

    const BASE_URL = `https://${req.headers.host}`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(buildHTML(key, BASE_URL));
}

function buildHTML(key, BASE_URL) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>LuluX Admin</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Syne:wght@500;700&display=swap" rel="stylesheet"/>
<style>
  *{box-sizing:border-box}
  body{font-family:'Syne',sans-serif;background:#080808;color:#fff;margin:0}
  .mono{font-family:'JetBrains Mono',monospace}
  .fade-in{animation:fi .2s ease}
  @keyframes fi{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
  select option{background:#111;color:#fff}
  input:focus,select:focus{outline:none;border-color:rgba(255,255,255,.3)!important}
  ::-webkit-scrollbar{width:4px}
  ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:9px}
</style>
</head>
<body>
<div id="root"></div>
<script>
const SECRET   = ${JSON.stringify(key)};
const BASE_URL = ${JSON.stringify(BASE_URL)};

// ── STATE ──────────────────────────────────────────────────────────
let keys       = [];
let modal      = null;   // null | "add" | "extend" | "remove"
let selected   = null;
let loading    = false;
let toast      = null;
let toastTimer = null;

// ── API ────────────────────────────────────────────────────────────
async function api(body) {
    const r = await fetch(BASE_URL + "/api/admin", {
        method: "POST",
        headers: {
            "Content-Type":  "application/json",
            "Authorization": "Bearer " + SECRET,
        },
        body: JSON.stringify(body),
    });
    return r.json();
}

// ── HELPERS ────────────────────────────────────────────────────────
function timeLeft(expireUnix) {
    if (expireUnix === -1) return "∞";
    const diff = expireUnix - Math.floor(Date.now() / 1000);
    if (diff <= 0) return "Expired";
    const d = Math.floor(diff / 86400);
    const h = Math.floor((diff % 86400) / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const parts = [];
    if (d > 0) parts.push(d + "d");
    if (h > 0) parts.push(h + "h");
    if (m > 0) parts.push(m + "m");
    return parts.join(" ");
}

function showToast(msg, type = "ok") {
    clearTimeout(toastTimer);
    toast = { msg, type };
    render();
    toastTimer = setTimeout(() => { toast = null; render(); }, 3200);
}

// ── ACTIONS ────────────────────────────────────────────────────────
async function loadKeys() {
    loading = true; render();
    try {
        const d = await api({ action: "list" });
        if (d.success) keys = d.keys || [];
        else showToast(d.message || "Failed to load.", "err");
    } catch(e) {
        showToast("Network error.", "err");
    }
    loading = false; render();
}

async function addKey() {
    const keyId      = g("f-key").value.trim();
    const name       = g("f-name").value.trim();
    const durType    = g("f-dur").value;
    const days       = parseInt(g("f-days")?.value || "30");
    const maxAccess  = parseInt(g("f-access").value || "1");

    if (!keyId) { showToast("Key wajib diisi.", "err"); return; }

    const d = await api({ action: "add", keyId, name, durationType: durType, days, maxAccess });
    if (d.success) { showToast("Key berhasil ditambah."); modal = null; loadKeys(); }
    else showToast(d.message || "Gagal.", "err");
}

async function extendKey() {
    const days = parseInt(g("ext-days").value || "30");
    const d = await api({ action: "extend", keyId: selected.keyId, days });
    if (d.success) { showToast("Key diperpanjang."); modal = null; loadKeys(); }
    else showToast(d.message || "Gagal.", "err");
}

async function removeKey() {
    const d = await api({ action: "remove", keyId: selected.keyId });
    if (d.success) { showToast("Key dihapus."); modal = null; loadKeys(); }
    else showToast(d.message || "Gagal.", "err");
}

function g(id) { return document.getElementById(id); }

function onDurChange() {
    const wrap = g("days-wrap");
    if (wrap) wrap.style.display = g("f-dur").value === "custom" ? "flex" : "none";
}

// ── STYLES ─────────────────────────────────────────────────────────
const S = {
    inp: \`width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:8px 12px;font-size:13px;color:#fff;font-family:inherit\`,
    btn(v="def") {
        const m = {
            def:     "background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.1)",
            primary: "background:#fff;color:#000;border:none",
            green:   "background:rgba(52,211,153,.12);color:#34d399;border:1px solid rgba(52,211,153,.25)",
            danger:  "background:rgba(248,113,113,.12);color:#f87171;border:1px solid rgba(248,113,113,.25)",
            purple:  "background:rgba(167,139,250,.12);color:#a78bfa;border:1px solid rgba(167,139,250,.25)",
        };
        return \`style="\${m[v]};padding:8px 16px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit"\`;
    },
};

function field(label, inp) {
    return \`<div style="display:flex;flex-direction:column;gap:5px">
      <label style="font-size:10px;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:.1em">\${label}</label>
      \${inp}
    </div>\`;
}

// Duration badge
function durBadge(u) {
    const exp     = u.expireUnix;
    const expired = exp !== -1 && exp < Date.now() / 1000;
    if (expired)              return badge("Expired",   "#f87171","rgba(248,113,113,.15)","rgba(248,113,113,.25)");
    if (u.durationType === "permanent") return badge("Permanent","#34d399","rgba(52,211,153,.12)","rgba(52,211,153,.25)");
    if (u.durationType === "timeless")  return badge("Timeless", "#a78bfa","rgba(167,139,250,.12)","rgba(167,139,250,.25)");
    return badge("Custom","#fbbf24","rgba(245,158,11,.12)","rgba(245,158,11,.25)");
}

function badge(text, color, bg, border) {
    return \`<span class="mono" style="font-size:11px;padding:2px 9px;border-radius:6px;background:\${bg};color:\${color};border:1px solid \${border}">\${text}</span>\`;
}

// ── MODAL ──────────────────────────────────────────────────────────
function renderModal() {
    if (!modal) return "";

    let body = "";
    let title = "";

    if (modal === "add") {
        title = "Add Key";
        body = \`
        <div style="display:flex;flex-direction:column;gap:14px">
          \${field("Nama", \`<input id="f-name" placeholder="Leon" style="\${S.inp}">\`)}
          \${field("Key", \`<input id="f-key" placeholder="LULU-XXXX-XXXX" style="\${S.inp}" class="mono">\`)}
          \${field("Duration", \`<select id="f-dur" onchange="onDurChange()" style="\${S.inp}">
            <option value="permanent">Permanent</option>
            <option value="timeless">Timeless</option>
            <option value="custom">Custom</option>
          </select>\`)}
          <div id="days-wrap" style="display:none;flex-direction:column;gap:5px">
            \${field("Days (1–9999)", \`<input id="f-days" type="number" min="1" max="9999" value="30" style="\${S.inp}">\`)}
          </div>
          \${field("Access (1–999)", \`<input id="f-access" type="number" min="1" max="999" value="1" style="\${S.inp}">\`)}
          <div style="display:flex;gap:8px;margin-top:4px">
            <button onclick="addKey()" \${S.btn("primary")}>Add Key</button>
            <button onclick="modal=null;render()" \${S.btn()}>Cancel</button>
          </div>
        </div>\`;
    }

    if (modal === "extend") {
        title = "Extend — " + selected.keyId;
        body = \`
        <div style="display:flex;flex-direction:column;gap:14px">
          <p style="margin:0;font-size:13px;color:rgba(255,255,255,.4)">
            Time left: <span style="color:rgba(255,255,255,.75)">\${timeLeft(selected.expireUnix)}</span>
          </p>
          \${field("Add Days (1–9999)", \`<input id="ext-days" type="number" min="1" max="9999" value="30" style="\${S.inp}">\`)}
          <div style="display:flex;gap:8px;margin-top:4px">
            <button onclick="extendKey()" \${S.btn("green")}>Extend</button>
            <button onclick="modal=null;render()" \${S.btn()}>Cancel</button>
          </div>
        </div>\`;
    }

    if (modal === "remove") {
        title = "Remove Key";
        body = \`
        <div style="display:flex;flex-direction:column;gap:14px">
          <p style="margin:0;font-size:13px;color:rgba(255,255,255,.45)">
            Hapus key <span class="mono" style="color:#fff">\${selected.keyId}</span>?
            <br/>Semua sesi aktif langsung putus.
          </p>
          <div style="display:flex;gap:8px;margin-top:4px">
            <button onclick="removeKey()" \${S.btn("danger")}>Remove</button>
            <button onclick="modal=null;render()" \${S.btn()}>Cancel</button>
          </div>
        </div>\`;
    }

    return \`
    <div onclick="if(event.target===this){modal=null;render()}"
         style="position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.8);backdrop-filter:blur(8px)">
      <div class="fade-in" style="background:#111;border:1px solid rgba(255,255,255,.1);border-radius:16px;width:100%;max-width:420px;margin:16px;box-shadow:0 30px 60px rgba(0,0,0,.7)">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid rgba(255,255,255,.07)">
          <span style="font-weight:700;letter-spacing:.01em">\${title}</span>
          <button onclick="modal=null;render()" style="background:none;border:none;color:rgba(255,255,255,.3);font-size:22px;cursor:pointer;line-height:1;padding:0">&times;</button>
        </div>
        <div style="padding:20px 24px">\${body}</div>
      </div>
    </div>\`;
}

// ── MAIN RENDER ────────────────────────────────────────────────────
function render() {
    const now = Math.floor(Date.now() / 1000);

    const rows = keys.length === 0
        ? \`<tr><td colspan="6" style="text-align:center;padding:56px;color:rgba(255,255,255,.15);font-size:13px">
             \${loading ? "Loading..." : "Belum ada key."}
           </td></tr>\`
        : keys.map((u, i) => {
            const expired = u.expireUnix !== -1 && u.expireUnix < now;
            const tleft   = (u.expireUnix === -1) ? "∞" : expired ? "Expired" : timeLeft(u.expireUnix);
            const acc     = \`\${u.activeCount ?? 0} / \${u.maxAccess ?? 1}\`;
            const accColor = (u.activeCount >= u.maxAccess) ? "#f87171" : "rgba(255,255,255,.55)";
            return \`<tr style="border-bottom:1px solid rgba(255,255,255,.04);background:\${i%2===0?"transparent":"rgba(255,255,255,.01)"}">
              <td style="padding:11px 16px;color:rgba(255,255,255,.65);font-size:13px">\${u.name || "—"}</td>
              <td style="padding:11px 16px" class="mono" style="font-size:12px">\${u.keyId}</td>
              <td style="padding:11px 16px">\${durBadge(u)}</td>
              <td style="padding:11px 16px;font-size:12px;color:rgba(255,255,255,.4)" class="mono">\${tleft}</td>
              <td style="padding:11px 16px;font-size:12px;color:\${accColor}" class="mono">\${acc}</td>
              <td style="padding:11px 16px;text-align:right">
                <div style="display:flex;gap:6px;justify-content:flex-end">
                  <button onclick='selected=\${JSON.stringify(u)};modal="extend";render()' \${S.btn("green")}>+ Extend</button>
                  <button onclick='selected=\${JSON.stringify(u)};modal="remove";render()' \${S.btn("danger")}>Remove</button>
                </div>
              </td>
            </tr>\`;
          }).join("");

    const toastEl = toast ? \`
    <div class="fade-in" style="position:fixed;top:16px;right:16px;z-index:100;padding:10px 18px;border-radius:10px;font-size:13px;
      \${toast.type==="err"
        ? "background:#1a0505;border:1px solid rgba(248,113,113,.3);color:#f87171"
        : "background:#05160d;border:1px solid rgba(52,211,153,.3);color:#34d399"}">
      \${toast.msg}
    </div>\` : "";

    document.getElementById("root").innerHTML = \`
    \${toastEl}
    <div style="min-height:100vh">

      <!-- Header -->
      <div style="border-bottom:1px solid rgba(255,255,255,.07);padding:14px 24px;display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:baseline;gap:10px">
          <span style="font-size:18px;font-weight:700;letter-spacing:-.01em">LuluX</span>
          <span style="color:rgba(255,255,255,.2);font-size:13px">Admin Panel</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="color:rgba(255,255,255,.2);font-size:13px">\${keys.length} key\${keys.length!==1?"s":""}</span>
          <button onclick="loadKeys()" \${S.btn()}>\${loading ? "Loading…" : "Refresh"}</button>
          <button onclick='modal="add";render()' \${S.btn("primary")}>+ Add Key</button>
        </div>
      </div>

      <!-- Table -->
      <div style="padding:24px">
        <div style="background:#0e0e0e;border:1px solid rgba(255,255,255,.07);border-radius:14px;overflow:hidden;overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:13px;min-width:680px">
            <thead>
              <tr style="border-bottom:1px solid rgba(255,255,255,.07)">
                \${["Nama","Key","Duration","Time Left","Access","Actions"].map(h =>
                  \`<th style="text-align:\${h==="Actions"?"right":"left"};padding:10px 16px;color:rgba(255,255,255,.2);font-size:10px;font-weight:500;letter-spacing:.1em;text-transform:uppercase">\${h}</th>\`
                ).join("")}
              </tr>
            </thead>
            <tbody>\${rows}</tbody>
          </table>
        </div>
      </div>
    </div>
    \${renderModal()}\`;

    // Re-bind
    document.getElementById("f-dur")?.addEventListener("change", onDurChange);
    onDurChange();
}

loadKeys();
</script>
</body>
</html>`;
}
