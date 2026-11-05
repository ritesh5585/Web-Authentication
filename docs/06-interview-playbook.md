# 06 — Interview Playbook

> Short, strong answers. Each one follows: **definition → how it works → trade-off → example.**
> ← [README](../README.md) · ← [05 Defenses](./05-defenses-and-threat-modeling.md)

**How to answer anything:** use the ten-question framework from the README (identity proof → storage → verification → lifetime → theft → replay → revocation → permissions → scale → debugging).

---

## Part 1 — Fundamentals

**Q1. Authentication vs authorization?**
Authentication answers "who are you?" and fails with `401`. Authorization answers "what may you do?" and fails with `403`. Validation (`400`) comes first, so the order is validation → authentication → authorization → controller.

**Q2. 401 vs 403?**
`401` = no valid identity (missing/invalid/expired credential). `403` = identity known, action not allowed. Sometimes return `404` instead of `403` so an attacker can't learn a resource exists.

**Q3. Why does HTTP need sessions/tokens at all?**
HTTP is stateless; each request is independent. We verify the password once, then hand the client a credential that proves identity on later requests, so we don't verify the password every time.

**Q4. What is a bearer token?**
Whoever *bears* (holds) it is treated as the user. So protecting where it's stored and how long it lives is the core security job.

**Q5. Session vs JWT?**
Session = random ID, server looks up state (easy revocation, store needed). JWT = signed self-contained claims, verified locally (scales, hard to revoke). Neither is "old" or "modern" — they are trade-offs.

---

## Part 2 — Passwords

**Q6. How do you store passwords?**
Hash with a slow, salted algorithm — Argon2id (preferred) or bcrypt. Never plain text, never encryption, never MD5/SHA-256 alone.

**Q7. Hashing vs encryption?**
Hashing is one-way; encryption is reversible with a key. Passwords need one-way.

**Q8. Why is a *slow* hash good?**
After a DB leak, attackers guess offline. Slow hashes make each guess expensive.

**Q9. What is a salt?**
A random per-user value mixed into the hash, so equal passwords give different hashes and rainbow tables fail. Not secret; bcrypt stores it in the hash string.

**Q10. How do you prevent account enumeration?**
Same message ("Invalid email or password") and similar timing for unknown email and wrong password; same response on "forgot password".

**Q11. bcrypt limitation?**
Only the first 72 bytes are used; cost factor should be tuned so a hash takes ~100–300 ms.

---

## Part 3 — JWT

**Q12. Is a JWT encrypted?**
Normally no. It is signed (integrity), not encrypted (confidentiality). The payload is Base64URL — anyone can read it. Don't store secrets in it.

**Q13. If the payload is readable, why can't a user change `role` to admin?**
The signature covers header+payload. Any change breaks the signature; without the secret/private key the attacker can't recompute it, so `jwt.verify()` rejects it.

**Q14. `decode` vs `verify`?**
`decode` only reads. `verify` checks the signature, expiry, issuer, audience. Authentication must use `verify`.

**Q15. What JWT attacks do you know?**
`alg: none` (unsigned token accepted), algorithm confusion (RS256 public key used as an HS256 secret), weak secrets (brute-forced), missing `exp`, accepting tokens for the wrong `aud`. Fix: pin algorithms, strong keys, check `exp/iss/aud`.

**Q16. HS256 vs RS256?**
HS256 = shared secret (everyone who can verify can also forge). RS256/ES256/EdDSA = private key signs, public key verifies — safer for many services via JWKS and `kid` for rotation.

**Q17. How do you revoke a JWT?**
You can't "cancel" one directly. Options: short TTL, denylist by `jti`, per-user `validAfter` watermark, token version in DB, or use opaque tokens for sensitive paths.

---

## Part 4 — Access + refresh

**Q18. Why two tokens?**
A single long-lived token is dangerous wherever you store it. Split: short-lived access token (memory) limits theft impact; long-lived refresh token (HttpOnly cookie, server-side, rotated) gives persistent login and can be revoked.

**Q19. What is refresh-token rotation?**
Every refresh issues a new refresh token and invalidates the old one. If an old token shows up again, it's reuse → revoke the whole token family and force login.

**Q20. Is rotation prevention?**
No — it is detection. Attacker and user can race; the server can't tell who is real, so it fails closed.

**Q21. Why store the refresh token hashed?**
Same reason as passwords: if the DB leaks, the hashes can't be replayed.

