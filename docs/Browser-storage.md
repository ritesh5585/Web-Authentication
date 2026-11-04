# 06 — Browser Storage & Credential Placement

## 1. The decision framework

Never ask:

> “Which storage is best?”

Ask:

> “Which attacker can reach this credential from this storage?”

## 2. localStorage

```js
localStorage.setItem("accessToken", token);
```

Advantages:

- simple
- survives reload/browser restart
- easy for JavaScript clients

Problem:

```text
XSS
 ↓
JavaScript execution on your origin
 ↓
localStorage readable
```

## 3. sessionStorage

Similar JavaScript accessibility, but generally scoped to the tab/session lifecycle.

It does not solve XSS.

## 4. HttpOnly cookie

```http
Set-Cookie: refresh=...; HttpOnly; Secure; SameSite=Strict
```

JavaScript cannot read the cookie through normal cookie APIs.

But the browser still attaches it when cookie rules match. MDN explicitly documents this behavior. citeturn0search0

## 5. SameSite

### Strict

Strong cross-site restriction.

### Lax

More compatible with common top-level navigation behavior.

### None

Allows cross-site sending and requires `Secure`.

Use the narrowest behavior compatible with your architecture.

## 6. Secure

Only send cookie over HTTPS, except browser-specific localhost behavior.

Do not use `Secure` as a replacement for HTTPS.

## 7. Path

A refresh cookie can be scoped:

```text
Path=/api/auth/refresh
```

This reduces the requests that receive the cookie.

But `Path` is not an authorization mechanism.

## 8. Domain

Avoid broad cookie domains unless necessary.

A broad domain can increase exposure across subdomains.

## 9. Cookie prefixes

For host-bound cookies, modern browsers support prefixes such as:

```text
__Host-
__Secure-
```

MDN documents their restrictions and recommends restrictive cookie configuration. citeturn0search3turn0search4

## 10. SPA + API topology matters

If:

```text
app.example.com
api.example.com
```

are same-site but different origins, you still need correct CORS and credential configuration.

If:

```text
app.example.com
api.other-company.com
```

then cross-site cookie behavior becomes much more restrictive and often requires `SameSite=None; Secure` plus explicit CSRF protection.

## 11. CORS is not CSRF protection

CORS answers roughly:

> “Which browser origins may read certain cross-origin responses?”

CSRF asks:

> “Can another site cause the browser to send an authenticated state-changing request?”

Do not say:

> “CORS prevents CSRF.”

It does not.

## 12. Recommended browser pattern

For a typical React SPA using a backend API:

```text
access token → JS memory
refresh token → HttpOnly Secure cookie
```

Then:

```text
normal API
→ Authorization header

refresh endpoint
→ cookie
→ CSRF/SameSite protections
```

## 13. Why not put both tokens in localStorage?

Because the refresh token is the long-lived credential. XSS would turn it into a durable account-takeover credential.

## 14. Why not put both tokens in cookies?

Possible, but then all cookie-authenticated state-changing endpoints must be designed around CSRF protection. You can do this securely; it is not inherently wrong. The two-token memory + HttpOnly-cookie architecture is one practical SPA pattern, not a universal law.

## 15. Interview answer

> I choose storage based on the credential's lifetime and how the browser sends it. For a SPA, I prefer a short-lived access token in memory so it is manually attached and not automatically sent cross-site. I keep the longer-lived refresh token in an HttpOnly Secure cookie and protect the refresh endpoint with appropriate SameSite/CSRF controls. The goal is to reduce both XSS token exfiltration and CSRF exposure.
