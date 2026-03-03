# E2E Testing Strategy — MediCosts

## Executive Summary

Zero existing test infrastructure. Starting from scratch with a three-layer pyramid:

```
         ┌────────────────────────────┐
    E2E  │  Playwright  (browser)     │  ~30 tests — critical user flows
         ├────────────────────────────┤
   API   │  Vitest + Supertest        │  ~60 tests — all 91 endpoints, auth enforcement
         ├────────────────────────────┤
  Unit   │  Vitest                    │  ~40 tests — middleware, utils, hooks
         └────────────────────────────┘
```

**Tools chosen:**
| Layer | Tool | Rationale |
|---|---|---|
| E2E browser | **Playwright** | Modern, fast, multi-browser, great async API, first-class Vite support |
| API integration | **Vitest + Supertest** | Shares Vitest with unit layer, Supertest handles HTTP in-process (no server needed) |
| Unit | **Vitest** | Already using Vite — shares config, no extra toolchain |
| React components | **@testing-library/react** | Standard, avoids testing implementation details |

---

## Directory Structure

```
tests/
  e2e/                          ← Playwright browser tests
    auth.spec.ts                  P0 — full auth flow
    smoke.spec.ts                 P1 — all 24 routes render
    journeys/
      overview.spec.ts            P1 — DRG selector → map → stats
      hospitals.spec.ts           P1 — search, detail, compare
      cost-estimator.spec.ts      P2 — estimate workflow
      abby.spec.ts                P2 — AI chat smoke
  api/                          ← Supertest API contract tests
    auth.test.js                  P0 — register, login, change-pw, /me
    enforcement.test.js           P0 — 401/403 on every router group
    core.test.js                  P1 — response shapes, pagination
    admin.test.js                 P1 — clearnetwork routes (admin only)
  unit/                         ← Pure unit tests
    middleware/
      auth.test.js                P0 — requireAuth, requireAdmin
    lib/
      email.test.js               P1 — lazy Resend init, key loading
    client/
      useApi.test.js              P1 — 401 handler, header injection
      format.test.js              P2 — number/currency formatters
playwright.config.ts
vitest.config.js
vitest.api.config.js            ← separate config for API tests (Node env)
```

---

## Setup

### 1. Install dependencies

```bash
# E2E
cd client && npm install -D @playwright/test
npx playwright install chromium  # add firefox,webkit for CI

# Unit + API
cd ../server && npm install -D vitest supertest
cd ../client && npm install -D vitest @testing-library/react @testing-library/user-event jsdom
```

### 2. Root package.json scripts

```json
{
  "scripts": {
    "test":         "npm run test:unit && npm run test:api && npm run test:e2e",
    "test:unit":    "vitest run --config tests/vitest.config.js",
    "test:api":     "vitest run --config tests/vitest.api.config.js",
    "test:e2e":     "playwright test",
    "test:e2e:ui":  "playwright test --ui"
  }
}
```

