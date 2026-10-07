const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Set mobile viewport (iPhone SE - 375x667)
  await page.setViewport({ width: 375, height: 667 });

  // Test URLs
  const urls = [
    'http://localhost:3002/boutique-test/cart',
    'http://localhost:3002/boutique-test',
  ];

  for (const url of urls) {
    console.log(`Testing: ${url}`);
    try {
      await page.goto(url, { waitUntil: 'networkidle2' });
      const filename = `/tmp/mobile-${url.split('/').pop() || 'home'}.png`;
      await page.screenshot({ path: filename });
      console.log(`✓ Screenshot saved: ${filename}`);
    } catch (e) {
      console.error(`✗ Error testing ${url}:`, e.message);
    }
  }

  await browser.close();
})();
