# 05 — Defenses, Practical Guides & Threat Modeling

> Attacks tell you *what can go wrong*. This file is the **toolbox** and the **method** to decide what to build.
> ← [README](../README.md) · ← [04 Attacks](./04-web-attacks.md) · → [06 Interview playbook](./06-interview-playbook.md)

Structure follows MDN's Security section: **Defenses → Authentication → Practical implementation guides → Threat modeling.**

---

# Part A — Defenses (the browser/platform building blocks)

## A1. Same-Origin Policy (SOP)

**What:** The browser rule that a page from one **origin** cannot read data from another origin.
**Origin** = `scheme + host + port`.

| URL compared to `https://app.com/page` | Same origin? |
|---|---|
| `https://app.com/other` | ✅ |
| `http://app.com` (scheme differs) | ❌ |
| `https://api.app.com` (host differs) | ❌ |
| `https://app.com:8443` (port differs) | ❌ |

**What SOP blocks:** reading cross-origin responses (`fetch` result, iframe DOM, storage).
**What SOP allows:** *sending* cross-origin requests, embedding images/scripts/styles/forms. (That gap = CSRF, XS-Leaks.)

📖 [MDN – Same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy)

## A2. Secure contexts

**What:** Powerful APIs (Service Workers, WebAuthn/passkeys, Clipboard, Geolocation, many more) work **only on HTTPS or `localhost`**.
**Why:** Over HTTP a MITM could abuse those capabilities.
📖 [MDN – Secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts)

## A3. Transport Layer Security (TLS) and mixed content

TLS gives **confidentiality** (nobody reads), **integrity** (nobody modifies), **authentication** (you talk to the real server).

- Use TLS 1.2+ (prefer 1.3). Redirect HTTP→HTTPS. Send **HSTS**.
- **Mixed content** = HTTPS page loading HTTP resources → browsers block active content (scripts); never rely on that, just don't do it.

```http
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

📖 [MDN – TLS](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Transport_Layer_Security) · [MDN – Mixed content](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Mixed_content) · [OWASP – TLS Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Security_Cheat_Sheet.html) · [OWASP – HSTS](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Strict_Transport_Security_Cheat_Sheet.html)

## A4. Certificate Transparency (CT)

**What:** Public, append-only logs of every certificate issued. Browsers require certificates to be logged.
**Why:** If a CA mistakenly (or maliciously) issues a certificate for your domain, you can **detect it** by monitoring the logs.
Pair with **CAA DNS records** (which CAs may issue for you).
📖 [MDN – Certificate Transparency](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Certificate_Transparency)

## A5. Subresource Integrity (SRI)

**What:** A hash on `<script>`/`<link>` so the browser rejects a file if its content changed.
**Defends:** compromised CDN, supply-chain tampering.

```html
<script src="https://cdn.example.com/lib@1.2.3.js"
        integrity="sha384-BASE64HASH" crossorigin="anonymous"></script>
```
Only works for **pinned versions** (content must not change legitimately).
📖 [MDN – Subresource Integrity](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Subresource_Integrity) · [MDN – SRI practical guide](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/SRI)

## A6. User activation

**What:** Sensitive/annoying APIs (popups, fullscreen, clipboard, payment, sharing) require a recent **real user gesture** (click/tap/keypress).
**Why:** stops pages from silently abusing them. It also limits some automated attacks.
📖 [MDN – User activation](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/User_activation)

## A7. Local network access

**What:** Browsers restrict (and ask permission for) public websites that try to reach devices on your **local/private network** (routers, printers, dev servers).
**Why:** stops "visit a website → it probes/attacks your home router".
📖 [MDN – Local network access](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Local_network_access)

## A8. Input validation

**Rules:**
1. **Validate on the server** (client validation is UX only).
2. **Allow-list** (what is permitted), not deny-list.
3. Check **type, length, format, range**; reject unknown fields.
4. Validation is **not** output encoding — you need both (validate in, encode out).
5. Use **parameterized queries**/ODM — never build queries by string concatenation.

### MERN-specific: NoSQL injection

```js
// ❌ vulnerable login
const user = await User.findOne({ email: req.body.email, password: req.body.password });
// attacker sends JSON:  { "email": {"$ne": null}, "password": {"$ne": null} }
// → matches the first user! (operators smuggled into the query)
```

Fix:
```js
const { z } = require("zod");
const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128)
}).strict();                                  // rejects unknown keys and objects instead of strings