### 3. `playwright.config.ts`

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:5180',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Add for CI: firefox, webkit
  ],
  webServer: [
    {
      command: 'cd server && npm run dev',
      port: 3000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'cd client && npm run dev',
      port: 5180,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
```

### 4. `tests/vitest.api.config.js`

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/api/**/*.test.js'],
    globalSetup: './tests/api/setup.js',  // creates test user, seeds DB
    teardown: './tests/api/teardown.js',
  },
});
```

---

## P0 — Auth Flow (highest priority, implement first)

These tests cover the entire auth system just built. They must pass before anything else is deployed.

### `tests/e2e/auth.spec.ts`

```ts
import { test, expect } from '@playwright/test';

const TEST_EMAIL    = 'e2e-user@medicosts.test';
const ADMIN_EMAIL   = process.env.TEST_ADMIN_EMAIL!;
const ADMIN_PASS    = process.env.TEST_ADMIN_PASS!;
const TEMP_PASS     = 'TempPass99';   // injected via DB seed in beforeAll
const NEW_PASS      = 'NewSecure!42';

test.describe('Login', () => {
  test('shows login page when unauthenticated', async ({ page }) => {
    await page.goto('/overview');
    await expect(page).toHaveURL('/');          // redirected
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
  });

  test('shows error on wrong credentials', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/email/i).fill('wrong@example.com');
    await page.getByLabel(/password/i).fill('wrongpass');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/invalid credentials/i)).toBeVisible();
  });

  test('successful login lands on /overview', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(ADMIN_PASS);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL('/overview');
    // Token persisted
    const token = await page.evaluate(() => localStorage.getItem('authToken'));
    expect(token).toBeTruthy();
  });

  test('rate limit after 5 failed attempts', async ({ page }) => {
    await page.goto('/');
    for (let i = 0; i < 5; i++) {
      await page.getByLabel(/email/i).fill('x@x.com');
      await page.getByLabel(/password/i).fill('wrong' + i);
      await page.getByRole('button', { name: /sign in/i }).click();
    }
    await expect(page.getByText(/too many attempts/i)).toBeVisible();
  });
});

test.describe('Forced password change', () => {
  test('ChangePasswordModal shown on first login with temp password', async ({ page }) => {
    // Seed a user with must_change_password=true beforeAll
    await page.goto('/');
    await page.getByLabel(/email/i).fill(TEST_EMAIL);
    await page.getByLabel(/password/i).fill(TEMP_PASS);
    await page.getByRole('button', { name: /sign in/i }).click();

    // Modal must appear
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/set your password/i)).toBeVisible();

    // Modal is not dismissable (no X, no backdrop click)
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('completes password change and modal dismisses', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/email/i).fill(TEST_EMAIL);
    await page.getByLabel(/password/i).fill(TEMP_PASS);
    await page.getByRole('button', { name: /sign in/i }).click();

    await page.getByLabel(/temporary password/i).fill(TEMP_PASS);
    await page.getByLabel(/new password/i).first().fill(NEW_PASS);
    await page.getByLabel(/confirm/i).fill(NEW_PASS);
    await page.getByRole('button', { name: /set password/i }).click();

    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page).toHaveURL('/overview');

    // New token issued (with mustChangePassword=false)
    const token = await page.evaluate(() => localStorage.getItem('authToken'));
    expect(token).toBeTruthy();
  });

  test('wrong current password shows error in modal', async ({ page }) => {
    // ... login with must_change_password user ...
    await page.getByLabel(/temporary password/i).fill('wrongtemp');
    await page.getByLabel(/new password/i).first().fill(NEW_PASS);
    await page.getByLabel(/confirm/i).fill(NEW_PASS);
    await page.getByRole('button', { name: /set password/i }).click();
    await expect(page.getByText(/current password is incorrect/i)).toBeVisible();
    // Modal stays open
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});

test.describe('Register', () => {
  test('register link shown on login page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /create one/i })).toBeVisible();
  });

  test('register form submits and shows confirmation', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /create one/i }).click();
    await expect(page.getByRole('heading', { name: /create account/i })).toBeVisible();

    await page.getByLabel(/full name/i).fill('Test User');
    await page.getByLabel(/email/i).fill('newuser@example.com');
    await page.getByRole('button', { name: /request access/i }).click();

    await expect(page.getByText(/check your inbox/i)).toBeVisible();
  });
});

test.describe('Logout', () => {
  test('logout clears token and redirects to login', async ({ page }) => {
    // Login first
    await page.goto('/');
    await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(ADMIN_PASS);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL('/overview');

    // Logout
    await page.getByRole('button', { name: /logout/i }).click();

    await expect(page).toHaveURL('/');
    const token = await page.evaluate(() => localStorage.getItem('authToken'));
    expect(token).toBeNull();
  });

  test('expired/tampered token auto-redirects to login', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('authToken', 'invalid.jwt.token'));
    await page.goto('/overview');
    await expect(page).toHaveURL('/');
  });
});
```

### `tests/api/auth.test.js`

```js
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../server/index.js';  // export app separately from listen()

describe('POST /api/auth/register', () => {
  it('returns 400 if email missing', async () => {
    const r = await request(app).post('/api/auth/register').send({ fullName: 'Test' });
    expect(r.status).toBe(400);
  });

  it('returns 400 for invalid email format', async () => {
    const r = await request(app).post('/api/auth/register').send({ email: 'notanemail', fullName: 'Test' });
    expect(r.status).toBe(400);
  });

  it('returns success message for valid registration', async () => {
    const r = await request(app).post('/api/auth/register')
      .send({ email: 'newuser@test.com', fullName: 'New User' });
    expect(r.status).toBe(200);
    expect(r.body.message).toMatch(/check your email/i);
  });

  it('returns same message for duplicate email (no enumeration)', async () => {
    // First registration
    await request(app).post('/api/auth/register').send({ email: 'dup@test.com', fullName: 'Dup' });
    // Second registration same email
    const r = await request(app).post('/api/auth/register').send({ email: 'dup@test.com', fullName: 'Dup' });
    expect(r.status).toBe(200);                       // NOT 409
    expect(r.body.message).toMatch(/check your email/i);
  });
});

describe('POST /api/auth/login', () => {
  it('returns 401 for unknown email', async () => {
    const r = await request(app).post('/api/auth/login')
      .send({ email: 'nobody@test.com', password: 'anything' });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('Invalid credentials');  // not "user not found"
  });

  it('returns 401 for wrong password', async () => {
    const r = await request(app).post('/api/auth/login')
      .send({ email: process.env.TEST_ADMIN_EMAIL, password: 'wrongpass' });
    expect(r.status).toBe(401);
  });

  it('returns token + user on success', async () => {
    const r = await request(app).post('/api/auth/login')
      .send({ email: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASS });
    expect(r.status).toBe(200);
    expect(r.body.token).toBeTruthy();
    expect(r.body.user).toMatchObject({
      email: process.env.TEST_ADMIN_EMAIL,
      role: 'admin',
      mustChangePassword: false,
    });
  });

  it('returns 429 after 5 failed attempts', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/login').send({ email: 'x@x.com', password: 'bad' });
    }
    const r = await request(app).post('/api/auth/login').send({ email: 'x@x.com', password: 'bad' });
    expect(r.status).toBe(429);
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 with no token', async () => {
    const r = await request(app).get('/api/auth/me');
    expect(r.status).toBe(401);
  });

  it('returns user data with valid token', async () => {
    const login = await request(app).post('/api/auth/login')
      .send({ email: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASS });
    const token = login.body.token;

    const r = await request(app).get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ email: process.env.TEST_ADMIN_EMAIL, role: 'admin' });
  });
});
```

---

## P0 — Auth Enforcement (`tests/api/enforcement.test.js`)

Every route group must return 401 without a token and 403 on admin-only routes with a non-admin token. This is a contract test — it verifies the blanket middleware is working.

```js
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../server/index.js';

let userToken, adminToken;

beforeAll(async () => {
  // Login as regular user and admin
  const u = await request(app).post('/api/auth/login')
    .send({ email: process.env.TEST_USER_EMAIL, password: process.env.TEST_USER_PASS });
  userToken = u.body.token;

  const a = await request(app).post('/api/auth/login')
    .send({ email: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASS });
  adminToken = a.body.token;
});

// One probe per router group — if the blanket middleware works, all routes in that group are covered
const PROTECTED_PROBES = [
  ['GET', '/api/drgs/top50'],
  ['GET', '/api/quality/composite'],
  ['GET', '/api/post-acute/nursing-homes'],
  ['GET', '/api/facilities/irf'],
  ['GET', '/api/trends/national'],
  ['GET', '/api/payments/summary'],
  ['GET', '/api/connectors'],
  ['POST', '/api/abby/chat'],
];

const ADMIN_PROBES = [
  ['GET', '/api/clearnetwork/status'],
  ['GET', '/api/clearnetwork/insurers'],
];

describe('Auth enforcement — no token → 401', () => {
  for (const [method, path] of PROTECTED_PROBES) {
    it(`${method} ${path}`, async () => {
      const r = await request(app)[method.toLowerCase()](path);
      expect(r.status).toBe(401);
    });
  }
});

describe('Admin enforcement — user token → 403', () => {
  for (const [method, path] of ADMIN_PROBES) {
    it(`${method} ${path}`, async () => {
      const r = await request(app)[method.toLowerCase()](path)
        .set('Authorization', `Bearer ${userToken}`);
      expect(r.status).toBe(403);
    });

    it(`${method} ${path} — admin token → not 403`, async () => {
      const r = await request(app)[method.toLowerCase()](path)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).not.toBe(403);
      expect(r.status).not.toBe(401);
    });
  }
});
```

---

## P0 — Middleware Unit Tests (`tests/unit/middleware/auth.test.js`)

```js
import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';

// Set up env before importing middleware
process.env.JWT_SECRET = 'test-secret-for-unit-tests';

const { requireAuth, requireAdmin } = await import('../../../server/middleware/auth.js');

function mockRes() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe('requireAuth', () => {
  it('returns 401 with no Authorization header', () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 with tampered token', () => {
    const req = { headers: { authorization: 'Bearer invalid.token.here' } };
    const res = mockRes();
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('sets req.user and calls next() with valid token', () => {
    const payload = { id: 1, email: 'test@test.com', role: 'user', mustChangePassword: false };
    const token = jwt.sign(payload, 'test-secret-for-unit-tests', { expiresIn: '1h' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject({ id: 1, email: 'test@test.com', role: 'user' });
  });
});

describe('requireAdmin', () => {
  it('returns 403 when role is user', () => {
    const req = { user: { role: 'user' } };
    const res = mockRes();
    const next = vi.fn();
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('calls next() when role is admin', () => {
    const req = { user: { role: 'admin' } };
    const res = mockRes();
    const next = vi.fn();
    requireAdmin(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
```

---

## P1 — Smoke Tests: All 24 Routes (`tests/e2e/smoke.spec.ts`)

Verifies every view renders without a JS error or white screen. Uses a shared logged-in state (via `storageState`) to avoid re-logging in for each test.

```ts
import { test, expect } from '@playwright/test';

// Run once: log in and save auth state to file
// playwright.config.ts → projects[0].use.storageState = 'tests/e2e/.auth/user.json'

const ROUTES = [
  ['/overview',                'Overview'],
  ['/quality',                 'Quality'],
  ['/hospitals',               'Hospital'],
  ['/geography',               'Geographic'],
  ['/trends',                  'Trends'],
  ['/post-acute',              'Post-Acute'],
  ['/spending',                'Spending'],
  ['/clinicians',              'Clinician'],
  ['/physicians',              'Physician'],
  ['/accountability',          'Accountability'],
  ['/compare',                 'Compare'],
  ['/estimate',                'Estimate'],
  ['/for-patients',            'For Patients'],
  ['/payments',                'Payments'],
  ['/connectors',              'Connectors'],
  ['/settings',                'Settings'],
  ['/abby',                    'Abby'],
];

// Auth fixture — logs in once, reuses cookies/localStorage for all tests
test.use({ storageState: 'tests/e2e/.auth/user.json' });

for (const [route, name] of ROUTES) {
  test(`${name} view loads without error (${route})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => {
      if (r.status() >= 500) errors.push(`HTTP ${r.status()} on ${r.url()}`);
    });

    await page.goto(route);
    await page.waitForLoadState('networkidle');

    // No JS errors
    expect(errors).toHaveLength(0);

    // Page has meaningful content (not blank)
    const body = await page.locator('main, [role="main"], #root > *').first();
    await expect(body).toBeVisible();
  });
}
```

### Auth fixture setup (`tests/e2e/global-setup.ts`)

```ts
import { chromium } from '@playwright/test';

