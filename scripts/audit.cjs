/**
 * MediCosts Site Audit — Playwright
 * Logs in as admin, visits every route, captures console errors,
 * failed network requests, and empty panels. Saves screenshots.
 *
 * Usage: node scripts/audit.cjs
 */

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://medicosts.acumenus.net';
const EMAIL    = 'admin@medicosts.app';
const PASSWORD = 'Admin2024';
const SS_DIR   = path.join(__dirname, '../audit-screenshots');

// Correct paths from App.jsx
const ROUTES = [
  { path: '/overview',                  name: 'Overview' },
  { path: '/hospitals',                 name: 'Hospital Explorer' },
  { path: '/hospitals/670055',          name: 'Hospital Detail' },
  { path: '/compare',                   name: 'Compare (empty)' },
  { path: '/compare?h=670055&h=050625', name: 'Compare (2 hospitals)' },
  { path: '/drugs',                     name: 'Drug Spending' },
  { path: '/drugs/HUMIRA',              name: 'Drug Detail (HUMIRA)' },
  { path: '/quality',                   name: 'Quality Command Center' },
  { path: '/accountability',            name: 'Accountability Dashboard' },
  { path: '/spending',                  name: 'Spending & Value' },
  { path: '/payments',                  name: 'Payments Explorer' },
  { path: '/clinicians',               name: 'Clinician Directory' },
  { path: '/clinicians/1003000126',     name: 'Clinician Profile' },
  { path: '/geography',                name: 'Geographic Analysis' },
  { path: '/post-acute',               name: 'Post-Acute Care' },
  { path: '/nursing-homes/015009',     name: 'Nursing Home Detail' },
  { path: '/estimate',                 name: 'Cost Estimator' },
  { path: '/excellence',               name: 'Excellence View' },
  { path: '/trends',                   name: 'Cost Trends' },
  { path: '/physicians',               name: 'Physician Analytics' },
  { path: '/financials',               name: 'Financials Explorer' },
  { path: '/connectors',              name: 'Data Connectors' },
  { path: '/settings',                name: 'Settings' },
  { path: '/about',                   name: 'About' },
  { path: '/transparency',            name: 'Transparency Scorecard' },
  { path: '/abby',                    name: 'Abby AI' },
  { path: '/blog',                    name: 'Blog' },
  { path: '/for-patients',            name: 'For Patients' },
  { path: '/ai-providers',            name: 'AI Providers' },
  // Confirm catch-all redirects properly (not a broken page)
  { path: '/nonexistent-xyz',         name: 'Unknown route (expect redirect)', expectError: true },
];

// Noise to suppress (not real bugs)
const IGNORE_API = [
  '/api/abby/sessions',
  '/api/abby/suggestions',
];

const IGNORE_JS = [
  /favicon/i,
  /gtag/i,
  /google-analytics/i,
  /ResizeObserver loop/i,
  /Non-Error promise rejection/i,
  /429/,              // Abby rate-limit noise
];

function shouldIgnoreApi(url) {
  return IGNORE_API.some(p => url.includes(p));
}
function shouldIgnoreJs(msg) {
  return IGNORE_JS.some(r => r.test(msg));
}

