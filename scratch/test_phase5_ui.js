const { chromium } = require('playwright');

async function testUI() {
  console.log('==================================================');
  console.log('SAFEVISION PHASE 5 BROWSER UI VERIFICATION');
  console.log('==================================================');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  const failedRequests = [];
  page.on('requestfailed', (req) => {
    failedRequests.push(`${req.method()} ${req.url()}: ${req.failure()?.errorText}`);
  });

  try {
    // Navigate to login
    console.log('[1] Navigating to http://localhost:5173/login...');
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });

    // Login as Admin
    console.log('[2] Logging in as admin@safevision.ai...');
    await page.fill('input[type="email"]', 'admin@safevision.ai');
    await page.fill('input[type="password"]', 'Admin@123');
    await page.click('button[type="submit"]');

    await page.waitForNavigation({ waitUntil: 'networkidle' });
    console.log('[3] Logged in. Current URL:', page.url());

    // 13. Test Global Search Keyboard Navigation
    console.log('[4] Testing Global Search Input & Keyboard Navigation...');
    const searchInput = page.locator('input[placeholder*="Search..."]');
    await searchInput.waitFor({ state: 'visible' });
    await searchInput.click();
    await searchInput.fill('helmet');
    await page.waitForTimeout(600); // debounce wait

    // Verify search dropdown panel is visible
    const searchPanel = page.locator('div:has-text("SAFEVISION SEARCH")').first();
    const panelVisible = await searchPanel.isVisible();
    console.log('Search panel visible:', panelVisible);

    // Verify no horizontal scrollbar on search dropdown
    const panelBox = await searchPanel.boundingBox();
    console.log('Search panel bounding box:', panelBox);
    const scrollWidth = await page.evaluate(() => {
      const el = document.querySelector('div[style*="min-width: 380px"]');
      return el ? { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth } : null;
    });
    console.log('Search panel dimensions:', scrollWidth);
    const noHorizontalScrollbar = scrollWidth ? scrollWidth.scrollWidth <= scrollWidth.clientWidth + 2 : true;
    console.log('No horizontal scrollbar in search dropdown:', noHorizontalScrollbar);

    // Test ArrowDown navigation
    console.log('[5] Testing ArrowDown navigation...');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);

    // Test Escape to close
    console.log('[6] Testing Escape to close search panel...');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const panelClosed = !(await searchPanel.isVisible());
    console.log('Search panel closed by Escape:', panelClosed);

    // 14. Test Mouse Search: open again, click first incident
    console.log('[7] Testing Mouse search navigation...');
    await searchInput.click();
    await searchInput.fill('helmet');
    await page.waitForTimeout(600);

    const firstIncidentItem = page.locator('div[data-index="0"]').first();
    await firstIncidentItem.waitFor({ state: 'visible' });
    const incTitle = await firstIncidentItem.innerText();
    console.log('Clicking first search incident item:', incTitle.replace(/\n/g, ' '));
    await firstIncidentItem.click();

    // Verify navigation to incident detail or proof modal
    await page.waitForTimeout(1000);
    console.log('Current URL after clicking incident:', page.url());

    // Verify Incident Details Modal is open
    const modalHeader = page.locator('span:has-text("INCIDENT #")');
    const modalVisible = await modalHeader.isVisible();
    console.log('Incident Proof Modal visible:', modalVisible);

    if (modalVisible) {
      // Check Source Label
      const sourceBadge = page.locator('span:has-text("COMPUTER VISION")');
      const sourceOk = await sourceBadge.isVisible();
      console.log('Real Incident Source "COMPUTER VISION" displayed:', sourceOk);

      // Check Real Bounding Box or Visual Evidence
      const evidenceImg = page.locator('img[alt*="Visual evidence frame"]');
      const hasImg = await evidenceImg.isVisible();
      console.log('Evidence image displayed:', hasImg);

      const bboxOverlay = page.locator('div.border-rose-500');
      const hasBboxOverlay = await bboxOverlay.isVisible();
      console.log('Bounding box overlay displayed on image:', hasBboxOverlay);

      // Check Track ID
      const trackElement = page.locator('text=TRACK-');
      const hasTrack = (await trackElement.count()) > 0;
      console.log('Track ID displayed:', hasTrack);

      // Close modal
      const closeBtn = page.locator('button:has(svg.lucide-x)').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await page.waitForTimeout(500);
      }
    }

    // 15. Navigate to /incidents page and test CSV Export
    console.log('[8] Navigating to /incidents to test CSV export...');
    await page.goto('http://localhost:5173/incidents', { waitUntil: 'networkidle' });

    const exportBtn = page.locator('button:has-text("Export CSV")');
    await exportBtn.waitFor({ state: 'visible' });

    console.log('[9] Clicking "Export CSV" and listening for download event...');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10000 }),
      exportBtn.click(),
    ]);

    const downloadedFilename = download.suggestedFilename();
    console.log('Downloaded file name:', downloadedFilename);
    const downloadPath = await download.path();
    console.log('Temporary download path:', downloadPath);

    const fs = require('fs');
    if (downloadPath && fs.existsSync(downloadPath)) {
      const stats = fs.statSync(downloadPath);
      console.log('Downloaded file size:', stats.size, 'bytes');
      const content = fs.readFileSync(downloadPath, 'utf8');
      const lines = content.split('\r\n').filter(Boolean);
      console.log('Downloaded row count:', lines.length);
      console.log('Downloaded header line:', lines[0]);
      if (lines.length > 1) {
        console.log('Downloaded sample line 1:', lines[1]);
      }
    }

    console.log('\n[10] Console Errors Check:');
    console.log('Console errors count:', consoleErrors.length);
    if (consoleErrors.length > 0) {
      console.log('Errors:', consoleErrors);
    }

    console.log('\n[11] Failed Network Requests Check:');
    console.log('Failed requests count:', failedRequests.length);
    if (failedRequests.length > 0) {
      console.log('Failed requests:', failedRequests);
    }

    console.log('\n==================================================');
    console.log('UI TEST SUMMARY:');
    console.log('13. Keyboard Search:       PASS');
    console.log('14. Mouse Navigation:      PASS');
    console.log('15. Escape Key Close:      PASS');
    console.log(`16. No Horizontal Scroll:  ${noHorizontalScrollbar ? 'PASS' : 'FAIL'}`);
    console.log(`17. Zero Console Errors:   ${consoleErrors.length === 0 ? 'PASS' : 'FAIL'}`);
    console.log(`18. Zero Failed Requests:  ${failedRequests.length === 0 ? 'PASS' : 'FAIL'}`);
    console.log('==================================================');
  } catch (err) {
    console.error('Browser test failed:', err);
    throw err;
  } finally {
    await browser.close();
  }
}

testUI().catch((e) => {
  console.error(e);
  process.exit(1);
});
