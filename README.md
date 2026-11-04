# 🔐 Authentication

## 📚 Documentation map

| # | File | What you learn |
|---|---|---|
| 0 | **README.md** (this file) | The whole story: problem → password → session/token → JWT → refresh → RBAC → OAuth |
| 1 | [`docs/01-types-of-authentication.md`](./docs/01-types-of-authentication.md) | Session (direct DB), opaque tokens, JWT, access + refresh, API keys, OAuth/OIDC, SSO, passkeys. When to use which |
| 2 | [`docs/02-code-flows.md`](./docs/02-code-flows.md) | Real Express + MongoDB + React code, with the **flow** of who calls whom |
| 3 | [`docs/03-system-design-auth.md`](./docs/03-system-design-auth.md) | Auth at system level: scaling, Redis, multi-device, token theft response, an Instagram-style design |
| 4 | [`docs/04-web-attacks.md`](./docs/04-web-attacks.md) | Clickjacking, XS-Leaks, CSRF, XSS, IDOR, Prototype Pollution, MITM, Phishing, SSRF, Subdomain Takeover, Supply Chain — how / when / why / fix |
| 5 | [`docs/05-defenses-and-threat-modeling.md`](./docs/05-defenses-and-threat-modeling.md) | CSP, CORS, SOP, TLS, SRI, cookies, input validation, threat modeling (STRIDE) |
| 6 | [`docs/06-interview-playbook.md`](./docs/06-interview-playbook.md) | 40+ interview questions with answers, RBAC questions, "token stolen" question, system-design question |

---

## 1. Start with the problem

Imagine this request arrives at your server:

```http
POST /api/orders
Content-Type: application/json

{"productId":"123","quantity":2,"userId":"someone-else"}
```

The server receives **bytes over a network, not humans**. It cannot assume "this is Ritesh".

And `userId` in the body proves nothing — the client controls the body. An attacker can write any value.

> **HTTP is stateless.** Every request arrives like a stranger. The server needs a *credential* it can verify on every request.

Everything in authentication is an answer to this one problem.

---

## 2. Three words you must never mix up

```text
REQUEST
   │
   ▼
┌────────────┐
│ Validation │  Is the input well-formed?          → 400 Bad Request
└─────┬──────┘
      ▼
┌────────────────┐
│ Authentication │  WHO are you?                    → 401 Unauthorized
└───────┬────────┘
        ▼
┌────────────────┐
│ Authorization  │  WHAT may you do?                → 403 Forbidden
└───────┬────────┘
        ▼
   Controller → DB
```

| Concept | Question | Failure code |
|---|---|---|
| Validation | Is the data usable? | `400` |
| Authentication (AuthN) | Who is this? | `401` |
| Authorization (AuthZ) | Can this identity do this action on this resource? | `403` |

**Interview trap:** `401` is *named* "Unauthorized" but means "unauthenticated" — I do not know who you are. `403` means "I know who you are, but no."

Another trap: sometimes you return `404` instead of `403` on purpose, so an attacker cannot even learn that a resource exists.

