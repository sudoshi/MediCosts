# Authentication System — DO NOT MODIFY

## CRITICAL: Protected Auth Components

The following authentication system is production-deployed and MUST NOT be overwritten, removed, or architecturally changed without explicit user authorization:

### Backend (server/)
- `server/routes/auth.js` — Auth endpoints (register, login, change-password, me)
- `server/middleware/auth.js` — JWT middleware (requireAuth, requireAdmin)
- `server/lib/email.js` — Resend email integration for temp password delivery
- `server/lib/db-migrate.js` — Users table schema with must_change_password flow
- `server/lib/crypto.js` — AES-256-GCM encryption for API keys

### Frontend (client/)
- `client/src/components/LoginPage.jsx` — Login form with "Create Account" link
- `client/src/components/RegisterPage.jsx` — Registration form (name, email, phone)
- `client/src/components/ChangePasswordModal.jsx` — Forced password change modal
- `client/src/hooks/useApi.js` — Auth-injecting fetch wrapper

### Database Schema
- `users` table: id, email, full_name, phone, password_hash, must_change_password, is_active, role, created_at, last_login

## Enforced Auth Flow (MediCosts Paradigm)

This is the reference implementation. All other Acumenus platforms replicate this flow:

1. Visitor clicks "Create Account" on login page
2. Enters: full name, email, phone (optional)
3. Backend generates 12-char temp password (excludes I, l, O, 0)
4. Temp password emailed via Resend API (from: noreply@acumenus.net)
5. Visitor logs in with temp password
6. Non-dismissable ChangePasswordModal forces permanent password (min 8 chars)
7. After password change: must_change_password = false, full app access

## Rules

1. **NEVER remove the "Create Account" link from the login page**
2. **NEVER remove or make the ChangePasswordModal dismissable**
3. **NEVER bypass the must_change_password flow**
4. **NEVER change the email sender from noreply@acumenus.net**
5. **NEVER hardcode the Resend API key in source code** (use .resendapikey file or env var)
6. **NEVER remove email enumeration prevention** (register returns same message for existing/new emails)
7. **NEVER weaken password requirements** (min 8 chars, bcrypt 12 rounds)
8. **NEVER remove rate limiting** on auth endpoints
9. **Superuser account** `admin@acumenus.net` must always exist with must_change_password=false
10. **If modifying auth**, preserve ALL existing endpoints and their behavior — additions only

## Resend Configuration
- API Key: stored in `.resendapikey` file (git-ignored) or RESEND_API_KEY env var
- From: `noreply@acumenus.net`
- Branded HTML email template per platform
