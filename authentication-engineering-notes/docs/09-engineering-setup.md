# 09 — Engineering Setup Blueprint

This is a reference architecture for a MERN authentication module.

## 1. Packages

### Core

```bash
npm install express mongoose dotenv cookie-parser jsonwebtoken
```

### Passwords

```bash
npm install bcrypt
```

or evaluate Argon2id for a new production system.

### Google Passport implementation

```bash
npm install passport passport-google-oauth20
```

### Development logging

```bash
npm install morgan
```

### Optional

```bash
npm install express-rate-limit
npm install helmet
```

Use current versions and review package security before production.

## 2. Folder structure

```text
src/
├── config/
│   ├── env.js
│   └── db.js
│
├── modules/
│   └── auth/
│       ├── auth.controller.js
│       ├── auth.routes.js
│       ├── auth.service.js
│       ├── auth.validation.js
│       ├── auth.middleware.js
│       ├── rbac.middleware.js
│       ├── oauth/
│       │   └── google.strategy.js
│       └── token/
│           ├── access-token.js
│           └── refresh-token.js
│
├── models/
│   ├── user.model.js
│   ├── session.model.js
│   └── security-event.model.js
│
├── middlewares/
│   ├── error.middleware.js
│   └── rate-limit.middleware.js
│
├── utils/
│   ├── cookies.js
│   └── crypto.js
│
└── app.js
```

## 3. Environment

```env
NODE_ENV=development
PORT=3000
MONGO_URI=...
JWT_ACCESS_SECRET=...
JWT_REFRESH_PEPPER=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
```

Never commit `.env`.

## 4. Access-token signing

```js
function signAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user._id),
      role: user.role
    },
    process.env.JWT_ACCESS_SECRET,
    {
      expiresIn: "10m",
      issuer: "your-api",
      audience: "your-web-app"
    }
  );
}
```

Verify issuer/audience when you configure them.

## 5. Cookie helper

```js
export function setRefreshCookie(res, token) {
  res.cookie("__Host-refresh", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth/refresh",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}
```

If using `__Host-`, remember its stricter browser requirements; MDN documents that it requires `Secure`, no `Domain`, and `Path=/`. citeturn0search0

If you need a narrower path than `/`, use a normal cookie name or `__Secure-` rather than incorrectly applying `__Host-`.

## 6. Auth middleware

```js
export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_ACCESS_SECRET, {
      issuer: "your-api",
      audience: "your-web-app"
    });

    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
```

## 7. RBAC middleware

```js
export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    next();
  };
}
```

## 8. Refresh token design

```text
random opaque token
        ↓
hash token
        ↓
store hash + family/session metadata
        ↓
raw token → HttpOnly cookie
```

Do not use a predictable refresh token such as:

```text
userId + timestamp
```

Use cryptographically secure random values.

## 9. Refresh route

Conceptual steps:

```text
read cookie
 ↓
hash presented token
 ↓
find session/token record
 ↓
check expiry/revocation/usedAt
 ↓
if reuse → revoke family
 ↓
consume old token
 ↓
issue next token
 ↓
issue new access token
 ↓
Set-Cookie new refresh token
```

## 10. Client Axios architecture

```text
request interceptor
  ↓
read access token from memory
  ↓
Authorization header

response interceptor
  ↓
401?
  ↓
refresh single-flight
  ↓
retry once
```

Guard against infinite loops with a `_retried` marker or equivalent.

## 11. Google integration

Keep provider integration isolated:

```text
oauth/google.strategy.js
```

The rest of the app should receive:

```text
provider identity
 ↓
local user
 ↓
local session
```

This keeps your domain authentication independent of Google.
