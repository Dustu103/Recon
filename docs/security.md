# Taro Security Architecture & Threat Model

## 1. Security Invariants & Defenses

This document outlines the security controls, threat mitigations, and explicit design trade-offs implemented in the Taro AI Interview Prep Kit.

| Threat Category | Potential Attack Vector | Taro Defense & Mitigation | Implementation |
| :--- | :--- | :--- | :--- |
| **Session Hijacking / XSS** | Malicious scripts reading credentials from `localStorage` or `sessionStorage` | **Strict Cookie-Only Auth**: Zero Bearer token fallback in headers. Tokens are delivered solely via `HttpOnly`, `SameSite=Lax`, `Secure` (prod) cookies. JavaScript running in the browser cannot access the session token. | `src/api/auth/utils/jwt.ts`<br>`src/api/auth/middleware/require-auth.ts` |
| **Cross-Site Request Forgery (CSRF)** | Cross-site POST requests from malicious domains submitting authenticated actions | **SameSite=Lax + CORS Allowlist**: Modern browsers omit Lax cookies on cross-origin POST requests. Server enforces strict origin validation against `ALLOWED_ORIGINS`. | `src/api/index.ts`<br>`src/api/auth/utils/jwt.ts` |
| **Password Truncation Vulnerability** | Long passwords (> 72 bytes) silently truncated by bcrypt, allowing truncated collisions | **Strict 72-Character Upper Bound**: Zod schema rejects passwords longer than 72 characters, preventing truncation attacks. | `src/shared/schemas/auth.schema.ts` |
| **Credential Stuffing / Brute Force** | High-velocity dictionary attacks against `/api/auth/login` | **Two-Tier IP-Based Throttling**: 20 req/min general burst protection; 5 failed login attempts per 15 min per IP (`skipSuccessfulRequests: true`). Reaching threshold yields `AUTH_RATE_LIMITED` (HTTP 429). | `src/api/auth/middleware/rate-limiter.ts` |
| **Account Enumeration via Timing** | Measuring response times on `/api/auth/login` to deduce whether an email exists | **Constant-Time Comparison**: When a submitted email does not exist, the controller executes `bcrypt.compare(password, DUMMY_PASSWORD_HASH)` to ensure indistinguishable latency. | `src/api/auth/controllers/auth.controller.ts` |
| **Cross-Tenant IDOR / Enumeration** | Candidate attempting to access or probe kit IDs owned by other candidates | **Strict 404 Invariant**: `getUserKitById(kitId, userId)` returns `404 Not Found` for unowned kits. Never returns `403 Forbidden`, eliminating resource existence leakage. | `src/api/kits/services/kit-scoping.ts` |
| **Reverse Proxy IP Masking** | All requests appearing to come from proxy IP on PaaS (Render, Vercel) | **Configured Trust Proxy**: Express configured with `trust proxy: ['loopback', 'linklocal', 'uniquelocal']` so `req.ip` reflects the client's actual IP from `X-Forwarded-For`. | `src/api/index.ts` |

---

## 2. Documented Residual Risks & Architectural Trade-offs

In accordance with Section 1 requirements, the following residual risks and trade-offs are explicitly accepted and documented:

### 2.1. Low-and-Slow Distributed Attacks
- **Risk**: An attacker rotating through a large botnet or proxy pool making fewer than 5 attempts per IP every 15 minutes will not trigger the IP-based failed-login rate limiter.
- **Trade-off Analysis**: Mitigating this at the application layer requires account-level lockout (e.g., locking `user@example.com` after 5 failed attempts across any IP). However, account lockout introduces an immediate **denial-of-service vulnerability** against legitimate users (an attacker can intentionally lock out any candidate by submitting 5 wrong passwords).
- **Decision**: Account lockout is deliberately omitted in this phase. Production environments subject to high-volume distributed stuffing should deploy edge-layer bot mitigation (e.g., Cloudflare Turnstile, Cloudflare WAF, or reCAPTCHA v3) prior to reaching application containers.

### 2.2. Ephemeral In-Memory Rate Limiter on Free-Tier PaaS
- **Risk**: Rate limit counters are tracked in-process using `express-rate-limit`'s default in-memory store. When deploying on free tiers (such as Render) where containers sleep after inactivity or restart on scale-out, in-memory counters reset to zero upon wake.
- **Trade-off Analysis**: A persistent store (Redis or MongoDB-backed rate limiting) adds infrastructural overhead, external latency, and potential points of failure to local development and single-instance deployments.
- **Decision**: In-memory rate limiting is retained for Phase 1. When scaling to multi-instance production clusters, `express-rate-limit` will swap its storage adapter to `rate-limit-redis`.

### 2.3. User Registration Email Disclosure
- **Risk**: Calling `POST /api/auth/register` with an already-registered email returns HTTP `409 Conflict` with `ErrorCode.USER_EXISTS`, confirming the email is registered.
- **Trade-off Analysis**: Preventing registration disclosure requires a "silent acceptance" flow (returning 200 and sending a confirmation email). However, email verification is explicitly out of scope for D1. Silently returning success without creating an account or logging in confuses users and breaks registration UX.
- **Decision**: Explicit 409 responses on registration are intentionally accepted as standard consumer SaaS UX.

### 2.4. Stateless JWT Session Revocation
- **Risk**: JWT sessions are stateless and valid for 7 days. Logging out clears the client-side `taro_session` cookie; however, if the raw token were intercepted prior to logout, it remains cryptographically valid until its 7-day expiration.
- **Trade-off Analysis**: Immediate token revocation requires maintaining a server-side denylist (in Redis or MongoDB), transforming stateless JWTs into stateful sessions and requiring a database read on every single authenticated request.
- **Decision**: Given the `HttpOnly` + `Secure` cookie protection preventing token theft via XSS, the 7-day stateless window is accepted. Token revocation lists will be introduced if administrative force-logout becomes a requirement.
