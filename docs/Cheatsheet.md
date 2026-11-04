# 12 — Final Authentication Cheat Sheet

## Definitions

```text
Authentication = Who are you?
Authorization  = Are you allowed?
Validation     = Is this input valid?
Session        = How is login state maintained?
JWT            = Signed claims representation, not automatically encryption
OAuth          = Delegated authorization framework
OIDC           = Authentication/identity layer on OAuth 2.0
RBAC           = Authorization by role
CSRF           = Abuse of automatically attached credentials
XSS            = Attacker code executes in your origin
```

## Status codes

```text
400 → invalid request/input
401 → unauthenticated/invalid credential
403 → authenticated but forbidden
409 → resource conflict, e.g. duplicate email
```

## JWT

```text
header.payload.signature
```

Remember:

```text
decode ≠ verify
Base64URL ≠ encryption
signed ≠ secret
```

## Passwords

```text
plain password
      ↓
password hashing algorithm
      ↓
hash in DB
```

Never:

```text
plain password in DB
password in JWT
password in logs
```

## Access + refresh

```text
access → short → memory → Authorization header
refresh → longer → HttpOnly cookie → /refresh only
```

## Rotation

```text
RT1 → RT2 → RT3
```

Consumed token reused:

```text
possible theft → revoke family
```

## Cookies

```text
HttpOnly → JS cannot read
Secure   → HTTPS
SameSite → cross-site sending policy
Path     → request path scope
Max-Age  → lifetime
```

## XSS

```text
prevent execution
+ safe rendering
+ sanitization where required
+ CSP
+ dependency hygiene
```

## CSRF

```text
SameSite
+ CSRF token where needed
+ correct origin/cookie architecture
```

## Google

```text
your app
 ↓
Google authorize
 ↓
authorization code
 ↓
backend token exchange
 ↓
provider identity
 ↓
local user
 ↓
your session
```

## RBAC

```text
authenticate
 ↓
authorize role
 ↓
ownership/tenant check
 ↓
controller
```

## Browser storage

```text
localStorage → easy but XSS-readable
HttpOnly     → JS cannot read but cookie is auto-sent
memory       → short-lived and disappears on reload
```

## Interview sentence

> “I don't treat the browser as trusted. The frontend can improve UX, but the backend owns identity, authorization, session lifecycle and security-sensitive decisions.”

## 10-question mental model

```text
What proves identity?
Where is it stored?
How is it verified?
How long does it live?
Can it be stolen?
Can it be replayed?
How is it revoked?
What permissions does it carry?
How does it scale?
How do I debug failure?
```

If you can answer all ten, you understand the system.
