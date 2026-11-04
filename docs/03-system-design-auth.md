# 03 — Authentication at System-Design Level

> The question changes from "how do I write login?" to "how does auth behave for **millions of users, many devices, many servers, and active attackers**?"
> ← [README](../README.md) · ← [02 Code](./02-code-flows.md) · → [04 Attacks](./04-web-attacks.md)

---

## 1. Frame the problem (always start here in an interview)

### Functional requirements
- Sign up, log in (password, social, passkey), log out
- Stay logged in across days (refresh)
- Multiple devices per user; **"Where you're logged in"** list; log out a single device or all
- 2FA / MFA, account recovery
- Authorize (roles, ownership, scopes) for every API call
- Notify user about new-device logins

### Non-functional requirements
- **Latency:** auth check adds only microseconds–milliseconds per request
- **Availability:** auth outage must not take the whole product down
- **Security:** resist credential stuffing, token theft, brute force, replay
- **Scale:** tens of thousands of requests/second, millions of sessions
- **Revocability:** compromised session killed in seconds
- **Auditability:** who logged in from where, when

### Key insight
> There are **two very different traffic types**.
> **Login** — rare, expensive (password hashing), high risk.
> **Authenticated API calls** — constant, must be cheap.
> Good design makes the common path cheap (verify a token locally) and the rare path strong (heavy checks, risk scoring).

---

## 2. Back-of-the-envelope (illustrative numbers)

Assume 50M daily active users, 100 API calls/user/day, 5M logins/day.

```text
API requests/day   = 50M × 100            = 5 billion
Average QPS        = 5B / 86,400          ≈ 58,000 req/s
Peak (×3)                                 ≈ 175,000 req/s

Logins/day = 5M  →  ≈ 58 logins/s average, maybe 300/s at peak
bcrypt (cost 12) ≈ 250 ms CPU each
CPU needed at peak = 300 × 0.25 s          ≈ 75 CPU-seconds per second ≈ 75 cores
```

Conclusions:
1. **Password hashing is the CPU bottleneck**, not token verification.
2. JWT verification (~tens of microseconds) is cheap → do it at the edge/gateway, no network call.
3. A session-store lookup per request (175k/s) means a **big Redis cluster** — that is the cost of stateful sessions.
4. Login endpoints need **their own rate limit and autoscaling pool**, separate from the main API.

(These numbers are for reasoning, not facts about any company. State your assumptions in the interview.)

---

## 3. High-level architecture

```text
                       ┌────────────────────────────────────────────┐
 Client ─▶ CDN / WAF ─▶│ API GATEWAY                                 │
 (web/app) (DDoS, bot  │  • TLS termination, rate limiting           │
           rules)      │  • verify access JWT locally (public key)   │
                       │  • attach identity headers to the request   │
                       └───────┬───────────────────────┬────────────┘
                               │                       │
                 /auth/*       ▼                       ▼    /api/*
                     ┌──────────────────┐     ┌──────────────────────┐
                     │  AUTH SERVICE    │     │  Business services   │
                     │  login, refresh, │     │  (orders, feed, ...) │
                     │  MFA, recovery   │     │  trust gateway claims│
                     └───┬──────┬───────┘     │  + do their own      │
                         │      │             │  authorization       │
            ┌────────────┘      └──────┐      └──────────────────────┘
            ▼                          ▼
   ┌─────────────────┐       ┌──────────────────┐        ┌────────────────────┐
   │ Users DB        │       │ Redis cluster    │        │ Event bus (Kafka)  │
   │ (hashes, MFA)   │       │ sessions, denylist│──────▶│ login events       │
   └─────────────────┘       │ rate-limit counters│       └─────┬──────┬──────┘
                             └──────────────────┘             ▼      ▼
                                                       Notification  Risk /
                                                       service       fraud engine
                                                       (email/push)  + audit log
```

Why each piece exists:

| Component | Problem it solves |
|---|---|
| **CDN/WAF** | Absorbs DDoS, blocks known bad bots before they reach auth |
| **API gateway** | Central place for rate limits + JWT verification → services stay simple |
| **Auth service (separate)** | Only service holding password hashes & signing keys → small attack surface; scale independently |
| **Redis** | Millisecond lookups for sessions, denylist, `validAfter`, rate-limit counters, with TTLs |
| **Users/Session DB** | Durable truth (Redis can lose data) |
| **Event bus** | Decouples login from side-effects (alerts, risk scoring, audit) so login stays fast |

---

## 4. Token design at scale

### Asymmetric signing + JWKS

```text
Auth service  ── signs JWT with PRIVATE key (RS256 / ES256 / EdDSA) ──▶ token
Any service   ── fetches PUBLIC keys from /.well-known/jwks.json ─────▶ verifies locally
```

- Only the auth service can **mint** tokens; everyone else can only **verify**.
- With one shared HMAC secret (HS256), *every* service that can verify can also forge tokens — a risk across many teams.
- **Key rotation:** each token header has `kid`. Publish new + old public keys during rotation; retire the old after tokens expire.

### Lifetimes

