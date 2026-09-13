# 11 — Visual Authentication Flows

## 1. Normal password login

```mermaid
sequenceDiagram
    participant U as User
    participant B as Browser
    participant A as API
    participant DB as DB

    U->>B: enter email + password
    B->>A: POST /auth/login
    A->>A: validate
    A->>DB: find user
    A->>A: verify password hash
    A->>A: issue credentials
    A-->>B: access + refresh cookie
    B-->>U: logged in
```

## 2. Protected request

```mermaid
sequenceDiagram
    participant B as Browser
    participant A as API
    participant C as Controller

    B->>A: GET /api/profile + Bearer token
    A->>A: verify token
    A->>A: req.user = payload
    A->>A: authorization check
    A->>C: next()
    C-->>B: profile
```

## 3. RBAC

```text
DELETE /products/1
       ↓
verify credential
       ↓
req.user.role
       ↓
role == admin ?
   ├─ no → 403
   └─ yes → controller
```

## 4. Access expiry

```mermaid
sequenceDiagram
    participant B as Browser
    participant A as API

    B->>A: API + expired access
    A-->>B: 401
    B->>A: POST /auth/refresh + cookie
    A-->>B: new access + rotated cookie
    B->>A: retry original API
    A-->>B: 200
```

## 5. Refresh reuse detection

```text
RT1 active
   ↓
refresh
   ↓
RT1 consumed → RT2 active

attacker replays RT1
   ↓
server sees consumed token
   ↓
reuse detected
   ↓
revoke family
```

## 6. Google login

```text
React
 ↓
GET /auth/google
 ↓
Backend
 ↓ 302
Google
 ↓ login + consent
Google
 ↓ 302 code
Backend callback
 ↓ code exchange
Google
 ↓ identity/tokens
Backend
 ↓ find/create local user
Backend
 ↓ app session
React
```

## 7. XSS

```text
unsafe input
 ↓
script execution on origin
 ↓
JS privileges
 ↓
read JS-accessible credential / call API
```

## 8. CSRF

```text
victim logged in
       ↓
attacker website
       ↓
forged request
       ↓
browser auto-attaches cookie
       ↓
server sees authenticated request
```

## 9. Multi-device sessions

```text
                    User
                     │
       ┌─────────────┼─────────────┐
       ▼             ▼             ▼
   iPhone         MacBook        Android
   Session A      Session B      Session C
       │             │             │
       └─────────────┼─────────────┘
                     ▼
                 Session DB
```

## 10. Complete production flow

```mermaid
flowchart TD
    Login[Login / Google / Passkey] --> Identity[Identity verified]
    Identity --> LocalUser[Find/Create local user]
    LocalUser --> Session[Create session family]
    Session --> Tokens[Issue short access + refresh]
    Tokens --> API[Protected API calls]
    API --> Verify[Verify credential]
    Verify --> Authz[Role / permission / ownership]
    Authz --> Controller[Business logic]
    Controller --> Data[(DB)]
    API --> Expired{Access expired?}
    Expired -->|yes| Refresh[/auth/refresh/]
    Refresh --> Rotate[Rotate refresh token]
    Rotate --> Tokens
    Rotate --> Reuse{Reuse detected?}
    Reuse -->|yes| Revoke[Revoke family]
```

## 11. Request ownership map

```text
Browser owns:
- UI state
- access token in memory
- refresh cookie storage is browser-managed

Backend owns:
- identity decision
- authorization decision
- token signing keys
- refresh-token session state
- revocation
- audit events
```
