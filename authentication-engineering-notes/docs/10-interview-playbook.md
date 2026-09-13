# 10 — Interview Playbook

## How to answer authentication questions

Use this structure:

```text
1. Problem
2. Design
3. Flow
4. Security reason
5. Trade-off
6. Failure case
7. Scaling
```

Do not start with code.

---

## Q1. What is authentication?

**Strong answer:**

Authentication is establishing the identity associated with a request. In a web application, the user proves identity during login, and subsequent requests carry a credential such as a session cookie or access token that the backend verifies.

**Follow-up:** Why?

Because HTTP is stateless.

---

## Q2. Authentication vs authorization?

**Answer:**

Authentication asks who the caller is. Authorization asks what that authenticated caller is allowed to do.

```text
401 → authentication problem
403 → authorization problem
```

---

## Q3. Why not trust `userId` from request body?

Because the client controls the body. A malicious client can replace it with another user's ID. The backend should derive identity from a verified credential and use `req.user.id`.

---

## Q4. Explain JWT.

JWT is a compact claims representation. A common signed JWT contains a header, payload and signature. The payload is encoded, not secret. The signature protects integrity/authenticity when the server verifies it.

---

## Q5. Can a user modify a JWT?

They can modify the bytes, but if the payload changes and the signature is not recomputed with the signing key, verification fails.

---

## Q6. `jwt.decode()` vs `jwt.verify()`?

`decode()` reads the token contents. `verify()` validates the token's cryptographic integrity and registered claims such as expiry according to the library/configuration.

Never authenticate based only on `decode()`.

---

## Q7. Why put role in JWT?

It can avoid a DB lookup on every request and makes authorization fast. The trade-off is stale authorization state until token renewal or a separate revocation/version mechanism.

---

## Q8. Why not store the access token for 7 days?

Because a stolen bearer credential could remain usable for 7 days. Short access TTL reduces the replay window.

---

## Q9. Why access + refresh?

The access token is short-lived and used for normal APIs. The refresh token is longer-lived and used only to obtain a new access token. This lets us keep access credentials short-lived without forcing frequent user login.

---

## Q10. Why refresh rotation?

A static refresh token can be replayed for its whole lifetime if stolen. Rotation makes refresh tokens single-use and lets the server detect reuse of a consumed token, potentially revoking the token family.

---

## Q11. What if two refresh calls happen simultaneously?

The client should make refresh single-flight: all requests await the same in-progress refresh promise. Otherwise one refresh can consume the refresh token and sibling refreshes can look like token theft.

---

## Q12. localStorage vs HttpOnly cookie?

`localStorage` is accessible to JavaScript, so XSS can directly read a stored token. An HttpOnly cookie is not readable through normal JavaScript APIs, but the browser automatically attaches it, so CSRF must be considered.

---

## Q13. Does HttpOnly stop XSS?

No. It prevents direct JavaScript access to the cookie. A compromised page may still perform authenticated actions using the browser's session. HttpOnly reduces credential exfiltration/persistence; it does not remove XSS.

---

## Q14. XSS vs CSRF?

XSS executes attacker-controlled JavaScript in your origin. CSRF tricks a victim's browser into making an authenticated request using automatically attached credentials.

Memory phrase:

> XSS gets inside the page. CSRF gets the browser to send the credential for it.

---

## Q15. How do you prevent XSS?

Use framework escaping, avoid unsafe HTML sinks, sanitize intentional HTML, CSP, Trusted Types where appropriate, dependency hygiene and minimal third-party scripts.

---

## Q16. How do you prevent CSRF?

For cookie-authenticated state-changing requests, use SameSite appropriately and/or CSRF tokens, plus origin/referer checks where appropriate. Do not confuse CORS with CSRF protection.

---

## Q17. What is OAuth?

OAuth 2.0 is an authorization framework for delegated access. It lets an application obtain limited access without asking the user to give the application their provider password.

---

## Q18. OAuth vs OIDC?

OAuth is authorization. OIDC builds authentication/identity on top of OAuth.

---

## Q19. Explain Google login.