| Token | TTL | Why |
|---|---|---|
| Access JWT | 5–15 min | Limits blast radius of theft |
| Refresh | 7–30 days **sliding** with an **absolute max** (e.g. 90 days) | Convenience vs forced re-auth |
| Step-up proof | 5 min | Sensitive actions re-verified |

---

## 5. Sessions & multi-device (the "Where you're logged in" page)

Each login = one **session family** row:

```text
Session
 ├ sessionId / familyId
 ├ userId
 ├ refreshTokenHash   (rotates inside the family)
 ├ deviceName, os, browser
 ├ ip, approximate city/country   (store only what the product needs — privacy!)
 ├ createdAt, lastActiveAt, expiresAt
 └ revokedAt
```

```text
USER 101
 ├─ Family A: iPhone / Safari / Mumbai       lastActive: now
 ├─ Family B: MacBook / Chrome / Delhi       lastActive: 2h ago
 └─ Family C: Android / Chrome / Bangalore   lastActive: 3d ago
```

Features that fall out of this table:
- **Device list UI** = `SELECT * FROM sessions WHERE userId = ? AND revokedAt IS NULL`
- **Log out one device** = revoke one family
- **Log out everywhere / password change** = revoke all families
- **Concurrent session cap** = revoke the oldest family when count > N
- **Suspicious login** = compare new device/geo against history

---

## 6. Revocation strategies (comparison)

| Strategy | How | Cost | Latency to revoke |
|---|---|---|---|
| Short TTL only | Wait for expiry | Free | up to TTL (minutes) |
| **Denylist by token ID (`jti`)** | Redis set with TTL = token remaining life | Memory grows with revocations | Instant |
| **`validAfter:userId` watermark** | One Redis key per user; reject tokens with `iat` older | O(1) per user | Instant |
| **Introspect/opaque** | Look up every request | Network hop each request | Instant |
| **Token version in user row** | `tokenVersion` claim must match DB | DB read per request (cache it) | Near-instant |

Common production answer: **short JWT + watermark check on sensitive routes + hard revoke of refresh families.**

---

## 7. The big interview question: "What if a token is stolen?"

Think in four phases — **Prevent → Limit → Detect → Respond**.

```text
PREVENT   XSS defenses (CSP, safe rendering), HttpOnly refresh cookie, TLS + HSTS,
          no tokens in URLs/logs, dependency hygiene
LIMIT     short access TTL, narrow scopes, absolute session lifetime,
          sender-constrained tokens (DPoP / mTLS), step-up for sensitive actions
DETECT    refresh-token REUSE detection, new device/IP/geo, impossible travel,
          user-agent change mid-session, abnormal request rate
RESPOND   revoke the session family, bump validAfter, force re-login,
          require password reset if account takeover suspected, notify user, audit log
```

Full interview answer is in [06](./06-interview-playbook.md).

---

## 8. Protecting the login endpoint (the real battlefield)

| Attack | Defense |
|---|---|
| **Brute force** (one account, many passwords) | Per-account throttling, progressive delays, temporary lock/step-up (careful: lockouts enable DoS) |
| **Credential stuffing** (leaked pairs from other sites) | Per-IP **and** per-account **and** per-device limits; breached-password check (k-anonymity API); CAPTCHA on anomaly; MFA |
| **Password spraying** (one password, many accounts) | Global per-password-attempt monitoring, IP reputation |
| **Account enumeration** | Generic errors, equal timing, same response for reset flow |
| **Bot traffic** | WAF/bot management, device attestation, proof-of-work |

Rate-limit keys: `ip`, `account`, `ip+account`, `device`. Counters live in Redis with sliding windows.

---

## 9. 2FA, recovery, and the weakest link

| Factor | Notes |
|---|---|
| TOTP app | Good baseline. Store the shared secret encrypted. |
| SMS OTP | Weak (SIM swap, interception) — fallback only |
| Passkeys / WebAuthn | Strongest; phishing-resistant; origin-bound |
| Recovery codes | One-time, hashed in DB, shown once |

> **Account recovery is usually the weakest link.** If "forgot password" only needs an email click, then your email provider is your real authentication. Reset tokens must be random, single-use, short-lived, hashed in DB, and **revoke all sessions** on use.

---

## 10. Case study: designing Instagram-style authentication

> **Honesty note:** Instagram's internal implementation is not public. Below is how you would **design** a comparable system, inferred from product behavior users can see (Login activity, Where you're logged in, 2FA, "Was this you?" prompts, trusted-device flows). Present it as *your design*, not as "what Instagram uses."

### Visible product behaviors → design implications

| What users see | What it implies |
|---|---|
| Stay logged in for months on phones | Long-lived refresh/session credential stored in OS secure storage (Keychain/Keystore) |
| "Where you're logged in" list | Per-device session table; revoke per row |
| "Was this you?" login prompt | Risk engine + event bus + push notification service |
| Log out of all devices | Bulk revoke + watermark |
| 2FA via app / SMS | Pluggable second-factor service |
| Mobile + web + API clients | Token-based API auth for apps; cookie session for web |
| Billions of requests | Edge verification, regional caches, no central bottleneck |

