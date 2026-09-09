# Domain 1 — Identity & Authentication Specification

## 1. Overview & Architecture

Domain 1 implements authentication and identity management for the Taro AI Interview Prep Kit. The system enforces strict, modern web security standards while keeping the footprint minimal and robust.

### Key Architectural Invariants
1. **Cookie-Only Session Authentication**: Sessions are managed exclusively through an `HttpOnly`, `SameSite=Lax`, `Secure` (in production) cookie named `taro_session`. There is **zero Bearer token fallback** in headers or localStorage, eliminating XSS token exfiltration vectors.
2. **Explicit Password Hashing**: Passwords are explicitly hashed at the controller layer (`await bcrypt.hash(password, 10)`) immediately before database insertion. Mongoose pre-save middleware hooks are deliberately avoided to eliminate hidden lifecycle side effects.
3. **Password Length Boundary (8–72 Chars)**: Passwords are validated using Zod with a minimum length of 8 characters and an explicit maximum of 72 characters. The 72-character maximum prevents bcrypt silent truncation (where characters beyond 72 bytes are ignored by the standard blowfish algorithm).
4. **Constant-Time Timing Attack Mitigation**: If an unknown email is submitted on `/api/auth/login`, the server executes `await bcrypt.compare(password, DUMMY_PASSWORD_HASH)` so that response latencies between valid and invalid emails are indistinguishable.
5. **Tenant-Isolated Kit Access (Strict 404)**: Accessing a kit owned by another user or an invalid kit ID strictly returns `404 Not Found` (`ErrorCode.NOT_FOUND`), never `403 Forbidden`, preventing resource enumeration attacks across tenants.
6. **Two-Tier Rate Limiting**:
   - **Auth Burst Limiter**: 20 requests per minute per IP across all `/api/auth/*` endpoints.
   - **Login Brute-Force Throttle**: 5 failed login attempts per 15-minute window per client IP (`skipSuccessfulRequests: true`). The 6th attempt returns `429 Too Many Requests` with code `AUTH_RATE_LIMITED`.

---

## 2. API Endpoints

### `POST /api/auth/register`
Creates a new user account, sets the session cookie, and returns the sanitized user payload.

- **Rate Limit**: Auth Burst Limiter (20 req/min/IP).
- **Request Body**:
  ```json
  {
    "email": "candidate@example.com",
    "password": "SecurePassword123!"
  }
  ```
- **Responses**:
  - `201 Created`:
    - Headers: `Set-Cookie: taro_session=<JWT>; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`
    - Body:
      ```json
      {
        "user": {
          "id": "66dee2e249f0322d8616fa12",
          "email": "candidate@example.com",
          "createdAt": "2026-09-09T15:30:00.000Z"
        }
      }
      ```
  - `400 Bad Request`: Validation failure (`ErrorCode.INVALID_INPUT`).
  - `409 Conflict`: User already exists (`ErrorCode.USER_EXISTS`).

### `POST /api/auth/login`
Validates user credentials, issues a session cookie, and returns the user payload.

- **Rate Limit**: Auth Burst Limiter (20 req/min) + Login Brute-Force Throttle (5 failed attempts/15 min).
- **Timing Defense**: Unknown email executes `bcrypt.compare(password, DUMMY_PASSWORD_HASH)` before throwing 401.
- **Request Body**:
  ```json
  {
    "email": "candidate@example.com",
    "password": "SecurePassword123!"
  }
  ```
- **Responses**:
  - `200 OK`:
    - Headers: `Set-Cookie: taro_session=<JWT>; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`
    - Body: User payload object.
  - `401 Unauthorized`: Invalid credentials (`ErrorCode.INVALID_CREDENTIALS`).
  - `429 Too Many Requests`: Threshold exceeded (`ErrorCode.AUTH_RATE_LIMITED`).

### `POST /api/auth/logout`
Terminates the current session by clearing the `taro_session` cookie.

- **Responses**:
  - `200 OK`:
    - Headers: `Set-Cookie: taro_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
    - Body: `{ "status": "ok" }`

### `GET /api/auth/me`
Returns the currently authenticated user's profile.

- **Authentication**: Requires valid `taro_session` cookie.
- **Responses**:
  - `200 OK`:
    ```json
    {
      "user": {
        "id": "66dee2e249f0322d8616fa12",
        "email": "candidate@example.com"
      }
    }
    ```
  - `401 Unauthorized`:
    - Missing or corrupted cookie: `ErrorCode.UNAUTHORIZED`
    - Expired token: `ErrorCode.TOKEN_EXPIRED`

---

## 3. Session Management & Token Format

- **Algorithm**: HMAC SHA-256 (`HS256`) signed with `JWT_SECRET`.
- **Payload**:
  ```json
  {
    "userId": "66dee2e249f0322d8616fa12",
    "email": "candidate@example.com",
    "iat": 1725895800,
    "exp": 1726500600
  }
  ```
- **TTL**: 7 days (604,800 seconds).

---

## 4. Reverse Proxy & Deployment Invariants

In cloud environments where Node runs behind a reverse proxy or TLS termination layer (e.g., Render, Vercel, AWS ALB):
- The server configures `app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal'])` so that `req.ip` correctly resolves to the real client IP forwarded through `X-Forwarded-For`, rather than the internal gateway IP.
- Frontend requests in development and production route through Next.js rewrites (`/api/:path*`), ensuring same-origin cookie delivery and full compatibility with `SameSite=Lax`.

---

## 5. Web Client Architecture (`apps/web`)

### Next.js Proxy Rewrites (`next.config.js`)
Frontend requests to `/api/:path*` are rewritten internally to the Express server (`http://localhost:4000/api/:path*`). This ensures:
1. Browsers treat API calls as same-origin requests.
2. `SameSite=Lax` cookies are included reliably across all navigation contexts.

### API Client Wrapper (`apps/web/src/lib/api.ts`)
- Standardized `apiFetch<T>()` utility enforcing `credentials: 'include'` and `'Content-Type': 'application/json'`.
- Parses error envelopes and rethrows structured `ApiClientError` instances carrying `code`, `message`, and `status`.

### React Auth Context & Hook (`apps/web/src/hooks/use-auth.tsx`)
Exposes global session state through `useAuth()`:
```tsx
interface AuthContextType {
  user: UserPayload | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}
```
- On initial mount, automatically calls `GET /api/auth/me` to hydrate session state.

### Route Protection Component (`apps/web/src/components/auth/protected-route.tsx`)
- Gates authenticated views (such as `/dashboard`).
- Renders an emerald loading spinner while session verification is in progress.
- Automatically redirects unauthenticated users to `/login` via `router.replace('/login')`.

### User Interface Pages
- **`/register`**: Email & password form with real-time 8–72 character length indicator and duplicate-account error handling.
- **`/login`**: Email & password authentication with dedicated error alerts for invalid credentials and brute-force throttling (`AUTH_RATE_LIMITED`).
- **`/dashboard`**: Protected user workspace displaying session status, active kit statistics, and kit creation CTAs.
- **`<Navbar>`**: Global navigation bar with authenticated candidate indicator and one-click logout.