export default async function globalSetup() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('http://localhost:5180');
  await page.getByLabel(/email/i).fill(process.env.TEST_ADMIN_EMAIL!);
  await page.getByLabel(/password/i).fill(process.env.TEST_ADMIN_PASS!);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('/overview');

  // Save storage state for reuse
  await page.context().storageState({ path: 'tests/e2e/.auth/user.json' });
  await browser.close();
}
```

---

## P1 — Core User Journey Tests

### `tests/e2e/journeys/overview.spec.ts`

```ts
test('DRG selector updates map and stats', async ({ page }) => {
  await page.goto('/overview');
  await page.waitForLoadState('networkidle');

  // Map renders
  await expect(page.locator('svg, canvas').first()).toBeVisible();

  // Change DRG
  const selector = page.getByRole('combobox').first();
  await selector.click();
  await page.getByRole('option').nth(2).click();

  // Stats update (not blank)
  await expect(page.locator('[data-testid="stat-avg-payment"], .summaryCards')).toBeVisible();
});
```

### `tests/e2e/journeys/hospitals.spec.ts`

```ts
test('hospital search returns results', async ({ page }) => {
  await page.goto('/hospitals');
  const search = page.getByPlaceholder(/search/i);
  await search.fill('Mayo');
  await page.waitForResponse(r => r.url().includes('/api/'));
  await expect(page.getByRole('row').nth(1)).toBeVisible();
});