```text
user clicks Google login
 ↓
backend redirects to Google
 ↓
user authenticates + consents
 ↓
Google redirects with authorization code
 ↓
backend exchanges code with Google
 ↓
backend gets provider identity
 ↓
find/create local user
 ↓
create application session
 ↓
redirect user into app
```

---

## Q20. Why authorization code instead of directly receiving an access token?

The authorization code is short-lived and exchanged through the server-side token flow, reducing exposure of the provider access token in the browser redirect flow.

---

## Q21. Client ID vs client secret?

Client ID identifies the application. Client secret is confidential client credential and belongs on the server.

---

## Q22. What is scope?

Scope defines the permissions being requested from the provider.

---

## Q23. Why `session: false` in Passport?

It tells Passport not to create/manage its own login session for that authentication flow. The application can establish its own JWT/session after Passport verifies the provider identity.

---

## Q24. Stateful session vs JWT?

Stateful sessions store server-side session state and make revocation easy. JWTs can be verified without central session lookup and can scale well across stateless APIs, but revocation and stale claims are harder.

---

## Q25. What happens if admin demotes a seller?

If the role is only in a long-lived JWT, the old token can still carry the old role until expiry. Solutions include short TTLs, current-role lookup, session versioning or revocation mechanisms.

---

## Q26. What happens if refresh token is stolen?

Protect it with HttpOnly/Secure cookies, short/appropriate lifetime, server-side hashing, rotation and reuse detection. A replay of an already-consumed token can trigger family revocation.

---

## Q27. What if the DB leaks?

If refresh tokens are stored as hashes rather than raw values, the database dump does not directly contain usable refresh credentials. Passwords should also be stored as password hashes, never plaintext.

---

## Q28. Why generic login errors?

To reduce account enumeration.

---

## Q29. What do you store in a JWT?

Minimum required claims, commonly subject/user ID, role/permissions when appropriate, issuer/audience and timestamps. Never store passwords, OTPs, secrets or unnecessary sensitive PII.

---

## Q30. How does JWT verification work internally?

Conceptually:

```text
receive token
 ↓
parse header/payload/signature
 ↓
select expected verification algorithm/key
 ↓
recompute/verify signature over header.payload
 ↓
verify registered claims / expiry / issuer / audience as configured
 ↓
accept or reject
```

Do not claim that `jwt.verify()` “decrypts the JWT” for a normal signed JWT.

---

## Q31. How would you debug login redirect loops?

Trace state transitions and network calls:

```text
login
→ cookie?
→ /me or /refresh?
→ response status?
→ auth state update?
→ route guard?
→ redirect?
```

Use browser Network tab and backend request IDs. Do not guess.

---

## Q32. Why does a refresh cookie disappear locally?

Check:

```text
Secure on HTTP localhost?
SameSite?
Domain?
Path?
CORS?
credentials: include?
Set-Cookie actually received?
```

---

## Q33. Why did five refresh requests fire?

Likely multiple 401 handlers each called `/refresh`. Use a shared in-flight promise / queue.

---

## Q34. What is the biggest authentication mistake?

Trusting client-controlled state as security truth.

Examples:

```text
isAdmin === true
role in localStorage
userId from request body
frontend-only route guard
paymentSuccess from frontend
```

The backend must verify authoritative evidence.

---

## Q35. How does auth scale?

Start with the request path, then identify shared state:

```text
JWT verification → local
session → shared store
rate limit → Redis/distributed
user data → DB
logs → centralized pipeline
```

Then measure bottlenecks instead of assuming JWT or sessions are automatically fast/slow.

---

# Whiteboard challenge

Draw this from memory:

```text
                ┌───────────────┐
                │    Browser    │
                └───────┬───────┘
                        │
                 login credentials
                        │
                        ▼
                ┌───────────────┐
                │  Auth Server  │
                └───────┬───────┘
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
       access token        refresh session
       short-lived         HttpOnly cookie
              │                   │
              ▼                   ▼
        Authorization        /refresh
              │                   │
              └─────────┬─────────┘
                        ▼
                   new access
```

Then add:

```text
RBAC
XSS
CSRF
rotation
revocation
multi-device sessions
Google OAuth
```

If you can do this while answering “why” at every arrow, you understand the system.