### Design

```text
Mobile app / Web
     │  (login: password / passkey / Facebook-style SSO)
     ▼
Edge + WAF + bot defense
     ▼
Auth service (regional)
  1. rate-limit (ip, account, device)
  2. verify credential (Argon2id / passkey)
  3. RISK SCORE: new device? new country? known-bad IP? velocity?
        low risk  → issue session
        medium    → require 2FA / email code
        high      → block + challenge
  4. create session family (device id, OS, app version)
  5. issue short access token + opaque long-lived device token
     ▼
Session store (sharded, multi-region)  +  Event stream
                                              │
                                  ┌───────────┼────────────┐
                                  ▼           ▼            ▼
                              Push/email   Risk model   Audit/SIEM
                              "New login"  (learns)     (security team)
```

### Choices & trade-offs to discuss

1. **Access token vs session lookup.** At very large scale you verify short-lived signed tokens at the edge (cheap) and keep the **long-lived credential opaque and server-revocable**.
2. **Multi-region consistency.** A user in Mumbai logs out; the Frankfurt edge must learn quickly. Options: replicate revocations (eventual, seconds), keep access TTL tiny, route refresh to the session's **home region**.
3. **Device identity.** A device ID (random, generated at install, stored in secure storage) helps recognize "known device". It is a *signal*, not proof — attackers can copy it.
4. **Privacy.** Store coarse location, not GPS. Retention limits on IP logs.
5. **Account takeover recovery.** Fast path to "secure my account": revoke all sessions, reset password, review recent activity, remove unknown 2FA methods.
6. **Abuse.** Fake-account creation and credential stuffing dominate real-world traffic; defense is mostly **rate limiting + risk scoring**, not cryptography.
7. **Failure behavior.** If the risk engine is down: fail **open** for low-risk logins (availability) but fail **closed** for sensitive actions.

---

## 11. Failure modes (what breaks, and what you do)

| Failure | Effect | Mitigation |
|---|---|---|
| Redis down | Sessions/rate limits unavailable | Replicas + failover; **choose fail-open vs fail-closed per endpoint** |
| Auth service down | No logins/refresh | Existing access JWTs still verify until expiry (a benefit of stateless) |
| Signing key leaked | Attacker can mint tokens | Rotate key immediately (`kid`), shorten TTL, revoke all refresh families |
| DB replica lag | Rotation sees stale `usedAt` → false reuse alarms | Read refresh state from primary; short grace window for network-retry cases |
| Clock skew | Valid tokens rejected/accepted wrongly | NTP, small leeway (30–60 s) on `exp/nbf` |
| Thundering herd after outage | Everyone refreshes at once | Jittered retry, rate-limit refresh, stagger TTLs |
| Mass password-reset abuse | Email provider throttles you | Per-account/ip limits, CAPTCHA |

---

## 12. Microservices: who trusts whom

```text
Gateway verifies JWT ─▶ forwards  X-User-Id, X-User-Role   (internal network only!)
Service A  ─ trusts headers? ONLY if the call came through the gateway (mTLS between services)
Service A  ─ still does its own AUTHORIZATION (ownership/tenant checks)
Service A  ─ calls Service B ─▶ passes the user's token OR a service token (token exchange)
```

Rules:
- **Zero trust inside the network:** internal ≠ trusted. Use mTLS or signed internal tokens.
- **AuthN once at the edge, AuthZ everywhere.**
- Keep scopes minimal per service-to-service call.

---

## 13. Observability for authentication

Metrics: login success/fail rate, refresh rate, reuse-detection count, 401/403 rates, lockouts, MFA challenge rate, p95 latency of `/auth/*`.
Logs (safe): `requestId, userId, sessionId (non-secret), route, status, reason code, ip hash`.
Alerts: spike in failed logins, many accounts from one IP, reuse-detection spike, sudden geo change, refresh from two IPs in the same family.

**Never** log secrets, tokens, passwords, OTPs.

---

## 14. How to present this in an interview (script)

1. Clarify requirements & scale. State assumptions.
2. Split **login path** (rare, heavy) from **request path** (frequent, cheap).
3. Choose credential model: short JWT + rotated opaque refresh.
4. Draw: gateway → auth service → Redis/DB → event bus.
5. Cover multi-device sessions, revocation, MFA/recovery.
6. Cover attacks: stuffing, brute force, token theft.
7. Cover scaling bottlenecks (hashing CPU, Redis QPS) and failure modes.
8. Close with trade-offs you consciously made.

📖 **Official / canonical docs:** [MDN – Session management](https://developer.mozilla.org/en-US/docs/Web/Security/Authentication/Session_management) · [OWASP – Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) · [OWASP – Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) · [RFC 9700 – OAuth Security BCP](https://datatracker.ietf.org/doc/html/rfc9700) · [RFC 9449 – DPoP](https://datatracker.ietf.org/doc/html/rfc9449) · [MDN – Threat modeling](https://developer.mozilla.org/en-US/docs/Web/Security/Threat_modeling)