**Q22. 8 parallel requests all get 401. What happens?**
8 refresh calls; the first rotates the token, the others replay the old one → false reuse alarm. Fix: single-flight refresh on the client (one shared promise) and an atomic consume on the server.

**Q23. Why is the refresh endpoint's cookie `Path` `/api/auth` and not `/`?**
To send it only where needed. Use `/api/auth` (not `/api/auth/refresh`) if logout must read the same cookie. `Path` is exposure reduction, not a security boundary.

---

## Part 5 — Storage & cookies

**Q24. localStorage vs cookie for tokens?**
localStorage is readable by any script on the origin → XSS steals it. Cookies are sent automatically → CSRF risk, but `HttpOnly` blocks JS reading. Typical: access token in memory, refresh in HttpOnly cookie.

**Q25. Explain `HttpOnly`, `Secure`, `SameSite`.**
`HttpOnly`: JS can't read. `Secure`: only over HTTPS. `SameSite`: controls cross-site sending (Strict/Lax/None) → CSRF defense.

**Q26. Does HttpOnly stop XSS?**
No. It stops reading the cookie. Injected script can still send authenticated requests.

**Q27. Why does memory storage have a downside?**
Lost on reload (needs a refresh call at startup), and XSS on a live page can still use it.

---

## Part 6 — OAuth / OIDC / SSO

**Q28. OAuth 2.0 vs OpenID Connect?**
OAuth = delegated *authorization* (access to resources). OIDC = *authentication* layer on top (ID token says who the user is). "Sign in with Google" is OIDC.

**Q29. Explain the authorization code flow.**
App redirects to provider with `client_id`, `scope`, `redirect_uri`, `state` → user logs in/consents → provider redirects back with a one-time `code` → backend exchanges code (+ secret/PKCE) for tokens server-to-server → backend creates its own session.

**Q30. What are `state` and PKCE for?**
`state` binds the response to the request (CSRF on login flow). PKCE binds the code to the client that requested it, protecting code interception, essential for public clients.

**Q31. Where does `client_secret` live?**
Only on the server. Never in React/mobile app code.

**Q32. ID token vs access token?**
ID token = proof of authentication for *your* app. Access token = credential to call an API. Don't use an ID token to call APIs.

**Q33. Account linking risk?**
Pre-hijacking: an attacker registers a victim's email with a password first. Only link on **verified** emails; verify email on password sign-up.

---

## Part 7 — RBAC and protected routes (asked in your interview)

### Q34. "How do you keep backend data inaccessible to a user who shouldn't see it on a protected route?"

**Answer structure — layers, enforced on the server:**

1. **Frontend guards are only UX.** Hiding `/admin` in React doesn't protect anything; anyone can call the API from Postman. The backend enforces everything.
2. **Authentication middleware** verifies the token (`jwt.verify`, pinned algorithm, `exp/iss/aud`) and sets `req.user`. No/invalid token → `401`, controller never runs.
3. **Authorization middleware** (RBAC) checks the role: `allow("admin")` → else `403`.
4. **Object-level authorization** (ownership/tenant) **inside the DB query**: `Order.findOne({ _id, userId: req.user.id })`. Data the user may not see is never loaded. Return `404` to hide existence.
5. **Field-level shaping:** return a DTO with only permitted fields (no `passwordHash`, internal flags). Don't send everything and "hide" in the UI.
6. **Identity from the token, not the body.** Never trust `userId`/`role` sent by the client; allow-list updatable fields (prevent mass assignment).
7. **Deny by default:** new routes are protected unless explicitly made public.
8. **Server-rendered / Next.js:** re-check auth in the route handler/server component; don't rely on middleware alone (CVE-2025-29927 showed middleware bypass).
9. **Test it:** automated tests with two users and each role; replay user A's requests with user B's token.
10. **Observe:** log denied attempts and alert on ID scanning.

```js
router.get("/admin/reports",    isLoggedIn, allow("admin"), listReports);        // role gate
router.get("/orders/:id",       isLoggedIn,                 getOrderOwnedByMe);   // object gate
```

**One-line answer:** "Authenticate, authorize by role, then authorize by object inside the query, and return only the fields that caller may see — all on the server, deny by default."

### Q35. RBAC vs ABAC vs ACL?
RBAC: permissions by role (simple). ABAC: decisions from attributes (user dept, resource owner, time, IP). ACL: per-resource list of who can do what. Real systems combine RBAC with ownership checks (a light form of ABAC).

