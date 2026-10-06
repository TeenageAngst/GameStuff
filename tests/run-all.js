#!/usr/bin/env node
/**
 * Test runner: one shared `npx serve` server + one shared browser,
 * a fresh page per test file.
 *
 * Each tests/*.test.js file exports `async function run(page)`.
 *
 * Usage: node tests/run-all.js [filter]
 *   filter: optional substring; only run test files whose name contains it.
 *
 * Exits 0 if all tests pass, 1 if any fail.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, execSync } = require('child_process');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const filter = process.argv[2] || '';

const files = fs
  .readdirSync(__dirname)
  .filter((f) => f.endsWith('.test.js'))
  .filter((f) => f.includes(filter))
  .sort();

if (files.length === 0) {
  console.error(`No test files found${filter ? ` matching "${filter}"` : ''}.`);
  process.exit(1);
}

/** Poll the server until it responds, or time out. */
function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function poll() {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Server did not become ready at ${url}`));
        } else {
          setTimeout(poll, 250);
        }
      });
    })();
  });
}

/** Kill the server and its whole process tree (npx spawns a child). */
function killServer(server) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(server.pid, 'SIGTERM');
    }
  } catch {
    // already dead
  }
}

(async () => {
  const server = spawn('npx', ['serve', '.'], {
    cwd: root,
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });

  let browser;
  try {
    await waitForServer('http://localhost:3000');
    browser = await chromium.launch();

    console.log(`\nRunning ${files.length} test file(s) (shared server + browser)...\n`);

    const results = [];
    for (const file of files) {
      process.stdout.write(`\n=== ${file} ===\n`);
      const { run } = require(path.join(__dirname, file));
      const page = await browser.newPage();
      let ok = true;
      try {
        await run(page);
      } catch (e) {
        ok = false;
        console.error(`FAIL: ${e.message}`);
      } finally {
        await page.close();
      }
      results.push({ file, ok });
    }

    console.log('\n' + '='.repeat(50));
    console.log('SUMMARY');
    console.log('='.repeat(50));
    for (const r of results) {
      console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.file}`);
    }
    console.log('='.repeat(50));
    const passed = results.filter((r) => r.ok).length;
    console.log(`${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
  } catch (e) {
    console.error('Runner error:', e.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    killServer(server);
  }
})();
