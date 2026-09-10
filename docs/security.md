# Recon Security Architecture & Threat Model

## 1. Security Invariants & Defenses

This document outlines the security controls, threat mitigations, and explicit design trade-offs implemented in the Recon AI Interview Prep Kit.

| Threat Category | Potential Attack Vector | Recon Defense & Mitigation | Implementation |
| :--- | :--- | :--- | :--- |
| **Session Hijacking / XSS** | Malicious scripts reading credentials from `localStorage` or `sessionStorage` | **Strict Cookie-Only Auth**: Zero Bearer token fallback in headers. Tokens are delivered solely via `HttpOnly`, `SameSite=Lax`, `Secure` (prod) cookies. JavaScript running in the browser cannot access the session token. | `src/api/auth/utils/jwt.ts`<br>`src/api/auth/middleware/require-auth.ts` |
| **Cross-Site Request Forgery (CSRF)** | Cross-site POST requests from malicious domains submitting authenticated actions | **SameSite=Lax + CORS Allowlist**: Modern browsers omit Lax cookies on cross-origin POST requests. Server enforces strict origin validation against `ALLOWED_ORIGINS`. | `src/api/index.ts`<br>`src/api/auth/utils/jwt.ts` |
| **Password Truncation Vulnerability** | Long passwords (> 72 bytes) silently truncated by bcrypt, allowing truncated collisions | **Strict 72-Character Upper Bound**: Zod schema rejects passwords longer than 72 characters, preventing truncation attacks. | `src/shared/schemas/auth.schema.ts` |
| **Credential Stuffing / Brute Force** | High-velocity dictionary attacks against `/api/auth/login` | **Two-Tier IP-Based Throttling**: 20 req/min general burst protection; 5 failed login attempts per 15 min per IP (`skipSuccessfulRequests: true`). Reaching threshold yields `AUTH_RATE_LIMITED` (HTTP 429). | `src/api/auth/middleware/rate-limiter.ts` |
| **OTP Brute-Forcing (10^6 space)** | Automated guessing of 6-digit email verification codes | **Strict 3-Attempt Lockout**: Maximum 3 attempts per OTP. On the 3rd failed attempt, the OTP is revoked and deleted from Redis immediately. | `src/api/auth/services/otp.service.ts` |
| **OTP Timing Attacks** | Measuring string comparison latency to deduce verification code characters | **Constant-Time Verification**: Uses `crypto.timingSafeEqual` over HMAC-SHA256 digests of the submitted code. | `src/api/auth/services/otp.service.ts` |
| **OTP At-Rest Memory Dumps** | Attackers inspecting or dumping Redis keys to extract plaintext OTPs | **At-Rest Hashing**: Plaintext OTP is never stored in Redis. Only HMAC-SHA256(`email:otp`, `SECRET`) is stored in Redis. | `src/api/auth/services/otp.service.ts` |
| **Password Reset Link Tampering** | Reusing or brute-forcing password reset tokens | **15-Minute Single-Use Token**: 64-hex random cryptographic token with HMAC hash stored at rest in Redis with strict 15-minute TTL (`900s`). Immediately deleted on redemption. | `src/api/auth/services/password-reset.service.ts` |
| **Password Reset Account Enumeration** | Probing `/api/auth/forgot-password` to discover registered candidate emails | **Anti-Enumeration & Constant-Time Dummy Execution**: Server returns indistinguishable `200 OK` generic response for unknown emails and executes a dummy bcrypt compare to match response latencies. | `src/api/auth/services/password-reset.service.ts` |
| **Email Bombing / Spam** | Flooding user inboxes or abusing email provider quotas | **Two-Tier OTP & Reset Rate-Limiting**: Enforces a strict 60-second cooldown between resends (`SET key NX EX 60`), plus maximum 5 requests per hour. | `src/api/auth/services/otp.service.ts`<br>`src/api/auth/services/password-reset.service.ts` |
| **SSRF / Cloud Metadata Exfiltration** | Attacker submitting `http://169.254.169.254`, `::ffff:7f00:1`, or internal subnets | **SSRF Shield with Undici Socket Pinning & 16-bit IPv6 Word Parsing**: Blocks RFC 1918, CGNAT (`100.64.0.0/10`), IPv6 ULA, dotted & hex IPv4-mapped IPv6 (`::ffff:0:0/96`), multicast, and Cloud Metadata IPs with pinned socket connections (eliminating DNS rebinding TOCTOU). | `src/core/crawler/fetcher.ts`<br>`src/core/crawler/url-validator.ts` |
| **Account Enumeration via Timing** | Measuring response times on `/api/auth/login` to deduce whether an email exists | **Constant-Time Comparison**: When a submitted email does not exist, the controller executes `bcrypt.compare(password, DUMMY_PASSWORD_HASH)` to ensure indistinguishable latency. | `src/api/auth/controllers/auth.controller.ts` |
| **Cross-Tenant IDOR / Enumeration** | Candidate attempting to access or probe kit IDs owned by other candidates | **Strict 404 Invariant**: `getUserKitById(kitId, userId)` returns `404 Not Found` for unowned kits. Never returns `403 Forbidden`, eliminating resource existence leakage. | `src/api/kits/services/kit-scoping.ts` |
| **Reverse Proxy IP Masking** | All requests appearing to come from proxy IP on PaaS (Render, Vercel) | **Configured Trust Proxy**: Express configured with `trust proxy: ['loopback', 'linklocal', 'uniquelocal']` so `req.ip` reflects the client's actual IP from `X-Forwarded-For`. | `src/api/index.ts` |