const { email, password } = loginSchema.parse(req.body);
```
Also: `express-mongo-sanitize`, and compare passwords via `bcrypt.compare` (never query by password).

📖 [MDN – Input validation](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Input_validation)

## A9. Operational security

Security is also **how you run things**:

- Secrets in a secret manager (not git, not the frontend); rotate regularly.
- **Least privilege** for people, services, CI tokens, DB users.
- Patch dependencies and OS images; automated scanning.
- Central logging, alerting, backups, **tested restore**.
- An **incident response plan**: who does what when a token/secret leaks.
- Separate environments; no production data on laptops.

📖 [MDN – Operational security](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Operational_security)

---

# Part B — Authentication guides (MDN)

These pages are the browser-side companion to the README. Read them in this order:

| Topic | One-line takeaway | Link |
|---|---|---|
| **Passwords** | Hash with Argon2id/bcrypt, allow long passwords & password managers, check breached passwords | [MDN](https://developer.mozilla.org/en-US/docs/Web/Security/Authentication/Passwords) |
| **One-time passwords** | TOTP/HOTP are second factors, not replacements; phishable | [MDN](https://developer.mozilla.org/en-US/docs/Web/Security/Authentication/OTP) |
| **Passkeys** | Public-key credentials bound to your origin; phishing-resistant | [MDN](https://developer.mozilla.org/en-US/docs/Web/Security/Authentication/Passkeys) |
| **Federated identity** | Let a provider (Google, etc.) authenticate users via OIDC/SAML | [MDN](https://developer.mozilla.org/en-US/docs/Web/Security/Authentication/Federated_identity) |
| **Session management** | Random IDs, secure cookies, timeouts, rotation after login, revoke on logout | [MDN](https://developer.mozilla.org/en-US/docs/Web/Security/Authentication/Session_management) |

Session management checklist (from the guide's ideas):
```text
[ ] Session ID: long, random, unpredictable
[ ] New session ID after login (prevents session fixation)
[ ] HttpOnly + Secure + SameSite
[ ] Idle timeout AND absolute timeout
[ ] Invalidate on logout, password change, privilege change
[ ] Don't put session IDs in URLs
```

---

# Part C — Practical implementation guides (copy-paste-ready)

## C1. Content Security Policy (CSP)

CSP tells the browser **which sources may load/execute**. It limits XSS damage.

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{random-per-response}' 'strict-dynamic';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https://api.example.com;
  frame-ancestors 'none';
  object-src 'none';
  base-uri 'none';
  form-action 'self';
```

Roll-out tip: start with **`Content-Security-Policy-Report-Only`**, collect violation reports, fix, then enforce.
CSP is **defense in depth** — it does not excuse an XSS bug.
📖 [MDN – CSP guide](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/CSP) · [MDN – CSP reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP)

## C2. Cross-Origin Resource Sharing (CORS)

CORS is a way to **relax** SOP **for reading** cross-origin responses. It is *not* a server-side access control and *not* CSRF protection.

```text
Browser (app.com) ──fetch──▶ api.com
   "complex" request? → first an OPTIONS preflight:
      Origin: https://app.com
      Access-Control-Request-Method: POST
      Access-Control-Request-Headers: authorization, content-type
   api.com replies:
      Access-Control-Allow-Origin: https://app.com
      Access-Control-Allow-Methods: GET, POST
      Access-Control-Allow-Headers: authorization, content-type
      Access-Control-Allow-Credentials: true      (only if cookies are needed)
      Vary: Origin
```

Rules:
- With credentials, `Access-Control-Allow-Origin: *` is **not allowed** — name the exact origin.
- **Never reflect** the incoming `Origin` header without checking an allow-list.
- Don't allow `null` origin; don't trust `*.example.com` wildcards blindly (subdomain takeover!).
- Always send `Vary: Origin` when the value changes per request.

```js
const allowed = new Set(["https://app.example.com"]);
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || allowed.has(origin)),
  credentials: true
}));
```
📖 [MDN – CORS guide](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/CORS)

## C3. Cross-Origin Resource Policy (CORP)

`Cross-Origin-Resource-Policy: same-origin | same-site | cross-origin` — tells the browser who may **embed** your resource (images, scripts, JSON). Blocks cross-site embedding used in XS-Leaks and Spectre-style attacks.
📖 [MDN – CORP](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/CORP)

## C4. Secure cookie configuration

```http
Set-Cookie: __Host-sid=abc123; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=3600
```

