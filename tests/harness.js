/**
 * Shared helpers for test files.
 *
 * Each test file exports `async function run(page)` and receives a fresh
 * page from the runner (tests/run-all.js), which owns the single shared
 * `npx serve` server and the single shared browser.
 */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Throw a test failure. The runner catches it and marks the file as failed. */
function fail(message) {
  throw new Error(message);
}

module.exports = { sleep, fail };