test('hospital detail loads from explorer', async ({ page }) => {
  await page.goto('/hospitals');
  await page.getByRole('row').nth(1).click();
  await page.waitForURL(/\/hospitals\/.+/);
  await expect(page.getByRole('heading').first()).toBeVisible();
});
```

---

## P1 — API Contract Tests (`tests/api/core.test.js`)

Spot-checks response shapes for the most critical data endpoints.

```js
describe('Core API contracts', () => {
  it('GET /api/drgs/top50 — returns array of DRG objects', async () => {
    const r = await authedRequest(app).get('/api/drgs/top50');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    const drg = r.body[0];
    expect(drg).toHaveProperty('drg_code');
    expect(drg).toHaveProperty('avg_payment');
    expect(drg).toHaveProperty('total_discharges');
  });

  it('GET /api/states/summary — returns state-keyed data', async () => {
    const r = await authedRequest(app).get('/api/states/summary');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body[0]).toHaveProperty('state');
  });

  it('GET /api/quality/composite — returns composite scores', async () => {
    const r = await authedRequest(app).get('/api/quality/composite');
    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThan(0);
  });

  it('GET /api/payments/summary — returns payment summary', async () => {
    const r = await authedRequest(app).get('/api/payments/summary');
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('total_amount');
  });
});
```

---

## P2 — Remaining Coverage

| Test | File | Notes |
|---|---|---|
| Cost estimator workflow | `journeys/cost-estimator.spec.ts` | Fill inputs → see estimate output |
| Abby chat smoke | `journeys/abby.spec.ts` | Send message → get response (may need mock) |
| Hospital compare | `journeys/hospitals.spec.ts` | Select 2+ hospitals → compare table |
| Change-password API | `api/auth.test.js` | New password too short, same as old, mismatch |
| `useApi` hook | `unit/client/useApi.test.js` | 401 triggers handler, header injected |
| Number formatters | `unit/client/format.test.js` | Edge cases: $0, $1M+, negative |
| Lazy Resend init | `unit/lib/email.test.js` | Missing key throws only on send, not import |
| Connectors CRUD | `api/connectors.test.js` | POST → GET → DELETE lifecycle |
| Admin clearnetwork | `api/admin.test.js` | Status, insurers, crawl-jobs |
| Trends endpoints | `api/core.test.js` | DRG/provider/state/national all return arrays |

---

## Test Environment Setup

### Environment variables for tests (`.env.test`)

```
# Test credentials — seed these via seed-admin.js before running tests
TEST_ADMIN_EMAIL=admin@test.local
TEST_ADMIN_PASS=TestAdmin!99
TEST_USER_EMAIL=user@test.local
TEST_USER_PASS=TestUser!99
TEST_USER_TEMP_PASS=TempUser!1