- `__Host-` prefix = Secure + `Path=/` + **no Domain** → can't be overwritten from a subdomain.
- Keep lifetime short; scope narrowly; never store sensitive data *in* the cookie.
📖 [MDN – Secure cookie configuration](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Cookies)

## C5. MIME type verification

Send the **correct `Content-Type`** and add `X-Content-Type-Options: nosniff` so browsers don't guess (a user-uploaded `.txt` that's really HTML+JS could otherwise execute). For uploads: validate the real file signature, store outside the web root or on a separate domain, never serve uploads as HTML.
📖 [MDN – MIME type verification](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/MIME_types)

## C6. Referrer policy

The `Referer` header can leak URLs (with tokens in them!) to other sites. Use:
```http
Referrer-Policy: strict-origin-when-cross-origin
```
(or `no-referrer` on sensitive pages). Also: **never put tokens in URLs** in the first place.
📖 [MDN – Referrer policy](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Referrer_policy)

## C7. robots.txt configuration

`robots.txt` is a **polite request to crawlers**, publicly readable — it is **not** access control. Listing `/admin-secret/` in it *advertises* the path. Protect with authentication, not robots.txt.
📖 [MDN – robots.txt](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Robots_txt)

## C8. Form autocompletion

Don't break password managers — they make users safer. Use semantic hints:
```html
<input type="email"    autocomplete="username">
<input type="password" autocomplete="current-password">   <!-- login -->
<input type="password" autocomplete="new-password">       <!-- sign-up / change -->
```
Turn autocomplete **off** only for genuinely sensitive one-time fields (card CVV, OTP codes).
📖 [MDN – Form autocompletion](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Turning_off_form_autocompletion)

## C9. TLS configuration