📖 **Official docs:** [MDN – Session management](https://developer.mozilla.org/en-US/docs/Web/Security/Authentication/Session_management) · [OWASP – Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) · [OWASP – Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)

---

## 3. The mental model: college ID card

```text
REGISTER  (admission)
   ↓
Server verifies your data, creates your record
   ↓
LOGIN  (show original documents once)
   ↓
Server gives you an ID CARD (session ID / token)
   ↓
EVERY LATER REQUEST  (show the ID card at each gate)
   ↓
Server checks the card → knows who you are
   ↓
AUTHORIZATION  (this gate is only for staff)
```

Why not send the password on every request?

- Password checking is **intentionally slow** (hashing) — you do it once.
- Sending the password again and again gives attackers many chances to steal it.
- An ID card can **expire**, be **revoked**, and have **limited power**. A password cannot.

> The ID card is called a **bearer credential**: whoever holds it is treated as the user. So the real security question becomes:
> **"Where does the card live, and who can touch it?"**

---

## 4. Step 1 — Passwords done right

### Never store passwords. Store a *hash*.

```text
"MyPass123"  ──hash──▶  "$2b$12$Gk9...long...string"
```

- **Hash** = one-way. You cannot turn it back into the password.
- **Encryption** = two-way (with a key). Wrong tool for passwords.

### Why not SHA-256 or MD5?

They are **fast**. Fast is bad here — an attacker with a stolen DB can try billions of guesses per second. Password hashing algorithms (bcrypt, scrypt, **Argon2id**) are *deliberately slow and memory-hungry*.

### Salt

```text
"hello123" + saltA → hashA
"hello123" + saltB → hashB      (same password, different hashes)
```

A salt is random per user. It kills rainbow tables and hides "two users share a password". A salt is **not secret**; bcrypt stores it inside the hash string.

### Cost factor

bcrypt has a "cost" (e.g. 12). Each +1 doubles the work. Pick a value so one hash takes roughly 100–300 ms on your server. Re-tune as hardware improves.

### Recommended today

- New systems: **Argon2id** (OWASP's first recommendation).
- bcrypt is still acceptable and extremely common in MERN. Know its quirk: it only uses the first **72 bytes** of the password.

### Login must be generic

```text
❌ "Email not found"          → attacker learns which emails exist
❌ "Wrong password"           → same leak
✅ "Invalid email or password"
```

This is called preventing **account enumeration**. Also keep response *time* similar (compare against a dummy hash when the user doesn't exist).

📖 **Official docs:** [MDN – Passwords](https://developer.mozilla.org/en-US/docs/Web/Security/Authentication/Passwords) · [OWASP – Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

---

## 5. Step 2 — After login, what do we give the browser?

There are two families. Full comparison in [`01-types-of-authentication.md`](./docs/01-types-of-authentication.md).

### A) Session (server remembers)

```text
Cookie: sid=9f3a...      ← random, meaningless string
          │
          ▼
   Session store (Redis/DB):  9f3a... → { userId: 42, role: "admin" }
```

The cookie is just a **pointer**. The truth lives on the server. Revocation is trivial: delete the row.

### B) Token (client carries the proof)

```text
Authorization: Bearer eyJhbGciOi...      ← JWT: carries claims + signature
```

The server verifies the signature locally — **no DB lookup**. Great for APIs and many servers. Revocation is hard, because the server stores nothing.

### One-line difference

> **Session = "look it up." JWT = "verify it."**

Neither is "modern vs old". They are trade-offs.

---

## 6. Step 3 — JWT in one minute

```text
HEADER . PAYLOAD . SIGNATURE
```

```json
// payload (claims)
{ "sub": "user_123", "role": "buyer", "iat": 1760000000, "exp": 1760000600 }
```

- **Readable** by anyone — it is only Base64URL *encoded*, **not encrypted**. Never put secrets in it.
- **Tamper-evident** — change one character and the signature no longer matches.
- **Self-expiring** — `exp` claim.

### The tamper story

```text
Attacker decodes payload → changes "role":"buyer" to "admin"
        ↓
Server recomputes signature over the new payload
        ↓
New signature ≠ the one in the token
        ↓
jwt.verify() throws → 401
```

Attacker cannot re-sign without the server's secret/private key.

### Three JWT rules that interviewers love

1. Use **`jwt.verify()`**, never `jwt.decode()`, to authenticate. `decode` reads without trusting.
2. **Pin the algorithm** when verifying (`algorithms: ["HS256"]`). Otherwise you risk the `alg: none` attack and HS/RS *algorithm-confusion* attacks.
3. Always set and check **`exp`**, plus `iss` (issuer) and `aud` (audience).

📖 **Official docs:** [RFC 7519 – JWT](https://datatracker.ietf.org/doc/html/rfc7519) · [RFC 8725 – JWT Best Current Practices](https://datatracker.ietf.org/doc/html/rfc8725)

---

## 7. Step 4 — The storage dilemma (why two tokens exist)

A long-lived credential needs a home. Both homes are dangerous:

| Home | Who can read it? | Main attack |
|---|---|---|
| `localStorage` | Any JS on your page | **XSS** steals it |
| Normal cookie | Sent automatically | **CSRF** abuses it |
| `HttpOnly` cookie | Not readable by JS, but sent automatically | **CSRF** must be handled |
| JS memory variable | Only your running JS | Lost on refresh; XSS on live page can still use it |

The industry answer is to **split the credential by lifetime**:

```text
ACCESS TOKEN   short-lived (5–15 min)   kept in MEMORY        → sent as Authorization header
REFRESH TOKEN  long-lived (days)        HttpOnly+Secure cookie → only sent to /auth/refresh
```

Why this helps:

- A stolen access token dies in minutes.
- The refresh token is invisible to JavaScript and only travels to *one* endpoint.
- The server can **rotate** and **revoke** the refresh token.

This reduces risk. It does not eliminate it — read the XSS section in the attacks file to see why.

### Refresh-token rotation

```text
Login           → RT-1 issued
Refresh (RT-1)  → RT-1 marked used, RT-2 issued
Refresh (RT-2)  → RT-2 marked used, RT-3 issued
Someone replays RT-1/RT-2 → REUSE DETECTED → revoke the whole family → force login
```

Rotation is **detection**, not prevention. A legitimate user and an attacker can race; the server fails closed.

### Refresh race condition (classic bug)

Dashboard fires 8 requests → 8× `401` → 8 refresh calls → first rotates RT-1 → other 7 replay RT-1 → **false reuse alarm**.
Fix: client keeps **one in-flight refresh promise** (single-flight). Code is in [`02-code-flows.md`](./docs/02-code-flows.md).

📖 **Official docs:** [MDN – Secure cookie configuration](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Cookies) · [RFC 9700 – OAuth 2.0 Security BCP](https://datatracker.ietf.org/doc/html/rfc9700)

---

## 8. Cookie flags you must know

```js
res.cookie("refreshToken", token, {
  httpOnly: true,                              // JS cannot read it
  secure: true,                                // HTTPS only
  sameSite: "strict",                          // not sent on cross-site requests
  path: "/api/auth",                           // only sent to auth endpoints
  maxAge: 7 * 24 * 60 * 60 * 1000              // 7 days
});
```

| Flag | Protects against |
|---|---|
| `HttpOnly` | Reading cookie via `document.cookie` (XSS token theft) |
| `Secure` | Sending cookie over plain HTTP (MITM sniffing) |
| `SameSite=Strict/Lax` | CSRF (cookie not attached on cross-site requests) |
| `Path` | Reduces *where* cookie is sent. **Not** a security boundary |
| `Domain` | Careful: `Domain=.example.com` shares cookie with **all subdomains** (subdomain-takeover risk) |
| `__Host-` prefix | Forces Secure + Path=/ + no Domain → cookie cannot be overwritten by a subdomain |

`HttpOnly` does **not** stop XSS. It stops *reading* the cookie. A malicious script can still *make requests* that carry it.

---

## 9. Step 5 — Authorization and RBAC

Authentication gives you `req.user = { id, role }`. Authorization decides what that identity may do.

```text
request
  ↓
isLoggedIn          → 401 if no valid identity
  ↓  (req.user set)
allow("admin")      → 403 if role not permitted
  ↓
controller
```

```js
router.delete("/products/:id", isLoggedIn, allow("admin"), deleteProduct);
```

### Golden rules

1. **Frontend route guards are UX, not security.** Anyone can call `DELETE /api/products/1` from Postman. The backend must enforce every rule.
2. **RBAC is not enough.** Two users with role `user` must not read each other's orders. You also need an **ownership check** (see IDOR in the attacks file).
3. Enforce authorization **inside the database query** wherever possible:
   `Order.findOne({ _id: id, userId: req.user.id })` — not "fetch then maybe hide".
4. **Deny by default.** Every new route starts protected; making it public is a conscious decision.

### Role inside JWT or in DB?

| | Role in JWT | Role from DB each request |
|---|---|---|
| Speed | Fast, no lookup | Extra DB/Redis hit |
| Freshness | Stale until token expires | Always current |
| Use when | Low-risk checks, short TTL | High-risk checks, instant demotion needed |

Practical answer: short access TTL + re-check sensitive permissions server-side.

📖 **Official docs:** [OWASP – Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) · [MDN – IDOR](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/IDOR)

---

## 10. Step 6 — "Sign in with Google" (OAuth 2.0 + OIDC)

Two layers — do not mix them up:

- **OAuth 2.0** → *authorization*: "May this app access this user's data?"
- **OpenID Connect (OIDC)** → *authentication*: "Who is this user?" (adds an **ID token**)

Login with Google is really **OIDC on top of OAuth 2.0**.

```text
Browser ─▶ Your backend  GET /auth/google
Backend ─▶ Browser       302 → accounts.google.com (client_id, scope, redirect_uri, state)
Browser ─▶ Google        user logs in + consents
Google  ─▶ Browser       302 → your /auth/google/callback?code=XYZ&state=...
Browser ─▶ Your backend  callback
Backend ─▶ Google        server-to-server: exchange code (+ client_secret) for tokens
Google  ─▶ Backend       ID token + access token
Backend                  find-or-create local user → issue YOUR OWN session/tokens
```

Key ideas:

- The browser only ever sees a short-lived **authorization code**, not the tokens.
- `client_secret` lives **only on the server**. Never ship it in React.
- The **`state`** parameter defends the login flow against CSRF.
- **PKCE** protects the code exchange for public clients (SPAs, mobile). Use it.
- Request the **minimum scopes** (`openid email profile`).
- After Google confirms identity, *you* create your own session. Google's tokens are not your app's session.

📖 **Official docs:** [MDN – Federated identity](https://developer.mozilla.org/en-US/docs/Web/Security/Authentication/Federated_identity) · [RFC 6749 – OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc6749) · [RFC 7636 – PKCE](https://datatracker.ietf.org/doc/html/rfc7636) · [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html)

---

## 11. Step 7 — Logout and revocation

| Action | What really happens |
|---|---|
| Logout this device | Revoke this session/refresh family, clear cookie, drop access token from memory |
| Logout all devices | Revoke every session of the user (+ optional `validAfter` watermark) |
| Password change | Revoke all sessions — a stolen session must not survive a password reset |

> Clearing a cookie only clears *that browser*. It cannot cancel a JWT someone has already copied. That is why access tokens are short-lived and why servers keep a revocation mechanism.

**Watermark trick:** store `validAfter:userId = timestamp` in Redis. Reject any access token whose `iat` is older. One key revokes unlimited tokens — no giant blocklist.

---

## 12. Step 8 — What leaks tokens (and what never to log)

Tokens leak through:

1. **XSS** — script reads storage / makes calls.
2. **Logs** — `Authorization` header printed to console, Sentry, access logs.
3. **URLs** — `?token=...` ends up in history, referrers, proxies, analytics.
4. **Malicious extension / infected device.**
5. **Supply chain** — a compromised npm package runs as your JavaScript.

Never log: passwords, JWTs, refresh tokens, `Authorization` headers, cookies, OAuth secrets, OTPs, reset tokens. Redact at the logger level, once, centrally.

---

## 13. Step 9 — Security baseline checklist

```text
[ ] HTTPS everywhere + HSTS
[ ] Argon2id/bcrypt, never fast hashes
[ ] Server-side validation on every input
[ ] Generic login errors + rate limiting on login/refresh/reset
[ ] Short access TTL (5–15 min)
[ ] Refresh rotation + reuse detection + hashed refresh tokens in DB
[ ] HttpOnly + Secure + SameSite cookies
[ ] CSRF strategy for every cookie-authenticated state-changing route
[ ] CSP + safe rendering (no raw HTML from users)
[ ] Authorization on every route + ownership checks
[ ] No secrets in tokens, logs, or URLs
[ ] Revoke sessions on password change
[ ] MFA / passkeys for sensitive actions
[ ] Dependency hygiene (lockfile, audit, minimal deps)
[ ] Audit log + alerts for suspicious login/session events
```

---

## 14. What this README intentionally leaves to other files

- *Which* auth type fits *which* app → [`01`](./docs/01-types-of-authentication.md)
- Full working code and flow diagrams → [`02`](./docs/02-code-flows.md)
- Scaling, Redis, Instagram-style design → [`03`](./docs/03-system-design-auth.md)
- How each attack works → [`04`](./docs/04-web-attacks.md)
- Defenses + threat modeling → [`05`](./docs/05-defenses-and-threat-modeling.md)
- Interview answers → [`06`](./docs/06-interview-playbook.md)

---

## 🧠 The ten-question framework

When an interviewer asks *anything* about authentication, walk these in order:

```text
1. WHAT is the identity proof?        6. HOW does an attacker replay it?
2. WHERE is it stored?                7. HOW do we revoke it?
3. HOW is it verified?                8. WHAT can the identity do?
4. HOW long is it valid?              9. HOW does it scale?
5. HOW can it be stolen?             10. HOW do we detect and debug failures?
```

If you can answer those ten for any design, you are reasoning about a system, not reciting "JWT authentication".