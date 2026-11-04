# 02 — Code & Flows (Express + MongoDB + React)

> The point of this file is **the flow**: which piece calls which, what data moves, why each arrow exists.
> Code is the proof, not the lesson.
> ← [README](../README.md) · ← [01 Types](./01-types-of-authentication.md) · → [03 System design](./03-system-design-auth.md)

---

## 0. The whole system in one picture

```text
 BROWSER (React)                                   SERVER (Express)                      DATA
 ───────────────                                   ────────────────                      ────
 LoginForm ──POST /auth/login──────────────────▶  rate limiter
                                                    ↓
                                                  validate (zod)
                                                    ↓
                                                  authController.login ─────────────▶  User (passwordHash)
                                                    ↓ bcrypt.compare
                                                  issueSession ─────────────────────▶  Session (refresh hash, family)
                                                    ↓
 memory: accessToken  ◀── JSON {accessToken} ───  Set-Cookie: refreshToken (HttpOnly)
 cookie: refreshToken ◀─────────────────────────

 api.get("/orders") ──Authorization: Bearer AT─▶  isLoggedIn  (jwt.verify → req.user)
                                                    ↓
                                                  allow("buyer")  (RBAC → 403)
                                                    ↓
                                                  orderController ──query with userId──▶  Order
 ◀──────────────────── 200 JSON ────────────────

 (AT expired) ◀──────── 401 ────────────────────
 interceptor ──POST /auth/refresh (cookie)─────▶  atomically consume old RT, ROTATE ───▶  Session
 ◀──────────── new AT + new RT cookie ──────────
 retry original request
```

Folder layout used below:

```text
server/
├── app.js
├── config/cookies.js
├── models/        User.js  Session.js  Order.js
├── utils/         tokens.js
├── middleware/    auth.js  rateLimit.js  sameOrigin.js  validate.js
├── controllers/   authController.js  orderController.js
└── routes/        authRoutes.js  orderRoutes.js

client/src/
├── api/           http.js
├── auth/          AuthContext.jsx  RequireRole.jsx
└── pages/         Login.jsx  Orders.jsx
```

---

## 1. Models — what we store, and why

```js
// models/User.js
const userSchema = new mongoose.Schema({
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, select: false },          // optional: Google-only users have none
  role:         { type: String, enum: ["buyer", "seller", "admin"], default: "buyer" },
  googleSub:    { type: String, index: true, sparse: true }
}, { timestamps: true });
```

`select: false` → the hash is **never loaded by accident** in other queries.

```js
// models/Session.js  — one row per refresh token (the server-side state)
const sessionSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  familyId:  { type: String, index: true },     // all rotations of one login share this
  tokenHash: { type: String, unique: true },    // SHA-256 of the refresh token (never the raw token)
  usedAt:    Date,                              // set when rotated → reuse detection
  revokedAt: Date,
  expiresAt: { type: Date, index: { expireAfterSeconds: 0 } },  // Mongo auto-deletes expired rows
  userAgent: String,
  ip:        String
}, { timestamps: true });
```

**Why these fields?**
- `familyId` → if one token in the chain is stolen and reused, we can kill the **whole chain**.
- `usedAt` → a token that was already used and appears again is *proof of replay*.
- `tokenHash` → if the DB leaks, attackers cannot use hashes as refresh tokens.
- `userAgent`, `ip` → powers a "Where you're logged in" page later.

---

## 2. Token utilities

```js
// utils/tokens.js
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role },          // minimal claims, no secrets, no PII
    process.env.ACCESS_SECRET,
    { algorithm: "HS256", expiresIn: "10m", issuer: "myapp", audience: "myapp-api" }
  );
}

// Refresh token = random opaque string, NOT a JWT. 384 bits of entropy.
const newRefreshToken = () => crypto.randomBytes(48).toString("base64url");

module.exports = { sha256, signAccessToken, newRefreshToken };
```

**Why refresh is random and not a JWT:** we always look it up in the DB anyway (to rotate/revoke), so putting claims inside adds nothing.