TLS 1.2/1.3 only, modern cipher suites, HSTS, OCSP stapling, auto-renewal of certificates. Test your setup with MDN HTTP Observatory.
📖 [MDN – TLS guide](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/TLS) · [MDN HTTP Observatory](https://developer.mozilla.org/en-US/observatory)

## C10. The "security headers" starter pack

```js
// Express + helmet gives most of these by default; tune CSP yourself
app.use(helmet());
app.use((req, res, next) => {
  res.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.set("Cross-Origin-Opener-Policy", "same-origin");
  res.set("Cross-Origin-Resource-Policy", "same-origin");
  next();
});
// sensitive API responses:
res.set("Cache-Control", "no-store");
```

| Header | Stops / helps with |
|---|---|
| `Content-Security-Policy` | XSS impact, clickjacking (`frame-ancestors`), data exfiltration |
| `Strict-Transport-Security` | SSL-stripping/MITM |
| `X-Content-Type-Options: nosniff` | MIME sniffing XSS |
| `X-Frame-Options` | Clickjacking (legacy) |
| `Referrer-Policy` | URL/token leakage |
| `Permissions-Policy` | Abuse of camera/mic/geolocation etc. |
| `Cross-Origin-Opener-Policy` / `-Resource-Policy` | XS-Leaks, cross-origin isolation |
| `Cache-Control: no-store` | Sensitive data left in caches |

---

# Part D — Threat modeling

## D1. What is it?

> **Threat modeling = thinking like an attacker *before* writing code**, so you design defenses where they matter.

Adam Shostack's four questions:

```text
1. What are we working on?             → draw the system
2. What can go wrong?                  → find threats (STRIDE)
3. What are we going to do about it?   → mitigations
4. Did we do a good enough job?        → review / test / residual risk
```

## D2. Step 1 — Draw a Data Flow Diagram (DFD)

Elements: **external entity** (user), **process** (code), **data store** (DB), **data flow** (arrows), and **trust boundaries** (dotted lines where trust level changes). Threats cluster at trust boundaries.

```text
 ┌────────┐   HTTPS    ┆   ┌────────────┐   ┌──────────┐   ┌──────────┐
 │ Browser│──────────▶ ┆   │ Auth API   │──▶│ Users DB │   │ Redis    │
 │ (user) │◀────────── ┆   │ (process)  │   └──────────┘   │ sessions │
 └────────┘            ┆   └─────┬──────┘                  └────▲─────┘
                       ┆         └──────────────────────────────┘
        TRUST BOUNDARY ┆                 TRUST BOUNDARY (internal network)
   (internet ↔ server) ┆
```

## D3. Step 2 — STRIDE

| Letter | Threat | Violates | Auth-system example | Typical mitigation |
|---|---|---|---|---|
| **S** | Spoofing | Authentication | Stolen password/token; phished credential | MFA/passkeys, TLS, short TTL |
| **T** | Tampering | Integrity | Edit JWT role; modify request in transit | Signature verification, TLS |
| **R** | Repudiation | Non-repudiation | User denies a transfer; no audit trail | Audit logs, signed events |
| **I** | Information disclosure | Confidentiality | Tokens in logs/URLs; IDOR; verbose errors | Redaction, authz checks, generic errors |
| **D** | Denial of service | Availability | Login flood, expensive hashing abuse | Rate limiting, WAF, autoscale |
| **E** | Elevation of privilege | Authorization | Mass-assignment `role:admin`, broken access control | Server-side RBAC + ownership, deny by default |

## D4. Worked example — "Login + refresh" threat table

| # | Threat (STRIDE) | Where | Likelihood | Impact | Mitigation | Residual |
|---|---|---|---|---|---|---|
| 1 | Credential stuffing (S) | `/auth/login` | High | High | Rate limit per ip/account, breached-pw check, MFA | Low |
| 2 | XSS steals access token (S/I) | SPA memory | Medium | High | CSP, safe rendering, 10-min TTL | Medium |
| 3 | Refresh token replay (S) | `/auth/refresh` | Low | High | Rotation + reuse detection, hashed storage | Low |
| 4 | CSRF on refresh/logout (T) | cookie endpoints | Medium | Low–Med | SameSite=Strict, Origin check | Low |
| 5 | IDOR on `/orders/:id` (I/E) | API | High | High | Ownership in query, tests with 2 users | Low |
| 6 | Token in logs (I) | Logger | Medium | High | Central redaction, log review | Low |
| 7 | DB leak exposes hashes (I) | Users DB | Low | High | Argon2id/bcrypt, hashed refresh tokens | Low |
| 8 | Brute-force flood (D) | `/auth/login` | High | Medium | Rate limit, WAF, separate login pool | Low |
| 9 | Mass assignment role (E) | `/register` | Medium | High | DTO allow-list, never accept `role` | Low |
| 10 | Malicious npm update (T) | CI/build | Low | Very high | Lockfile, `npm ci`, review, SRI/CSP | Medium |

**Risk = Likelihood × Impact.** Work top-down by risk; some residual risk is accepted *consciously* and written down.

## D5. Step 3/4 — Decide and verify

- Turn each mitigation into a **ticket + test** (e.g., a test that user B cannot read user A's order).
- Re-run the model when architecture changes (new third-party, new endpoint, new data type).
- Keep the diagram and table in the repo.

## D6. Frameworks & tools (what exists)

| Framework/tool | Use |
|---|---|
| **STRIDE** | Brainstorm threats per element |
| **PASTA** | Risk-centric, business-driven process |
| **LINDDUN** | Privacy-focused threats |
| **Attack trees** | Visualize attacker goals and paths |
| **OWASP Threat Dragon**, Microsoft Threat Modeling Tool | Diagramming + threat suggestions |

📖 [MDN – Threat modeling](https://developer.mozilla.org/en-US/docs/Web/Security/Threat_modeling) · [MDN – Example threat model](https://developer.mozilla.org/en-US/docs/Web/Security/Threat_modeling/Example_threat_model) · [MDN – PWA threat model](https://developer.mozilla.org/en-US/docs/Web/Security/Threat_modeling/PWA_threat_model) · [MDN – Frameworks and tools](https://developer.mozilla.org/en-US/docs/Web/Security/Threat_modeling/Frameworks) · [OWASP – Threat Modeling Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html)

## D7. How to talk about it in an interview

> "I start by drawing the data flow and trust boundaries, run STRIDE on each element, rate by likelihood × impact, and pick mitigations at the boundaries — for auth that's the login endpoint, token storage, refresh flow, and authorization checks. I turn mitigations into tests and revisit when the architecture changes."

---

## ✅ Self-check

1. What does SOP block, and what does it still allow?
2. Why is CORS not CSRF protection?
3. Why can't you use `Access-Control-Allow-Origin: *` with cookies?
4. What does `__Host-` guarantee about a cookie?
5. Why is `robots.txt` not a security control?
6. Name the six STRIDE letters and one auth example for each.
7. Show how `{"$ne": null}` bypasses a Mongo login, and how to prevent it.

Answers → [06 Interview playbook](./06-interview-playbook.md).