### Q36. Role changed (demoted) but the user's JWT still says admin. Problem?
Yes — stale claims until expiry. Mitigate with short access TTL, re-checking sensitive permissions in DB, a `validAfter`/token-version bump on role change, and revoking refresh families.

### Q37. Two users both have role `user`. How stop A reading B's order?
Role check can't. Add ownership check in the query (IDOR defense).

### Q38. How do you structure permissions for many roles?
Permission-based checks (`orders:read`, `orders:refund`) mapped from roles; middleware `can("orders:refund")`. Roles are bundles of permissions, so adding a role doesn't touch route code.

### Q39. Multi-tenant app (companies/workspaces)?
Every record carries `tenantId`; every query is scoped by the tenant from the token/session; consider DB row-level security; test cross-tenant access.

---

## Part 8 — Token theft & incident response (asked in your interview)

### Q40. "If someone steals a token, how do you safeguard against misuse?"

**Four phases — Prevent, Limit, Detect, Respond:**

**Prevent (make theft hard)**
- Stop XSS: safe rendering, CSP with nonces, Trusted Types, sanitize any HTML.
- Refresh token in `HttpOnly; Secure; SameSite` cookie; access token in memory.
- HTTPS + HSTS (no sniffing); no tokens in URLs or logs (central redaction).
- Dependency hygiene (supply chain), SRI for third-party scripts.

**Limit (shrink the damage window)**
- Access token 5–15 min; narrow scopes; absolute session lifetime.
- Step-up (passkey/OTP) for sensitive actions: change password/email, payments.
- Sender-constrained tokens (DPoP / mTLS) so a copied token alone is useless.

**Detect**
- **Refresh-token reuse detection** via rotation + family IDs.
- Anomalies: new device, new country, impossible travel, user-agent change mid-session, abnormal request volume.
- Alert users on new-device login.

**Respond**
- Revoke the session family; bump `validAfter` so existing access tokens die.
- Force re-login; require password reset if takeover is likely; remove unknown 2FA methods/devices.
- Notify the user; write an audit event; rotate signing keys if the key leaked.
- Offer "log out of all devices" and a visible "where you're logged in" list.

**One-line answer:** "Short-lived access tokens, rotated and server-revocable refresh tokens with reuse detection, anomaly alerts, and a fast revoke-everything path — and mostly, preventing XSS so the token isn't stolen at all."

### Q41. Why can't you just "delete the JWT"?
It's held by the attacker's client. The server must refuse it: expiry, denylist, watermark, or switch to opaque/session for that user.

### Q42. Where is the weakest link for most real breaches?
Phishing/credential reuse and account recovery flows, not cryptography. So: passkeys/MFA, breached-password checks, hardened reset flow.

---

## Part 9 — System design