async function getToken() {
  // Get token via Node's http (not Playwright page.request, to avoid rate-limit sharing)
  const https = require('https');
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ email: EMAIL, password: PASSWORD });
    const req = https.request({
      hostname: new URL(BASE_URL).hostname,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data).token || null); }
        catch { resolve(null); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function login(page) {
  const token = await getToken();
  if (!token) {
    console.warn('  Could not obtain auth token — results will show auth failures');
    return;
  }

  // Navigate to the site first so localStorage is set on the right origin
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(500);

  // Inject token into localStorage
  await page.evaluate((t) => localStorage.setItem('authToken', t), token);

  // Reload so the React app picks up the token and calls /api/auth/me
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  console.log('  Token injected and page reloaded');
}

async function auditRoute(page, route) {
  const result = {
    path: route.path,
    name: route.name,
    status: 'ok',
    consoleErrors: [],
    failedRequests: [],
    warnings: [],
  };

  const errors = [];
  const failed = [];

  const onConsole = (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!shouldIgnoreJs(text)) errors.push(text);
    }
  };
  const onResponse = (response) => {
    const url = response.url();
    const status = response.status();
    if (url.includes('/api/') && status >= 400 && !shouldIgnoreApi(url)) {
      failed.push(`${status} ${url.replace(BASE_URL, '')}`);
    }
  };

  page.on('console', onConsole);
  page.on('response', onResponse);

  try {
    await page.goto(`${BASE_URL}${route.path}`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });

    // Wait for React + data fetches to settle
    await page.waitForTimeout(4000);

    const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');

    // Error boundary / JS crash
    if (/something went wrong/i.test(bodyText)) {
      result.status = 'error';
      result.warnings.push('Error boundary triggered — JS crash on page');
    }

    // Chunk load failure
    if (/chunk load error|loading chunk/i.test(bodyText)) {
      result.status = 'error';
      result.warnings.push('Chunk load error — stale build asset');
    }

    // Redirected to login (unauthenticated)
    const url = page.url();
    if (url.includes('/login') || url.endsWith('/') && route.path !== '/') {
      result.status = 'error';
      result.warnings.push('Redirected to login — authentication not working');
    }

    // [object Object] rendering bug
    if (/\[object Object\]/.test(bodyText)) {
      result.warnings.push('Found [object Object] in rendered text — rendering bug');
      if (result.status === 'ok') result.status = 'warn';
    }

    // Skeletons still showing after 4s (likely auth failure or API error)
    const skeletonCount = await page.locator('[class*="skeleton"], [class*="Skeleton"]').count();
    if (skeletonCount > 5) {
      result.warnings.push(`${skeletonCount} loading skeletons still visible — API may be failing`);
      if (result.status === 'ok') result.status = 'warn';
    }

    // Screenshot
    const ssName = route.path.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'root';
    const ssPath = path.join(SS_DIR, `${ssName}.png`);
    await page.screenshot({ path: ssPath, fullPage: false });

  } catch (err) {
    result.status = 'error';
    result.warnings.push(`Navigation/timeout: ${err.message.split('\n')[0]}`);
  }

  page.off('console', onConsole);
  page.off('response', onResponse);

  result.consoleErrors = errors;
  result.failedRequests = failed;

  if ((errors.length > 0 || failed.length > 0) && result.status === 'ok') {
    result.status = 'warn';
  }

  return result;
}

function renderReport(results) {
  const lines = [];
  lines.push('='.repeat(72));
  lines.push('  MEDICOSTS SITE AUDIT REPORT');
  lines.push(`  ${new Date().toISOString()}`);
  lines.push('='.repeat(72));

  const ok   = results.filter(r => r.status === 'ok').length;
  const warn = results.filter(r => r.status === 'warn').length;
  const err  = results.filter(r => r.status === 'error').length;

  lines.push(`\nSUMMARY: ${results.length} pages — ${ok} OK  ${warn} WARN  ${err} ERROR\n`);

  // Errors first
  const errResults = results.filter(r => r.status === 'error');
  const warnResults = results.filter(r => r.status === 'warn');
  const okResults   = results.filter(r => r.status === 'ok');

  if (errResults.length) {
    lines.push('── ERRORS ─────────────────────────────────────────────────────────');
    for (const r of errResults) {
      lines.push(`✗  ${r.name.padEnd(35)} ${r.path}`);
      r.warnings.forEach(w => lines.push(`     [warn]  ${w}`));
      r.failedRequests.forEach(f => lines.push(`     [api]   ${f}`));
      r.consoleErrors.slice(0, 3).forEach(e => lines.push(`     [js]    ${e.slice(0, 120)}`));
    }
    lines.push('');
  }

  if (warnResults.length) {
    lines.push('── WARNINGS ────────────────────────────────────────────────────────');
    for (const r of warnResults) {
      lines.push(`⚠  ${r.name.padEnd(35)} ${r.path}`);
      r.warnings.forEach(w => lines.push(`     [warn]  ${w}`));
      r.failedRequests.forEach(f => lines.push(`     [api]   ${f}`));
      r.consoleErrors.slice(0, 2).forEach(e => lines.push(`     [js]    ${e.slice(0, 120)}`));
    }
    lines.push('');
  }

  if (okResults.length) {
    lines.push('── OK ──────────────────────────────────────────────────────────────');
    for (const r of okResults) {
      lines.push(`✓  ${r.name.padEnd(35)} ${r.path}`);
    }
  }

  lines.push('\n' + '='.repeat(72));
  return lines.join('\n');
}

(async () => {
  fs.mkdirSync(SS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  console.log('\nLogging in...');
  await login(page);

  const results = [];
  for (const route of ROUTES) {
    process.stdout.write(`  ${route.name.padEnd(38)}`);
    const result = await auditRoute(page, route);
    results.push(result);
    const icon = result.status === 'ok' ? '✓' : result.status === 'warn' ? '⚠' : '✗';
    console.log(icon);
  }

  await browser.close();

  const report = renderReport(results);
  console.log('\n' + report);

  const reportPath = path.join(__dirname, '../audit-report.txt');
  fs.writeFileSync(reportPath, report);
  console.log(`\nReport saved: ${reportPath}`);
  console.log(`Screenshots:  ${SS_DIR}/`);
})();
