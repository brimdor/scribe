#!/usr/bin/env node

/**
 * Test Report Generator — Agentic AI Overhaul (Feature 009)
 *
 * Runs unit, integration, and E2E test suites, parses results,
 * and produces a quantifiable 0-5 rating for each category.
 *
 * Usage:
 *   node scripts/test-report.js          # Run all suites and report
 *   node scripts/test-report.js --skip   # Report from last results (no re-run)
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const REPORT_DIR = path.join(ROOT, 'test-reports');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function run(cmd, opts = {}) {
  try {
    const output = execSync(cmd, {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300_000,
      ...opts,
    });
    return { success: true, output };
  } catch (error) {
    return {
      success: false,
      output: (error.stdout || '') + '\n' + (error.stderr || ''),
    };
  }
}

// ---------------------------------------------------------------------------
// Suite runners
// ---------------------------------------------------------------------------

function runUnitTests() {
  console.log('\n--- Running unit tests ---');
  const result = run('npx vitest run --reporter=json src/services/__tests__/ 2>&1');
  return parseVitestJson(result, 'unit');
}

function runIntegrationTests() {
  console.log('\n--- Running integration tests ---');
  const result = run('npx vitest run --reporter=json tests/integration/ 2>&1');
  return parseVitestJson(result, 'integration');
}

function runE2ETests() {
  console.log('\n--- Running E2E tests ---');
  const result = run('npx playwright test --reporter=json 2>&1');
  return parsePlaywrightJson(result, 'e2e');
}

// ---------------------------------------------------------------------------
// Result parsers
// ---------------------------------------------------------------------------

function parseVitestJson(result, category) {
  const { output } = result;
  const summary = { category, total: 0, passed: 0, failed: 0, skipped: 0, errors: [] };

  // Try to extract JSON from vitest output
  const jsonMatch = output.match(/\{[\s\S]*"testResults"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const json = JSON.parse(jsonMatch[0]);
      for (const file of json.testResults || []) {
        for (const assertion of file.assertionResults || []) {
          summary.total++;
          if (assertion.status === 'passed') {
            summary.passed++;
          } else if (assertion.status === 'failed') {
            summary.failed++;
            summary.errors.push(`${assertion.fullName}: ${(assertion.failureMessages || []).join('; ')}`);
          } else {
            summary.skipped++;
          }
        }
      }
      return summary;
    } catch {
      // Fall through to line-based parsing
    }
  }

  // Fallback: parse summary line from text output
  // Example: "Tests  12 passed (12)"
  const passMatch = output.match(/(\d+)\s+passed/);
  const failMatch = output.match(/(\d+)\s+failed/);
  const skipMatch = output.match(/(\d+)\s+skipped/);

  summary.passed = passMatch ? parseInt(passMatch[1], 10) : 0;
  summary.failed = failMatch ? parseInt(failMatch[1], 10) : 0;
  summary.skipped = skipMatch ? parseInt(skipMatch[1], 10) : 0;
  summary.total = summary.passed + summary.failed + summary.skipped;

  if (!result.success && summary.total === 0) {
    summary.errors.push('Test runner failed to execute. Check output above.');
  }

  return summary;
}

function parsePlaywrightJson(result, category) {
  const { output } = result;
  const summary = { category, total: 0, passed: 0, failed: 0, skipped: 0, errors: [] };

  // Try to extract Playwright JSON
  const jsonMatch = output.match(/\{[\s\S]*"suites"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const json = JSON.parse(jsonMatch[0]);
      function walkSuites(suites) {
        for (const suite of suites || []) {
          for (const spec of suite.specs || []) {
            for (const test of spec.tests || []) {
              summary.total++;
              const status = test.status || test.results?.[0]?.status;
              if (status === 'expected' || status === 'passed') {
                summary.passed++;
              } else if (status === 'skipped') {
                summary.skipped++;
              } else {
                summary.failed++;
                summary.errors.push(`${spec.title}: ${status}`);
              }
            }
          }
          walkSuites(suite.suites);
        }
      }
      walkSuites(json.suites);
      return summary;
    } catch {
      // Fall through
    }
  }

  // Fallback: line-based parsing
  const passMatch = output.match(/(\d+)\s+passed/);
  const failMatch = output.match(/(\d+)\s+failed/);
  const skipMatch = output.match(/(\d+)\s+skipped/);

  summary.passed = passMatch ? parseInt(passMatch[1], 10) : 0;
  summary.failed = failMatch ? parseInt(failMatch[1], 10) : 0;
  summary.skipped = skipMatch ? parseInt(skipMatch[1], 10) : 0;
  summary.total = summary.passed + summary.failed + summary.skipped;

  if (!result.success && summary.total === 0) {
    summary.errors.push('E2E runner failed to execute. Check output above.');
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Rating calculation
// ---------------------------------------------------------------------------

/**
 * Compute a 0-5 rating from test results.
 *
 * Scoring rules:
 *   5 — 100% pass rate
 *   4 — >= 90% pass rate
 *   3 — >= 75% pass rate
 *   2 — >= 50% pass rate
 *   1 — >= 25% pass rate or at least some tests run
 *   0 — no tests ran or suite failed to execute
 */