---

## 2. Redis & OTP Verification Infrastructure

### 2.1. Dual-Mode Redis Client (`src/api/shared/redis.ts`)
- **Production / Docker**: Connects via native Node.js TCP socket speaking standard RESP directly to Docker Redis (`recon-redis` on port 6379). Zero bloated npm dependencies.
- **CI / Unit Testing**: When Docker Redis is unreachable, seamlessly activates an in-memory `MemoryRedisStore` implementing the exact same TTL, atomic NX conditions, and key expiration semantics, ensuring 100% test reliability with zero external dependencies.

### 2.2. Transactional Email Delivery (`src/api/auth/services/mailer.service.ts`)
- **Production Delivery**: Integrated directly with **Resend API** via native HTTPS fetch. Transmits dark-mode branded HTML emails with the 6-digit code.
- **Development Fallback**: If `RESEND_API_KEY` is omitted, cleanly formats the email in the terminal console and outputs `devOtp` for effortless local testing.

---

## 3. Documented Residual Risks & Architectural Trade-offs

### 3.1. Low-and-Slow Distributed Attacks
- **Risk**: An attacker rotating through a large botnet or proxy pool making fewer than 5 attempts per IP every 15 minutes will not trigger the IP-based failed-login rate limiter.
- **Trade-off Analysis**: Mitigating this at the application layer requires account-level lockout (e.g., locking `user@example.com` after 5 failed attempts across any IP). However, account lockout introduces an immediate **denial-of-service vulnerability** against legitimate users (an attacker can intentionally lock out any candidate by submitting 5 wrong passwords).
- **Decision**: Account lockout is deliberately omitted. Production environments subject to high-volume distributed stuffing should deploy edge-layer bot mitigation (e.g., Cloudflare Turnstile or WAF) prior to reaching application containers.

### 3.2. Stateless JWT Session Revocation
- **Risk**: JWT sessions are stateless and valid for 7 days. Logging out clears the client-side `taro_session` cookie; however, if the raw token were intercepted prior to logout, it remains cryptographically valid until its 7-day expiration.
- **Trade-off Analysis**: Immediate token revocation requires maintaining a server-side denylist in Redis, transforming stateless JWTs into stateful sessions and requiring a database read on every single authenticated request.
- **Decision**: Given the `HttpOnly` + `Secure` cookie protection preventing token theft via XSS, the 7-day stateless window is accepted. Token revocation lists can be plugged into our Redis client if administrative force-logout becomes a requirement.
