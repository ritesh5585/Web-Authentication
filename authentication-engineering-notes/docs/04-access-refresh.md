# 04 — Access + Refresh Tokens

## 1. The problem

A single long-lived bearer token has two difficult browser storage options:

```text
localStorage
→ JS can read it
→ XSS can steal it

Cookie
→ browser sends automatically
→ CSRF becomes a concern
```

The two-token pattern splits the jobs.

## 2. Access token

```text
Purpose: normal API authorization
Lifetime: short
Storage: memory for browser SPA
Transport: Authorization header
```

Example:

```http
Authorization: Bearer <access-token>
```

Because your code manually sets the header, another origin cannot simply cause the browser to attach your bearer token to a request.

## 3. Refresh token

```text
Purpose: obtain new access token
Lifetime: longer
Storage: HttpOnly cookie
Transport: browser-managed cookie
```

The refresh endpoint is therefore a special security boundary.

## 4. Login

```text
POST /auth/login
       ↓
verify password
       ↓
accessToken = short-lived
refreshToken = long-lived
       ↓
response body → access token
Set-Cookie    → refresh token
```

## 5. Normal request

```text
GET /api/orders
Authorization: Bearer <access>
```

## 6. Expired request

```text
GET /api/orders
        ↓
401
        ↓
POST /auth/refresh
(cookie automatically attached)
        ↓
new access token
        ↓
retry GET /api/orders
```

## 7. Why the refresh token must be protected harder

It is long-lived and can mint fresh access credentials.

A leaked access token may expire soon.

A leaked refresh token may give the attacker a durable path to new access tokens.

RFC 9700 explicitly describes refresh tokens as attractive targets because successful replay can allow attackers to mint new access tokens. citeturn1search1

## 8. Rotation

```text
RT1 active
 ↓ refresh
RT1 consumed → RT2 active
 ↓ refresh
RT2 consumed → RT3 active
```

If RT2 is reused after consumption:

```text
reuse detected
     ↓
revoke family
     ↓
force re-authentication
```

## 9. Store hash, not raw refresh token

Database:

```text
hash(refreshToken)
```

Cookie:

```text
raw refreshToken
```

If the DB leaks, the attacker should not immediately receive usable refresh credentials.

## 10. Token family

A login session can have:

```text
familyId = F123

RT1 → consumed
RT2 → consumed
RT3 → active
```

This lets the server revoke the whole lineage when reuse is detected.

## 11. Race condition

Bad:

```text
8 API calls → 8 × 401 → 8 refresh calls
```

Good:

```js
let refreshPromise = null;

async function refreshOnce() {
  refreshPromise ??= api.post("/auth/refresh")
    .then(({ data }) => {
      setAccessToken(data.accessToken);
      return data.accessToken;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}
```

All callers await the same promise.

## 12. Reload bootstrap

Memory is empty after a full reload.

```js
async function bootstrapAuth() {
  try {
    const { data } = await api.post("/auth/refresh");
    setAccessToken(data.accessToken);
  } catch {
    setAccessToken(null);
  } finally {
    setAuthReady(true);
  }
}
```

Do not render protected UI before the initial auth state is known, otherwise you can get redirect/content flashes.

## 13. Absolute session lifetime

A sliding refresh session can otherwise remain alive indefinitely.

For high-risk applications:

```text
initial login
     ↓
absolute deadline
     ↓
forced re-authentication
```

The supplied notes recommend an absolute session ceiling for the “resident script in an open tab” problem. fileciteturn1file8L529-L686

## 14. Revocation watermark

A lightweight pattern:

```text
user.validAfter = timestamp
```

Token contains:

```text
iat
```

Reject if:

```text
token.iat < user.validAfter
```

This can support “logout everywhere” without storing every access token in a blacklist.

## 15. Access + refresh interview answer

> I use a short-lived access token for normal API calls and a longer-lived refresh token in an HttpOnly cookie. The access token limits replay lifetime, while the refresh token is protected from JavaScript and rotated so replay of a consumed token can be detected. Because refresh rotation can race, the client uses a single-flight refresh promise.

## 16. What this design does NOT solve

```text
XSS inside live page → still dangerous
malicious extension → outside app boundary
infected device → outside app boundary
stolen access token → bounded by TTL, not impossible
```

This is defense-in-depth, not invulnerability.
