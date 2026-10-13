// Screenshot helper for visual-debugging mode.
// Captures a screenshot of the running game for before/after comparison.
//
// Usage:
//   node scripts/screenshot.js --url http://localhost:8080 --out debug-baseline.png
//   node scripts/screenshot.js --url http://localhost:8080 --out debug-fixed.png --wait 2000
//
// Requires: playwright (already in devDependencies for tests/)

const { chromium } = require('playwright');
const path = require('path');

function parseArgs() {
    const args = process.argv.slice(2);
    const out = { url: 'http://localhost:8080', out: 'screenshot.png', wait: 1000 };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--url' && args[i + 1]) out.url = args[++i];
        else if (args[i] === '--out' && args[i + 1]) out.out = args[++i];
        else if (args[i] === '--wait' && args[i + 1]) out.wait = parseInt(args[++i], 10);
    }
    return out;
}

(async () => {
    const { url, out, wait } = parseArgs();
    const outPath = path.resolve(out);
    console.log(`Loading ${url}...`);
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    page.on('console', msg => {
        if (msg.type() === 'error') console.log('[page error]', msg.text());
    });
    page.on('pageerror', err => console.log('[page crash]', err.message));
    await page.goto(url, { waitUntil: 'networkidle' });
    // Wait for the game to render (adjust if your game needs longer).
    await page.waitForTimeout(wait);
    await page.screenshot({ path: outPath });
    console.log(`Saved to ${outPath}`);
    await browser.close();
})().catch(err => {
    console.error('Screenshot failed:', err.message);
    console.error('Is the dev server running? Is playwright installed? (npx playwright install)');
    process.exit(1);
});