```js
// config/cookies.js
const isProd = process.env.NODE_ENV === "production";
exports.REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
exports.cookieOptions = {
  httpOnly: true,
  secure: isProd,                 // localhost over http needs false in dev
  sameSite: "strict",
  path: "/api/auth",              // refresh AND logout both live under /api/auth
  maxAge: exports.REFRESH_TTL_MS
};
```

---

## 3. REGISTER — flow

```text
POST /api/auth/register {email, password}
   │
   ▼  rate limit (per IP)
   ▼  validate: email format, password length ≥ 8 (and ≤ 128) — zod
   ▼  duplicate email?  ──yes──▶ 409 (or generic response + verification email)
   ▼  bcrypt.hash(password, 12)
   ▼  User.create({ email, passwordHash })
   ▼  (production: send verification email; don't trust unverified email)
   ▼  201
```

```js
// controllers/authController.js
const bcrypt = require("bcrypt");

exports.register = async (req, res) => {
  const { email, password } = req.body;                 // already validated by middleware
  if (await User.exists({ email })) {
    return res.status(409).json({ message: "Email already registered" });
  }
  const passwordHash = await bcrypt.hash(password, 12); // cost 12 ≈ 200–300 ms
  const user = await User.create({ email, passwordHash });
  res.status(201).json({ id: user.id, email: user.email });
};
```

> Never accept `role` from `req.body` on register. That is **mass assignment** — attackers send `{"role":"admin"}`.

---

## 4. LOGIN — flow

```text
POST /api/auth/login {email, password}
   ▼ rate limit (per IP **and** per email — stops credential stuffing)
   ▼ find user (+passwordHash)
   ▼ bcrypt.compare  (also run against a dummy hash if user missing → equal timing)
   ▼ fail → 401 "Invalid email or password"   (same message for both cases)
   ▼ success → create Session row (new familyId, hashed refresh token)
   ▼ Set-Cookie refreshToken (HttpOnly, Secure, SameSite=Strict, Path=/api/auth)
   ▼ JSON { accessToken, user }               (access token goes to JS memory)
```

```js
const { v4: uuid } = require("uuid");
const DUMMY_HASH = bcrypt.hashSync("dummy-password", 12);   // computed once at boot

async function issueSession(req, res, user, familyId) {
  const refreshToken = newRefreshToken();
  await Session.create({
    userId: user._id,
    familyId,
    tokenHash: sha256(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    userAgent: req.get("user-agent"),
    ip: req.ip
  });
  res.cookie("refreshToken", refreshToken, cookieOptions);
  return signAccessToken(user);
}

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select("+passwordHash");

  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.passwordHash || !ok) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  const accessToken = await issueSession(req, res, user, uuid());   // NEW family per login
  res.json({ accessToken, user: { id: user.id, email: user.email, role: user.role } });
};
```

---

## 5. AUTHENTICATION middleware — where `req.user` is born

```text
Every protected request:
  Authorization: Bearer <AT>
        │
        ▼
  isLoggedIn ── no/bad header ───────────▶ 401
        │       jwt.verify fails/expired ─▶ 401
        ▼
  req.user = { id, role }     ← the ONLY trusted source of identity
        ▼
  next()
```

```js
// middleware/auth.js
const jwt = require("jsonwebtoken");

exports.isLoggedIn = (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || "").split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Authentication required" });
  }
  try {
    const p = jwt.verify(token, process.env.ACCESS_SECRET, {
      algorithms: ["HS256"],              // PIN the algorithm (blocks alg:none / confusion)
      issuer: "myapp",
      audience: "myapp-api"
    });
    req.user = { id: p.sub, role: p.role };
    next();
  } catch (err) {
    const message = err.name === "TokenExpiredError" ? "Token expired" : "Invalid token";
    res.status(401).json({ message });
  }
};
```

**Why the controller must read `req.user.id`, not `req.body.userId`:** the body is attacker-controlled; `req.user` is derived from a verified signature.

---

## 6. AUTHORIZATION — RBAC and ownership

```text
isLoggedIn ──▶ allow("seller","admin") ──▶ controller (ownership check inside the DB query)
   401              403                          404 if not yours
```

