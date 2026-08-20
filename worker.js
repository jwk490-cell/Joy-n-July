// HTTP Basic Auth in front of the static assets.
// Credentials come from Worker variables (BASIC_USER / BASIC_PASS);
// if they are not configured, access is denied (fail closed).
export default {
  async fetch(request, env) {
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

function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}
