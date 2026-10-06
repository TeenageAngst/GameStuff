const { fail } = require('./harness');

module.exports = {
  async run(page) {
    await page.goto('http://localhost:3000');
    await page.waitForSelector('canvas');
    const canvas = await page.$('canvas');
    const width = await canvas.evaluate((el) => el.width);
    const height = await canvas.evaluate((el) => el.height);

    if (width === 800 && height === 600) {
      console.log('PASS: Canvas initialized with correct dimensions (800x600)');
    } else {
      fail(`Canvas dimensions incorrect. Got ${width}x${height}, expected 800x600`);
    }
  },
};