### Q43. "Design authentication for an Instagram-scale app."
(Say up front that you're proposing a design, not claiming what Instagram uses.)

1. **Requirements:** login (password/social/passkey), stay logged in on phones for months, multi-device list, per-device logout, 2FA, "was this you?" alerts, millions of QPS.
2. **Split paths:** rare expensive login vs. constant cheap API calls.
3. **Credentials:** short-lived signed access token verified at the gateway; long-lived **opaque, server-revocable** device/refresh token in secure OS storage; rotation + reuse detection.
4. **Services:** Edge/WAF → API gateway (rate limit, JWT verify) → Auth service → Redis (sessions, denylist, rate limits) + DB (users, sessions) → event bus → notifications, risk engine, audit.
5. **Multi-device:** one session family per login with device metadata → powers the device list and revoke.
6. **Login hardening:** rate limits per IP/account/device, breached-password check, risk scoring → step-up/2FA/block.
7. **Revocation:** family revoke + `validAfter` watermark; replicate across regions (eventual, seconds); tiny access TTL.
8. **Scale:** hashing CPU is the bottleneck at login; JWT verify is cheap; Redis QPS if stateful; separate login pool and autoscaling.
9. **Failure modes:** Redis down (fail-open vs fail-closed per endpoint), key leak (rotate `kid`), refresh thundering herd (jitter).
10. **Trade-offs:** stateless speed vs revocation, UX vs security, privacy of device/location data.
Full write-up: [03 System design](./03-system-design-auth.md).

### Q44. Session store vs JWT at huge scale?
Hybrid: JWT for hot path (no lookup), opaque refresh for control. Pure sessions need massive Redis; pure JWT can't revoke.

### Q45. How do microservices trust identity?
Gateway verifies the token; internal calls use mTLS/signed internal tokens; each service still does its own authorization (ownership/tenant). Zero trust inside the network.

### Q46. Redis (session store) goes down?
Decide per endpoint: public/low-risk → fail open with degraded checks; sensitive → fail closed. Use replicas/failover. Existing JWTs keep working until expiry (resilience benefit).

---

## Part 10 — Attacks (rapid fire)

**Q47. XSS vs CSRF?**
XSS runs attacker code *in* your origin (read + act). CSRF makes the browser *send* a request with automatic cookies (act only). XSS steals/uses the credential; CSRF abuses automatic attachment.

**Q48. How to stop CSRF?**
SameSite cookies, CSRF tokens/double-submit, Origin/Fetch-Metadata checks, custom headers, never state change via GET. Bearer headers aren't auto-attached so are naturally CSRF-safe.

**Q49. How to stop XSS?**
Context-aware output encoding, avoid dangerous sinks, sanitize HTML (DOMPurify), CSP with nonces, Trusted Types.

**Q50. Clickjacking fix?**
`frame-ancestors` (+ `X-Frame-Options`), SameSite cookies, confirmation on sensitive actions.

**Q51. What is IDOR?**
Missing object-level authorization — changing an ID returns another user's data. Fix with ownership checks in the query; UUIDs are only defense in depth.

**Q52. What is SSRF and a real example?**
Attacker makes your server fetch an arbitrary URL, reaching internal services or cloud metadata (the 2019 Capital One breach used SSRF against AWS metadata). Fix: allow-list, validate resolved IPs, pin connection, control redirects, egress isolation, IMDSv2.

**Q53. Prototype pollution?**
Untrusted keys like `__proto__` written via unsafe recursive merge pollute `Object.prototype`, changing behavior app-wide (auth bypass, XSS, RCE gadgets). Fix: block keys, `Object.create(null)`/`Map`, schema validation, update libs.

**Q54. MITM?**
Attacker between client and server. TLS + HSTS + Secure cookies + never disabling cert verification.

**Q55. Subdomain takeover?**
Dangling DNS record pointing to a deleted cloud resource gets claimed by an attacker. Remove DNS on teardown, avoid wildcard trust, host-only/`__Host-` cookies.

**Q56. XS-Leaks?**
Cross-site information leaks via observable differences (timing, errors, frame count, cache). SameSite cookies, Fetch Metadata, COOP/CORP.

**Q57. Supply chain attack?**
Poisoned dependency/CDN/CI. Lockfile + `npm ci`, review updates, minimal deps, SRI, CSP, scoped private packages, 2FA/provenance.

**Q58. Phishing and MFA?**
Real-time proxy phishing can capture TOTP + session. Passkeys are origin-bound, so a fake domain can't use them.

**Q59. Is CORS a security feature?**
It relaxes SOP for reading cross-origin responses. It doesn't authenticate users or stop forged requests (CSRF); it's enforced only by browsers.

**Q60. NoSQL injection in Mongo login?**
Passing `req.body` directly allows `{"$ne": null}` operators. Validate types (zod), sanitize, never query by password.

---

## Part 11 — Debugging scenarios

| Symptom | Check in this order |
|---|---|
| Random logouts | Access TTL, refresh cookie present?, SameSite/Secure mismatch on localhost, `withCredentials`, CORS credentials, refresh `Path`, clock skew |
| Redirect loop on reload | Route guard ran before auth bootstrap finished → add `loading` state |
| "Reuse detected" for real users | Parallel refreshes, multi-tab race, lost response + retry → single-flight + short grace window |
| Cookie not set in browser | `Secure` on http, wrong `SameSite` for cross-site, CORS missing `credentials`, domain mismatch |
| Works in Postman, not browser | CORS preflight, cookies, `Origin`, `withCredentials` |
| `401` right after login | Token not attached (interceptor), wrong header scheme, `aud/iss` mismatch, secret mismatch between services |
| `403` for admin | Role missing in token (stale), middleware order wrong, role case mismatch |
| Google login "redirect_uri_mismatch" | Exact URI registered in Google console (scheme, host, port, path) |
| State mismatch on OAuth callback | `oauth_state` cookie `SameSite=Strict` blocked → use `Lax`, or cookie path/domain wrong |

---

## Part 12 — Trap questions

- "JWT is encrypted, right?" → No, signed.
- "I store the JWT in HttpOnly cookie, so XSS is solved." → No; script can still send requests.
- "We use UUIDs so IDOR is impossible." → No; authorization is still required.
- "Our API is JSON-only so CSRF can't happen." → Don't rely on that.
- "CORS protects my API." → No.
- "Hide the admin button, done." → Backend must enforce.
- "Stateless = infinitely scalable." → CPU, keys, rate limits, DBs still exist.
- "Add SMS 2FA and we're safe." → SIM-swap/phishing; prefer passkeys/TOTP.
- "robots.txt hides private pages." → It advertises them.

---

## 60-second summary (memorize)

> I verify the password once with Argon2id, then issue a short-lived access JWT kept in memory and a rotating, hashed, server-stored refresh token in an HttpOnly Secure SameSite cookie. Every request passes authentication middleware (`jwt.verify`, pinned alg, exp/iss/aud) then RBAC and per-object ownership checks inside the query, deny by default. I defend XSS with encoding and CSP, CSRF with SameSite and tokens/Origin checks, IDOR with ownership checks, SSRF with validated egress, and the supply chain with lockfiles, SRI and CSP. For stolen tokens: short TTL, reuse detection, anomaly alerts, and fast revocation. At scale: gateway verification, Redis for sessions/rate limits, separate login pool, event-driven risk and notifications.

---

## Answers to the self-check questions

### From [01 Types](./01-types-of-authentication.md)
1. The refresh token must be revocable, so the server stores state for it — hashed so a DB leak can't be replayed. The access token is verified by signature, so nothing is stored.
2. Sessions/opaque tokens give instant revocation; the cost is a lookup per request and a shared store.
3. Both are valid session-management strategies with different trade-offs (revocation vs scalability).
4. No. The ID token proves *who logged in* to your app; the access token is for calling APIs.
5. Key management, expiry choices, revocation difficulty, rate limiting, CPU cost of hashing, token theft risk.

### From [02 Code flows](./02-code-flows.md)
1. Atomic update lets exactly one concurrent request consume the token; a find-then-update lets two both succeed and breaks rotation.
2. Logout also needs the cookie; `/api/auth` covers both while still limiting exposure.
3. Google redirects back via a cross-site navigation, so a `Strict` cookie wouldn't be sent. The refresh cookie is only used by same-site requests, so `Strict` works.
4. `404` doesn't reveal that someone else's resource exists.
5. Guards see "no user yet" and redirect to login before the boot refresh finishes → redirect loop.

### From [04 Attacks](./04-web-attacks.md)
1. SOP blocks *reading* cross-origin responses, not *sending* requests.
2. It blocks reading the cookie, not using it via requests from injected script.
3. Unguessable IDs ≠ authorization; leaked/guessed IDs still work without an ownership check.
4. DNS rebinding, redirects, alternate IP encodings and parser differences can bypass a single check.
5. A polluted `Object.prototype.isAdmin` is inherited by every object, so `if (user.isAdmin)` passes.
6. XSS, CSRF, IDOR, SSRF, prototype pollution, supply chain, and real-time phishing proxies (TOTP can be relayed).

### From [05 Defenses](./05-defenses-and-threat-modeling.md)
1. Blocks reading cross-origin responses; allows sending requests and embedding resources.
2. CORS governs reading responses; a forged request is still sent and processed.
3. The spec forbids it; browsers reject it. Name the exact origin.
4. Secure, `Path=/`, no `Domain` → host-only; can't be overwritten by subdomains.
5. It is public and advisory; it even reveals paths.
6. Spoofing (stolen token), Tampering (edited JWT), Repudiation (no audit log), Information disclosure (tokens in logs/IDOR), Denial of service (login flood), Elevation of privilege (mass-assigned role).
7. `{"email":{"$ne":null},"password":{"$ne":null}}` matches the first user. Validate types with a strict schema, sanitize, and verify passwords with `bcrypt.compare`.

---

## Study plan (7 days)

| Day | Do |
|---|---|
| 1 | README + Part 1–3 of this playbook; explain the ID-card model aloud |
| 2 | `01` + `02`: draw the login and refresh flows from memory |
| 3 | Build the Express flow; break it on purpose (replay a refresh token) |
| 4 | `04` XSS, CSRF, IDOR, clickjacking: write one vulnerable + one fixed example each |
| 5 | `04` SSRF, prototype pollution, supply chain, MITM, subdomain takeover, XS-Leaks |
| 6 | `03` System design: draw it on paper, explain Instagram-style design in 5 minutes |
| 7 | `05` threat model your own project (Slatex login/URL-fetch features), then mock interview Part 7–9 |