```js
// RBAC: role gate
exports.allow = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ message: "Forbidden" });

// routes
router.post  ("/products",     isLoggedIn, allow("seller", "admin"), createProduct);
router.delete("/products/:id", isLoggedIn, allow("admin"),           deleteProduct);
router.get   ("/orders/:id",   isLoggedIn,                           getOrder);
```

```js
// Ownership: put the rule INSIDE the query so unauthorized data is never even loaded
exports.getOrder = async (req, res) => {
  const filter = { _id: req.params.id };
  if (req.user.role !== "admin") filter.userId = req.user.id;   // normal users: only their own

  const order = await Order.findOne(filter);
  if (!order) return res.status(404).json({ message: "Order not found" });  // 404, not 403 → no existence leak
  res.json(order);
};
```

This is how a protected route keeps data away from users who should not see it:

```text
Not logged in          → 401, controller never runs
Logged in, wrong role  → 403, controller never runs
Right role, not owner  → query returns nothing → 404, data never loaded
```

Also **shape the response** — return only the fields the caller may see (DTO), never the raw document.

---

## 7. REFRESH with rotation + reuse detection — the core flow

```text
POST /api/auth/refresh      (browser attaches HttpOnly cookie automatically)
   │
   ▼ cookie missing → 401
   ▼ hash = sha256(cookie)
   ▼ ATOMIC: findOneAndUpdate(
   │     { tokenHash, usedAt:null, revokedAt:null, expiresAt > now },
   │     { usedAt: now })                              ← only ONE concurrent caller can win
   │
   ├─ got a row ──▶ issue NEW refresh token in the SAME family + new access token ──▶ 200
   │
   └─ got null ───▶ look the hash up again:
                      • row exists AND usedAt set → REUSE! revoke whole family
                      • otherwise → just invalid/expired
                    clear cookie → 401
```

```js
exports.refresh = async (req, res) => {
  const raw = req.cookies.refreshToken;
  if (!raw) return res.status(401).json({ message: "No refresh token" });

  const now = new Date();
  const tokenHash = sha256(raw);

  // Atomic "consume": two parallel requests can't both succeed
  const session = await Session.findOneAndUpdate(
    { tokenHash, usedAt: null, revokedAt: null, expiresAt: { $gt: now } },
    { usedAt: now }
  );

  if (!session) {
    const old = await Session.findOne({ tokenHash });
    if (old?.usedAt) {
      // A consumed token came back → possible theft → kill the entire family
      await Session.updateMany({ familyId: old.familyId }, { revokedAt: now });
      // TODO: log a security event + notify the user
    }
    res.clearCookie("refreshToken", { ...cookieOptions, maxAge: undefined });
    return res.status(401).json({ message: "Session expired. Please log in again." });
  }

  const user = await User.findById(session.userId);
  if (!user) return res.status(401).json({ message: "Session expired" });

  const accessToken = await issueSession(req, res, user, session.familyId); // same family
  res.json({ accessToken });
};
```

**Why atomic?** A plain `find` then `update` has a gap — two requests could both read "unused" and both succeed, defeating rotation.

**Why same `familyId`?** So revoking one link kills the whole chain.

**CSRF note:** refresh is cookie-authenticated and changes state. `SameSite=Strict` already blocks cross-site sends; add an Origin check as defense-in-depth:

```js
// middleware/sameOrigin.js
module.exports = (req, res, next) => {
  const origin = req.get("origin");
  if (origin && origin !== process.env.CLIENT_ORIGIN) return res.sendStatus(403);
  next();
};
```

---

## 8. LOGOUT and LOGOUT-ALL

```js
exports.logout = async (req, res) => {
  const raw = req.cookies.refreshToken;
  if (raw) {
    const s = await Session.findOne({ tokenHash: sha256(raw) });
    if (s) await Session.updateMany({ familyId: s.familyId }, { revokedAt: new Date() });
  }
  res.clearCookie("refreshToken", { ...cookieOptions, maxAge: undefined });
  res.sendStatus(204);
};

// protected route: isLoggedIn → logoutAll
exports.logoutAll = async (req, res) => {
  await Session.updateMany({ userId: req.user.id, revokedAt: null }, { revokedAt: new Date() });
  // Also kill still-valid ACCESS tokens: store watermark, check it in isLoggedIn for sensitive routes
  // await redis.set(`validAfter:${req.user.id}`, Math.floor(Date.now() / 1000));
  res.sendStatus(204);
};
```

