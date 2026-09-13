# 01 — Authentication Foundations

## 1. Authentication is an identity problem

HTTP does not remember who sent the previous request. The server needs a proof attached to later requests.

```text
Request → Who sent this? → prove identity → continue
```

Never use `req.body.userId` as the source of authenticated identity. The client controls it.

## 2. Validation vs Authentication vs Authorization

```text
Validation      → Is the input valid?        → 400
Authentication → Who are you?               → 401
Authorization  → Are you allowed?            → 403
Business logic  → Perform operation
```

### Interview answer

> Validation checks whether input is structurally/business-valid. Authentication establishes identity. Authorization checks whether that authenticated identity has permission to perform the requested action.

## 3. Identity sources

A user may prove identity through:

- password
- OAuth/OIDC provider
- magic link
- OTP
- WebAuthn/passkey
- enterprise SSO
- existing session
- client certificate in machine-to-machine systems

These are **identity mechanisms**. The application still needs a session/credential lifecycle after successful login.

## 4. Authentication mechanisms vs session mechanisms

This distinction removes a lot of interview confusion.

```text
HOW did the user prove identity?
    password / Google / passkey / SSO

HOW do later requests remain authenticated?
    session cookie / JWT / access+refresh / gateway session
```

Google login does not automatically mean your entire app must use Google's access token for every API request. Usually your backend maps the Google identity to a local user and establishes your application's own session.

## 5. 401 vs 403

```text
401 → I don't have a valid authenticated identity.
403 → I know who you are, but you cannot do this.
```

Examples:

```text
GET /api/orders without credential → 401
DELETE /api/products as buyer     → 403
```

## 6. Trust boundary

The browser is an **untrusted client**.

Anything the browser controls can be modified:

- request body
- headers
- localStorage
- React state
- route
- button visibility
- network requests

The backend must independently verify security-sensitive claims.

## 7. Core rule

> **Never ask the client whether the client is authorized. Ask the server's trusted security context.**

## 8. Request pipeline

```text
HTTP request
   ↓
Rate limit / abuse controls
   ↓
Parse + validate
   ↓
Authenticate
   ↓
Authorize
   ↓
Ownership / tenant check
   ↓
Controller
   ↓
Database
```

## 9. Ownership is authorization too

RBAC:

```text
admin → can delete products
```

Ownership:

```text
user A → can read order 123 only if order.userId = A
```

A mature authorization layer often combines:

```text
identity + role + permission + resource ownership + tenant boundary
```

## 10. Interview traps

### “Why not put userId in request body?”

Because the client can change it.

### “Why is frontend route protection enough?”

It is not. Users can call the API directly.

### “Does authentication mean the user can access everything?”

No. Authentication establishes identity; authorization establishes permissions.

### “Is 401 forbidden?”

No. `403` is the normal response when identity is known but permission is insufficient.

## 11. Mental model

```text
Validation = Can I understand this request?
Authentication = Who is making it?
Authorization = What may they do?
Controller = What does the application do?
```