# Point at test DB (or use main DB with transaction rollback)
PGDATABASE=medicosts_test   # optional — separate DB for isolation
JWT_SECRET=test-jwt-secret-not-for-production
```

### API test DB strategy

Two options — pick based on complexity tolerance:

**Option A: Transaction rollback (simpler)**
Each API test wraps all DB operations in a transaction, rolls back after. Zero cleanup needed. Requires passing a client to every query — needs a small refactor of `db.js`.

**Option B: Separate test DB (recommended for this app)**
```bash
PGDATABASE=medicosts_test node scripts/create-db.js
PGDATABASE=medicosts_test node scripts/load-data.js  # or a small fixture subset
```
Tests run against `medicosts_test`, no risk to production data.

---

## What NOT to Test

| Concern | Reason |
|---|---|
| Visual regression of charts/maps | Expensive, brittle, requires Percy/Chromatic — overkill for internal tool |
| All 91 endpoints in depth | API enforcement test covers auth layer; contract tests cover shape of ~15 critical endpoints |
| Recharts rendering | Library is tested by its maintainers |
| All 24 views in deep functional detail | Smoke tests cover render; journeys cover key interactions |
| CSS correctness | Out of scope for E2E |
| Abby AI response quality | Non-deterministic; test connectivity and format, not content |
| Rate limit exact timing | Time-dependent, flaky; unit test the `checkRateLimit` function instead |

---

## CI Integration (GitHub Actions)

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  unit-api:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: medicosts_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm run install:all
      - run: node scripts/create-db.js     # create schema
      - run: node scripts/seed-admin.js    # seed test admin (env vars)
      - run: npm run test:unit
      - run: npm run test:api
    env:
      PGDATABASE: medicosts_test
      PGUSER: postgres
      PGPASSWORD: postgres
      TEST_ADMIN_EMAIL: admin@test.local
      TEST_ADMIN_PASS: TestAdmin!99
      JWT_SECRET: ci-test-secret

  e2e:
    runs-on: ubuntu-latest
    needs: unit-api    # only run E2E if unit/API tests pass
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm run install:all
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
    env:
      TEST_ADMIN_EMAIL: admin@test.local
      TEST_ADMIN_PASS: TestAdmin!99
```