Access tokens already issued stay valid until `exp` (≤10 min) unless you check the watermark. That is the honest trade-off of JWT.

---

## 9. App wiring — CORS, rate limit, headers

```js
// app.js
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");

const app = express();
app.set("trust proxy", 1);                      // behind a load balancer → correct req.ip
app.use(helmet());                              // sane security headers
app.use(cors({ origin: process.env.CLIENT_ORIGIN, credentials: true }));  // never "*" with credentials
app.use(express.json({ limit: "10kb" }));       // small body limit
app.use(cookieParser());

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true });
app.use("/api/auth/login",    authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth",          require("./routes/authRoutes"));
app.use("/api",               require("./routes/orderRoutes"));
```

---

## 10. FRONTEND — axios with single-flight refresh

```text
request ─▶ attach Authorization from memory
   │
   ▼ 401?  ── not a retry yet ──▶ call refresh ONCE (shared promise)
   │                                   │
   │            all waiting requests ◀─┘ new access token
   ▼
 retry original request
```

```js
// client/src/api/http.js
import axios from "axios";

const baseURL = import.meta.env.VITE_API_URL;       // e.g. https://api.example.com/api
let accessToken = null;                              // memory only — NOT localStorage
export const setAccessToken = (t) => { accessToken = t; };

export const api = axios.create({ baseURL, withCredentials: true });

api.interceptors.request.use((cfg) => {
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  return cfg;
});

let refreshPromise = null;                           // single-flight lock
export function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${baseURL}/auth/refresh`, null, { withCredentials: true })
      .then((r) => { setAccessToken(r.data.accessToken); return r.data.accessToken; })
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const isAuthCall = original?.url?.startsWith("/auth/");
    if (error.response?.status === 401 && !original._retry && !isAuthCall) {
      original._retry = true;
      try {
        await refreshAccessToken();
        return api(original);                        // retry with new token
      } catch {
        setAccessToken(null);
        window.location.assign("/login");
      }
    }
    return Promise.reject(error);
  }
);
```

### Boot sequence (memory is empty after page reload!)

```jsx
// auth/AuthContext.jsx
useEffect(() => {
  refreshAccessToken()                       // cookie → new access token
    .then(() => api.get("/me"))              // who am I?
    .then((r) => setUser(r.data))
    .catch(() => setUser(null))
    .finally(() => setLoading(false));       // ← route guards MUST wait for this
}, []);
```

If guards run before `loading` finishes, you get the classic **redirect loop** (page loads → no token yet → redirect to login → ...).

### Route guard (UX only — backend is the real wall)

```jsx
export function RequireRole({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/403" replace />;
  return children;
}
```

---

## 11. Google OAuth — flow + code

```text
React: <a href="/api/auth/google">Continue with Google</a>
   ▼
GET /api/auth/google
   • generate random state → short-lived cookie (SameSite=Lax!)
   • 302 → accounts.google.com?client_id&redirect_uri&scope=openid email profile&state
   ▼ user signs in + consents at Google
GET /api/auth/google/callback?code=...&state=...
   • compare query.state with cookie state → mismatch = 400 (CSRF on the login flow)
   • Passport exchanges code → Google (server-to-server, uses client_secret)
   • strategy callback: find-or-create LOCAL user
   • issueSession(...)  → refresh cookie
   • 302 → CLIENT/auth/callback        (NO token in the URL)
   ▼
React /auth/callback → POST /auth/refresh → access token in memory → go to app
```

```js
const passport = require("passport");
const { Strategy: GoogleStrategy } = require("passport-google-oauth20");

passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,     // server only!
    callbackURL: "/api/auth/google/callback"
  },
  async (_at, _rt, profile, done) => {
    try {
      let user = await User.findOne({ googleSub: profile.id });          // 1) stable Google ID first
      if (!user) {
        const email = profile.emails?.[0]?.value?.toLowerCase();
        if (!email || !profile._json.email_verified) return done(null, false); // only trust VERIFIED email
        user = await User.findOne({ email });
        if (user) { user.googleSub = profile.id; await user.save(); }    // link existing account
        else user = await User.create({ email, googleSub: profile.id });
      }
      done(null, user);
    } catch (e) { done(e); }
  }
));
```

```js
// routes/authRoutes.js
router.get("/google", (req, res, next) => {
  const state = crypto.randomBytes(16).toString("hex");
  res.cookie("oauth_state", state, {
    httpOnly: true, secure: isProd,
    sameSite: "lax",                 // MUST be lax: Google redirects back via a cross-site navigation
    maxAge: 5 * 60 * 1000, path: "/api/auth/google"
  });
  passport.authenticate("google", { scope: ["openid", "email", "profile"], state, session: false })(req, res, next);
});

