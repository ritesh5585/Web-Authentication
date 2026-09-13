# 03 — JWT + RBAC

## 1. JWT structure

```text
xxxxx.yyyyy.zzzzz
  │      │      │
header payload signature
```

JWT claims are readable when the token is a normal signed JWT. Do not store secrets or sensitive PII in the payload.

## 2. Example

```json
{
  "sub": "user_123",
  "role": "admin",
  "iat": 1760000000,
  "exp": 1760000900
}
```

Common claims:

- `sub` — subject/user identity
- `iat` — issued at
- `exp` — expiration
- `iss` — issuer
- `aud` — audience
- `nbf` — not before

## 3. Signing vs encryption

Signing provides integrity/authenticity of the claims.

```text
header + payload
      ↓
secret/private key
      ↓
signature
```

Encryption is a separate concern.

## 4. Why changing role fails

```text
Valid token:
role=buyer + signature S

Attacker changes:
role=admin

Server verifies:
header + changed payload → signature S2
S2 != S

Reject
```

## 5. HS256 vs asymmetric signing

### HMAC / HS256

Same secret signs and verifies.

```text
API A ── shared secret ── API B
```

Easy, but every verifier that knows the secret can also mint tokens.

### RSA/ECDSA/EdDSA style asymmetric signing

```text
private key → sign
public key  → verify
```

This is attractive when many resource servers need verification but should not have minting authority.

## 6. Middleware

```js
function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
```

Use `verify`, not `decode`, for authentication.

## 7. RBAC middleware

```js
function allow(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    next();
  };
}
```

Usage:

```js
router.delete(
  "/products/:id",
  authenticate,
  allow("admin"),
  deleteProduct
);
```

## 8. Frontend route guard

A frontend guard is useful for UX:

```text
buyer → /seller-dashboard → redirect
```

But the API must independently check:

```text
DELETE /products/:id
  ↓
authenticate
  ↓
authorize
```

## 9. JWT role trade-off

Putting role in the token avoids a DB lookup but makes role state stale until the token is renewed/revoked.

If immediate role changes matter:

- short access TTL
- server-side permission lookup
- authorization version claim
- session version
- revocation watermark
- centralized authorization service

## 10. Audience and issuer

In multi-service systems, verify more than signature/expiry:

```text
iss → who issued this?
aud → who is this token meant for?
sub → which principal?
exp → when does it expire?
```

This prevents accepting a valid token minted for another service/context.

## 11. Interview trap

**Q:** “Can the user decode the JWT?”

**A:** Yes.

**Q:** “Can the user safely modify the JWT?”

**A:** They can modify the bytes, but a properly verified signed JWT will fail integrity verification.

**Q:** “Is JWT encrypted?”

**A:** Not necessarily. Normal JWS-signed JWTs are not confidential.
