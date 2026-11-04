# 01 — Types of Authentication

> Goal: know every mechanism, what problem it solves, and **when to pick it**.
> ← Back to [README](../README.md) · Next → [02 Code flows](./02-code-flows.md)

A real website **combines** mechanisms. They solve different problems:

```text
Identity proof   →  password / Google / passkey / OTP / magic link
Session carrier  →  session cookie / JWT / opaque token / access+refresh
Extra assurance  →  MFA, step-up, device checks
```

Do not compare "password vs JWT" — those are different layers. Compare *within* a layer.

---

## Layer 1 — Identity proof (how you prove who you are)

| Method | How it works | Strength | Weakness |
|---|---|---|---|
| **Password** | You know a secret | Familiar | Reuse, phishing, credential stuffing |
| **OTP / TOTP** (Google Authenticator) | Time-based code from a shared secret | Good 2nd factor | Phishable by real-time proxy sites |
| **SMS OTP** | Code sent by text | Easy | SIM-swap, interception — weakest 2nd factor |
| **Magic link** | One-time login URL by email | No password | Email account = master key; link must be single-use + short-lived |
| **Social login (OIDC)** | Google/GitHub vouches for you | No password to store | Depends on provider; account-linking edge cases |
| **Passkeys / WebAuthn** | Private key on your device signs a server challenge | **Phishing-resistant**, no shared secret | Device/recovery UX |
| **mTLS client certificate** | Client proves identity with a certificate | Very strong | Heavy; machine-to-machine |
| **SSO / SAML / OIDC (enterprise)** | Company identity provider logs you into many apps | Central control | Setup complexity |

### MFA — what it actually is

```text
Something you KNOW   → password, PIN
Something you HAVE   → phone, security key
Something you ARE    → fingerprint, face
```

MFA = combining **different** factors. Two passwords are *not* MFA.