function computeRating(summary) {
  if (summary.total === 0) return 0;
  const rate = summary.passed / summary.total;
  if (rate >= 1.0) return 5;
  if (rate >= 0.9) return 4;
  if (rate >= 0.75) return 3;
  if (rate >= 0.5) return 2;
  if (rate >= 0.25) return 1;
  return summary.total > 0 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function generateReport(results) {
  const timestamp = new Date().toISOString();
  const overallPassed = results.every((r) => computeRating(r) >= 4);

  const lines = [
    '# Test Report — 009-agentic-overhaul',
    '',
    `Generated: ${timestamp}`,
    `Overall: ${overallPassed ? 'PASS' : 'FAIL'}`,
    '',
    '## Category Ratings',
    '',
    '| Category | Tests | Passed | Failed | Skipped | Pass Rate | Rating | Status |',
    '|----------|-------|--------|--------|---------|-----------|--------|--------|',
  ];

  for (const result of results) {
    const rating = computeRating(result);
    const passRate = result.total > 0 ? ((result.passed / result.total) * 100).toFixed(1) : '0.0';
    const status = rating >= 4 ? 'PASS' : 'FAIL';
    lines.push(
      `| ${result.category} | ${result.total} | ${result.passed} | ${result.failed} | ${result.skipped} | ${passRate}% | ${rating}/5 | ${status} |`,
    );
  }

  lines.push('');

  // Error details
  const allErrors = results.flatMap((r) => r.errors.map((e) => `[${r.category}] ${e}`));
  if (allErrors.length > 0) {
    lines.push('## Errors');
    lines.push('');
    for (const err of allErrors) {
      lines.push(`- ${err}`);
    }
    lines.push('');
  }

  // Acceptance criteria summary
  lines.push('## Acceptance Criteria');
  lines.push('');
  lines.push('All test categories must achieve a rating of **4/5 or higher** (>= 90% pass rate).');
  lines.push('');
  for (const result of results) {
    const rating = computeRating(result);
    const mark = rating >= 4 ? '[x]' : '[ ]';
    lines.push(`- ${mark} **${result.category}**: ${rating}/5 (${rating >= 4 ? 'meets' : 'does not meet'} minimum)`);
  }
  lines.push('');
  lines.push(`**Overall verdict: ${overallPassed ? 'PASS — All categories meet acceptance criteria.' : 'FAIL — One or more categories below minimum rating.'}**`);
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const skipRun = process.argv.includes('--skip');

console.log('=== Scribe Test Report Generator ===');
console.log(`Mode: ${skipRun ? 'report-only (no re-run)' : 'full run + report'}`);

const results = [];

if (skipRun) {
  console.log('\n--skip mode: generating report from last known results.');
  // Create placeholder results when skipping
  results.push(
    { category: 'unit', total: 0, passed: 0, failed: 0, skipped: 0, errors: ['Skipped — use without --skip to run'] },
    { category: 'integration', total: 0, passed: 0, failed: 0, skipped: 0, errors: ['Skipped — use without --skip to run'] },
    { category: 'e2e', total: 0, passed: 0, failed: 0, skipped: 0, errors: ['Skipped — use without --skip to run'] },
  );
} else {
  results.push(runUnitTests());
  results.push(runIntegrationTests());
  results.push(runE2ETests());
}

const report = generateReport(results);

ensureDir(REPORT_DIR);
const reportFile = path.join(REPORT_DIR, 'test-report.md');
fs.writeFileSync(reportFile, report, 'utf-8');

console.log('\n' + report);
console.log(`\nReport saved to: ${reportFile}`);

// Exit with non-zero code if any category fails
const overallPass = results.every((r) => computeRating(r) >= 4);
process.exit(overallPass ? 0 : 1);
