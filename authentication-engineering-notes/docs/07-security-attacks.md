# 07 — Authentication Security & Attacks

## 1. XSS

### Threat model

```text
attacker-controlled input
        ↓
unsafe HTML/DOM sink
        ↓
script executes on your origin
        ↓
attacker code receives first-party browser privileges
```

OWASP recommends contextual output encoding, safe sinks, sanitization where HTML is intentionally allowed, and defense-in-depth CSP. citeturn0search1

### Common sources

- unsafe HTML rendering
- user-generated content
- dangerous DOM APIs
- compromised dependencies
- third-party scripts
- malicious extensions

### Defense

```text
Prefer framework escaping
Avoid dangerous HTML sinks
Sanitize HTML when needed
CSP
Trusted Types where appropriate
Audit dependencies
Minimize third-party scripts
```

## 2. CSRF

CSRF abuses automatically attached credentials, usually cookies.

```text
victim logged in
      ↓
attacker page causes request
      ↓
browser attaches cookie
      ↓
server sees authenticated request
```

OWASP recommends framework-supported CSRF protection or CSRF tokens for state-changing cookie-authenticated requests. citeturn0search7

### Defense options

- SameSite cookies
- CSRF tokens
- origin/referer validation where appropriate
- avoid unnecessary cookie-authenticated cross-site endpoints
- use explicit authorization headers for APIs when architecture allows

## 3. Session fixation

Attacker tries to make a victim use a session identifier known to the attacker.

Defense:

```text
login
 ↓
rotate session identifier
```

## 4. Credential stuffing

Attackers reuse leaked username/password combinations.

Defense:

- rate limits
- breached-password detection
- MFA/passkeys
- anomaly detection
- generic errors
- account protection policies

## 5. Brute force

Defense:

```text
rate limit
backoff
MFA
IP/device/account signals
```

Do not only rate-limit by IP; attackers can distribute requests.

## 6. Token replay

A stolen bearer token can be replayed from another machine.

Mitigations:

- short access TTL
- refresh rotation
- sender-constrained tokens
- audience restriction
- session/device monitoring
- revocation

RFC 9700 recommends limiting token privilege and considering sender-constrained access tokens for stronger replay protection. citeturn1search1

## 7. Token leakage through logs

Bad:

```js
console.log(req.headers.authorization);
```

Good:

```text
central logger
→ redact Authorization
→ redact cookies
→ redact OAuth codes/tokens
```

## 8. Token leakage through URL

Never:

```text
/login?token=...
```

Prefer headers or secure cookies according to the architecture.

## 9. Refresh-token reuse

```text
RT2 consumed
   ↓
RT2 appears again
   ↓
possible theft/replay
   ↓
revoke family
```

The server cannot always identify which holder is legitimate, so fail-closed behavior is often appropriate. fileciteturn1file6L486-L528

## 10. XSS + HttpOnly loophole

HttpOnly blocks direct cookie reads.

It does not stop a compromised page from making authenticated requests using the victim's live browser session.

Therefore:

```text
HttpOnly ≠ XSS immunity
```

## 11. Resident XSS

The most dangerous version is persistent live-tab compromise:

```text
XSS
 ↓
refresh whenever needed
 ↓
keep obtaining valid access tokens
 ↓
act as user
```

Mitigate impact with:

- CSP
- absolute session lifetime
- refresh rate limits
- anomaly detection
- WebAuthn step-up
- minimal API responses

## 12. WebAuthn

A compromised page can fake a password prompt.

It cannot simply extract a WebAuthn private key or forge a valid origin-bound assertion.

Use it for high-risk actions.

## 13. Supply-chain attacks

```text
npm dependency compromised
        ↓
malicious JS ships with your app
        ↓
executes as first-party code
```

Defense:

- lockfiles
- dependency review
- update discipline
- audit tools
- SRI for external resources where applicable
- minimize third-party scripts

## 14. Security priority order

```text
1. Prevent XSS
2. Protect credentials
3. Shorten credential lifetime
4. Detect replay
5. Revoke sessions
6. Protect sensitive actions with step-up auth
7. Monitor anomalies
```