---

## Implementation Order

```
Week 1 — P0 (auth)
  □ Refactor server/index.js to export app separately from listen()
  □ tests/unit/middleware/auth.test.js
  □ tests/api/auth.test.js
  □ tests/api/enforcement.test.js
  □ tests/e2e/auth.spec.ts + global-setup.ts

Week 2 — P1 (smoke + contracts)
  □ Playwright storageState auth fixture
  □ tests/e2e/smoke.spec.ts (all 24 routes)
  □ tests/api/core.test.js (DRGs, states, quality, payments)
  □ tests/e2e/journeys/overview.spec.ts
  □ tests/e2e/journeys/hospitals.spec.ts

Week 3 — P2 + CI
  □ Remaining API contract tests
  □ Remaining journey tests
  □ GitHub Actions workflow
  □ .env.test and test DB setup documented in README
```

---

## One Required Refactor

`server/index.js` currently calls `app.listen()` at module level. Supertest needs to import `app` without starting a server. Separate them:

```js
// server/index.js — add this at the bottom
export default app;   // ← add this

runMigrations().then(() => {
  if (process.env.NODE_ENV !== 'test') {   // ← guard
    app.listen(PORT, () => console.log(`✦ MediCosts API listening on http://localhost:${PORT}`));
  }
});
```

This is the only code change needed to unlock the entire API test layer.