router.get("/google/callback",
  (req, res, next) => {
    if (!req.query.state || req.query.state !== req.cookies.oauth_state) {
      return res.status(400).send("Invalid state");
    }
    res.clearCookie("oauth_state", { path: "/api/auth/google" });
    next();
  },
  passport.authenticate("google", { session: false, failureRedirect: `${process.env.CLIENT_ORIGIN}/login?error=oauth` }),
  async (req, res) => {
    await issueSession(req, res, req.user, uuid());
    res.redirect(`${process.env.CLIENT_ORIGIN}/auth/callback`);
  }
);
```

**Account pre-hijacking:** if password sign-up doesn't verify email, an attacker can register `victim@gmail.com` first, then the real victim logs in with Google and the accounts get linked → attacker still knows the password. Fix: verify email on password sign-up and link only on verified emails.

---

## 12. In Next.js (your Slatex stack) — same ideas, different homes

```ts
// app/api/auth/login/route.ts
import { cookies } from "next/headers";
export async function POST(req: Request) {
  // validate → verify password → create session ...
  (await cookies()).set("refreshToken", token, {
    httpOnly: true, secure: true, sameSite: "strict", path: "/api/auth", maxAge: 604800
  });
  return Response.json({ ok: true });
}
```

```ts
// A server component / route handler must re-check auth itself:
const session = await getSession();          // verify cookie/JWT on the SERVER
if (!session) redirect("/login");
if (session.role !== "admin") notFound();
```

> **Real lesson:** in March 2025, **CVE-2025-29927** let attackers bypass Next.js *middleware* checks with a crafted header. Middleware auth is a **convenience layer**. Always verify auth again in the data-access layer (route handler / server component / DAL). Defense in depth.

---

## 13. Trace one request end-to-end (practice this aloud)

`GET /api/orders/65f…` from a logged-in buyer:

1. React `api.get("/orders/65f…")` → interceptor adds `Authorization: Bearer AT`.
2. TLS protects the bytes; reverse proxy forwards to Express.
3. `helmet`, `cors`, `json`, `cookieParser`, rate limiter run.
4. `isLoggedIn` → `jwt.verify` (algorithm pinned, `exp`, `iss`, `aud` checked) → `req.user`.
5. Route-level `allow(...)` (if any) → RBAC.
6. Controller builds filter `{ _id, userId: req.user.id }` → MongoDB.
7. Not found → `404`; found → DTO → `200`.
8. Logger writes `requestId, userId, route, status, latency` — **never** the token.
9. If AT expired at step 4 → `401` → interceptor refreshes once → retries → success.

---

## ✅ Self-check

1. Why is the refresh `findOneAndUpdate` atomic and why does that matter?
2. Why does `Path=/api/auth` (not `/api/auth/refresh`) make logout work?
3. Why is the OAuth `state` cookie `SameSite=Lax` while the refresh cookie is `Strict`?
4. Why return `404` instead of `403` in `getOrder`?
5. What breaks if route guards render before `loading` ends?

Answers → [06 Interview playbook](./06-interview-playbook.md).
