// HTTP Basic Auth in front of the static assets + manual-refresh queue API.
// Basic Auth credentials come from Worker variables (BASIC_USER / BASIC_PASS);
// if they are not configured, access is denied (fail closed).
//
// /api/refresh/* — 수동 갱신 큐 (Basic Auth 대신 자체 키 인증 + CORS)
//   버튼(index.html) → enqueue → 로컬 맥의 rl_refresh_poll.py(1분 cron)가
//   poll/claim → 탭별 갱신 체인 실행 → report. 상태는 Durable Object에 저장.
//   키 = 사이트 보관/Locked 비밀번호(~/.rrg_lock_pass)와 동일. 아래 해시는
//   rrg_publish.py sync_arch_hash()가 비밀번호 변경 시 자동 동기화한다.
const REFRESH_HASH = "5166654f954f54640c25fd1e36456e738c1b3d56d648b4dbe236c6626a458e9c";
const ALLOWED_ORIGINS = ["https://jwk490-cell.github.io"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/refresh/ping") {
      return withCors(request, json({ ok: true, t: Date.now() }));
    }
    if (url.pathname.startsWith("/api/refresh")) {
      return handleRefresh(request, env, url);
    }

    const user = env.BASIC_USER;
    const pass = env.BASIC_PASS;

    const auth = request.headers.get("Authorization") || "";
    if (user && pass && auth.startsWith("Basic ")) {
      let decoded = "";
      try {
        decoded = atob(auth.slice(6));
      } catch (_) {
        decoded = "";
      }
      const sep = decoded.indexOf(":");
      const gotUser = sep >= 0 ? decoded.slice(0, sep) : "";
      const gotPass = sep >= 0 ? decoded.slice(sep + 1) : "";
      if (timingSafeEqual(gotUser, user) && timingSafeEqual(gotPass, pass)) {
        return env.ASSETS.fetch(request);
      }
    }

    return new Response("Authentication required", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Research Lab", charset="UTF-8"',
        "Cache-Control": "no-store",
        // Temporary diagnostic: shows whether env vars are configured (not their values).
        "X-Auth-Config": `user=${user ? "set" : "missing"}; pass=${pass ? "set" : "missing"}`,
      },
    });
  },
};

// ─── 수동 갱신 큐 ───
async function handleRefresh(request, env, url) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  const key = request.headers.get("X-RL-Key") || "";
  const h = await sha256hex("rl-refresh-v1|" + key);
  if (!timingSafeEqual(h, REFRESH_HASH)) {
    return withCors(request, json({ error: "unauthorized" }, 401));
  }
  // POST /api/refresh → enqueue, 그 외 /api/refresh/<action>
  const act = url.pathname.replace(/^\/api\/refresh\/?/, "") || "enqueue";
  const stub = env.REFRESH.get(env.REFRESH.idFromName("queue"));
  const resp = await stub.fetch(new Request("https://do/" + act + url.search, request));
  return withCors(request, resp);
}

export class RefreshQueue {
  constructor(state) {
    this.storage = state.storage;
  }
  async fetch(request) {
    const url = new URL(request.url);
    const act = url.pathname.slice(1);
    const now = Date.now();
    const jobs = (await this.storage.get("jobs")) || {};
    for (const [id, j] of Object.entries(jobs)) {
      if (now - j.requested_at > 3 * 864e5) delete jobs[id]; // 3일 지난 기록 정리
    }
    const save = () => this.storage.put("jobs", jobs);

    if (act === "enqueue" && request.method === "POST") {
      let body = {};
      try { body = await request.json(); } catch (_) {}
      const tab = String(body.tab || "");
      if (!/^[a-z0-9_-]{1,32}$/.test(tab)) return json({ error: "bad tab" }, 400);
      // 같은 탭이 이미 대기/실행 중이면 새로 쌓지 않는다 (running은 2시간 지나면 유령으로 보고 무시)
      const dup = Object.values(jobs).find(
        (j) => j.tab === tab &&
          (j.status === "queued" || (j.status === "running" && now - j.requested_at < 2 * 36e5))
      );
      if (dup) { await save(); return json({ job: dup, dedup: true }); }
      const job = { id: crypto.randomUUID(), tab, status: "queued", requested_at: now };
      jobs[job.id] = job;
      await save();
      return json({ job });
    }
    if (act === "status") {
      const tab = url.searchParams.get("tab") || "";
      const list = Object.values(jobs)
        .filter((j) => j.tab === tab)
        .sort((a, b) => b.requested_at - a.requested_at);
      await save();
      return json({ job: list[0] || null });
    }
    if (act === "poll") {
      const q = Object.values(jobs)
        .filter((j) => j.status === "queued")
        .sort((a, b) => a.requested_at - b.requested_at);
      await save();
      return json({ job: q[0] || null, queued: q.length });
    }
    if (act === "claim" && request.method === "POST") {
      const { id } = await request.json();
      const j = jobs[id];
      if (!j) return json({ error: "no job" }, 404);
      if (j.status !== "queued") return json({ error: "not queued", job: j }, 409);
      j.status = "running";
      j.started_at = now;
      await save();
      return json({ job: j });
    }
    if (act === "report" && request.method === "POST") {
      const { id, status, note } = await request.json();
      const j = jobs[id];
      if (!j) return json({ error: "no job" }, 404);
      j.status = ["done", "failed", "skipped"].includes(status) ? status : "failed";
      j.note = String(note || "").slice(0, 2000);
      j.finished_at = now;
      await save();
      return json({ job: j });
    }
    return json({ error: "unknown action" }, 404);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const self = new URL(request.url).origin;
  const h = {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-RL-Key",
    "Access-Control-Max-Age": "86400",
  };
  if (origin === self || ALLOWED_ORIGINS.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
  }
  return h;
}

function withCors(request, resp) {
  const r = new Response(resp.body, resp);
  for (const [k, v] of Object.entries(corsHeaders(request))) r.headers.set(k, v);
  r.headers.set("Cache-Control", "no-store");
  return r;
}

async function sha256hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}