📖 [MDN – Passwords](https://developer.mozilla.org/en-US/docs/Web/Security/Authentication/Passwords) · [MDN – One-time passwords](https://developer.mozilla.org/en-US/docs/Web/Security/Authentication/OTP) · [MDN – Passkeys](https://developer.mozilla.org/en-US/docs/Web/Security/Authentication/Passkeys) · [MDN – Federated identity](https://developer.mozilla.org/en-US/docs/Web/Security/Authentication/Federated_identity) · [OWASP – MFA Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)

---

## Layer 2 — Session carrier (what the browser sends after login)

This is where "access token", "refresh token", "opaque", "direct DB" live.

### Type A — Server-side session ("direct DB / store lookup")

```text
LOGIN
  Browser ──email+password──▶ Server
  Server  ──create row──────▶ Session store { sid:"9f3a", userId:42, role:"admin", expiresAt }
  Server  ──Set-Cookie: sid=9f3a (HttpOnly; Secure; SameSite)──▶ Browser

EVERY REQUEST
  Browser ──Cookie: sid=9f3a──▶ Server
  Server  ──lookup 9f3a──────▶ Session store
  Server  ◀─ { userId:42, role:"admin" }
  Server  sets req.user and continues
```

- The cookie value is a **random, meaningless ID** (≥128 bits of entropy).
- All truth is **on the server**: role, expiry, revoked flag.
- Store = **Redis** (fast, TTL built in) or MongoDB/Postgres table.

| Pros | Cons |
|---|---|
| Instant revocation (delete the row) | A store lookup on **every** request |
| Role changes apply immediately | Store must be shared across servers (Redis cluster) |
| Nothing sensitive in the client | Cookie auth ⇒ **CSRF** must be handled |
| Simple mental model | Harder for non-browser clients/mobile (works, but cookies are awkward) |

**Best for:** classic server-rendered apps, admin panels, anything needing "logout everywhere" instantly. Node: `express-session` + `connect-redis`.

### Type B — Opaque token (a "session ID" for APIs)

An **opaque token** is a random string with **no readable meaning** to the client.

```text
Authorization: Bearer 7Hk2...random...

Server → looks it up (DB/Redis) or asks the auth server: "token introspection"
```

Same idea as Type A, but carried in an `Authorization` header and used for APIs/mobile apps.

| Pros | Cons |
|---|---|
| Revocable instantly | Lookup per request (cache it) |
| Reveals nothing if intercepted-and-read | Resource servers need access to the store or an introspection endpoint |
| Can be very short random string | — |

**Best for:** high-security APIs, OAuth servers that must revoke instantly (OAuth defines *token introspection* for this).

### Type C — Stateless JWT (self-contained token)

```text
Authorization: Bearer eyJ...HEADER.PAYLOAD.SIGNATURE

Server → verifies signature with key → trusts the claims. NO lookup.
```

| Pros | Cons |
|---|---|
| No DB hit per request | **Cannot revoke** before expiry without extra state |
| Scales across many services easily | Claims go **stale** (role changed, still old in token) |
| Great for microservices (public-key verify) | Bigger than a session ID |
| | Token theft is dangerous for its whole lifetime |

**Best for:** APIs, microservices, short-lived access tokens.

### Type D — Access + Refresh tokens (the standard hybrid)

Fixes the weakness of Type C by splitting lifetime:

| Token | Job | Lifetime | Where (browser) | Stored on server? |
|---|---|---|---|---|
| **Access token** (JWT) | Call APIs | 5–15 min | JS memory | No |
| **Refresh token** (opaque, random) | Get new access tokens | 7–30 days | HttpOnly+Secure cookie | **Yes — hashed** |

```text
login ──▶ access (10 min) + refresh (7 days)
API call  ──▶ Authorization: Bearer <access>
access expired → 401
client    ──▶ POST /auth/refresh (cookie carries refresh)
server    ──▶ check DB, ROTATE refresh, issue new access
client    ──▶ retry original request
```

Why the refresh token is *opaque + stored hashed*:
- It must be **revocable** — so the server keeps state for it.
- If your DB leaks, hashed refresh tokens can't be replayed (same logic as passwords).

**Best for:** SPAs + APIs, mobile apps — the default modern answer.

### Quick decision table

| Situation | Pick |
|---|---|
| Server-rendered site, one backend | **Session cookie** |
| SPA + API, one team | **Access (JWT) + refresh (HttpOnly cookie)** |
| Many microservices | Short **JWT** verified with public key (JWKS) + refresh at auth service |
| Must revoke instantly, high-risk | **Opaque token** / session store, or JWT + tiny TTL + denylist |
| Mobile app | Access + refresh stored in **Keychain/Keystore** |
| Machine-to-machine | **API keys** / OAuth client-credentials / mTLS |
| Enterprise customers | **SSO** (SAML/OIDC) |
| Highest phishing resistance | **Passkeys** |

---

## "Direct DB" vs "Opaque" vs "JWT" — the one-minute comparison

```text
                SESSION COOKIE        OPAQUE TOKEN         JWT
Carries         random id             random string        signed claims
Lookup/request  YES (store)           YES (store/introspect) NO
Revoke now      ✅ easy               ✅ easy              ❌ hard
Scale           needs shared store    needs shared store   ✅ easiest
Readable        no                    no                   yes (not secret!)
CSRF risk       yes (cookie)          no (header)          no (header)
XSS risk        token not readable    readable if in JS    readable if in JS
```

Remember: **"stateless" removes the lookup, not the problems.** You still need key management, expiry, rotation, rate limits, monitoring.

---

## Layer 3 — Other credentials you will meet

### API keys
A long random string identifying an **application** (not a user). Sent in a header. Treat as a password: hash in DB, scope it, allow rotation, never put in frontend code.

### HTTP Basic
`Authorization: Basic base64(user:pass)` — username/password on **every** request. Only acceptable over TLS for internal/simple tools. Base64 is *encoding*, not encryption.

### OAuth 2.0 / OIDC tokens
- **Access token** — call a provider's API.
- **ID token** (OIDC) — proves who logged in. Do **not** use it as an API access token.
- **Refresh token** — renew access.

📖 [RFC 6749 – OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc6749) · [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html) · [OWASP – OAuth2 Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html)

### Proof-of-possession (advanced)
A normal bearer token = "whoever holds me wins". **DPoP** (RFC 9449) / **mTLS-bound tokens** add: "and you must prove you own a private key". A stolen token alone becomes useless.

📖 [RFC 9449 – DPoP](https://datatracker.ietf.org/doc/html/rfc9449) · [RFC 9700 – OAuth Security BCP](https://datatracker.ietf.org/doc/html/rfc9700)

---

## A good real-world combination

```text
Login:   Password  OR  Google (OIDC)  OR  Passkey
          ↓
Session: Access JWT (10 min, memory) + Refresh (HttpOnly cookie, rotated, hashed in DB)
          ↓
AuthZ:   RBAC + ownership checks on every route
          ↓
Risk:    New device → email alert; sensitive action → passkey/OTP re-check
```

---

## ✅ Self-check

1. Why is a refresh token stored hashed but an access token not stored at all?
2. Which type gives instant revocation, and what does it cost?
3. Why is "JWT = modern, sessions = old" a wrong statement?
4. Is an ID token the same as an access token?
5. Name two things "stateless" does **not** remove.

Answers → [06 Interview playbook](./06-interview-playbook.md).
