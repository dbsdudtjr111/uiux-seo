#!/usr/bin/env node
/**
 * uiux-seo 자동 인터랙션·접근성 실측 스크립트 (토큰 소모 0)
 * - 모바일(390x844) 가로 스크롤(scrollWidth > clientWidth) 검사
 * - 키보드 Tab 포커스 링 가시성 검사
 * - 탭/필터/아코디언 전환 및 에러 여부 확인
 * - 초기 상태 및 전환 후 @axe-core/playwright WCAG 접근성 검사
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

function findChrome() {
  for (const p of CHROME_CANDIDATES) {
    if (p && fs.existsSync(p)) return p;
  }
  return undefined;
}

function slugify(url) {
  return url.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80) || "root";
}

function summarizeAxe(results) {
  return (results.violations || []).map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.length,
    sample: v.nodes[0]?.target?.join(" ") || "",
  }));
}

async function checkHorizontalOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const sw = doc.scrollWidth;
    const cw = doc.clientWidth;
    const offenders = [];
    if (sw > cw) {
      for (const el of document.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.right > cw + 2 && r.width > 0 && r.height > 0) {
          offenders.push({
            tag: el.tagName.toLowerCase(),
            cls: String(el.className || "").slice(0, 60),
            right: Math.round(r.right),
          });
          if (offenders.length >= 5) break;
        }
      }
    }
    return { scrollWidth: sw, clientWidth: cw, overflow: sw > cw, offenders };
  });
}

async function checkKeyboardFocusRings(page, maxTabs = 15) {
  const checked = [];
  const missingRing = [];
  await page.evaluate(() => document.body.focus());
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) return null;
      const st = getComputedStyle(el);
      const hasOutline = st.outlineStyle !== "none" && parseFloat(st.outlineWidth || "0") > 0;
      const hasShadow = st.boxShadow !== "none" && st.boxShadow !== "";
      return {
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30),
        hasVisibleFocus: hasOutline || hasShadow,
      };
    });
    if (!info) break;
    checked.push(info);
    if (!info.hasVisibleFocus) missingRing.push(info);
  }
  return { tested: checked.length, missingRingCount: missingRing.length, missingSamples: missingRing.slice(0, 5) };
}

async function testInteractiveControls(page) {
  // 폼 제출/전화 링크/외부 이동은 제외하고 탭·필터·아코디언만 최대 6개 클릭
  const selectors = [
    'button[aria-pressed]',
    '[role="tab"]',
    'details > summary',
    'button:not([type="submit"])',
  ];
  const clicked = [];
  const postClickViolations = [];
  const seen = new Set();

  for (const sel of selectors) {
    const loc = page.locator(sel);
    const count = Math.min(await loc.count(), 4);
    for (let i = 0; i < count; i++) {
      if (clicked.length >= 6) break;
      const el = loc.nth(i);
      const visible = await el.isVisible().catch(() => false);
      if (!visible) continue;
      const label = ((await el.textContent().catch(() => "")) || (await el.getAttribute("aria-label").catch(() => "")) || "").trim().slice(0, 30);
      if (!label || /상담|전화|로그인|닫기|메뉴/.test(label) || seen.has(label)) continue;
      seen.add(label);
      const beforeTextLen = await page.evaluate(() => document.body.innerText.length);
      await el.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(250);
      const afterTextLen = await page.evaluate(() => document.body.innerText.length);
      clicked.push({ label, selector: sel, domChanged: beforeTextLen !== afterTextLen });
      if (clicked.length === 1 || clicked.length === 3) {
        const axeAfter = await new AxeBuilder({ page }).analyze().catch(() => null);
        if (axeAfter?.violations?.length) {
          postClickViolations.push({ afterClick: label, violations: summarizeAxe(axeAfter) });
        }
      }
    }
  }
  return { clicked, postClickViolations };
}

async function auditUrl(browser, url) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 120)); });
  page.on("pageerror", (err) => pageErrors.push(String(err).slice(0, 120)));

  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(500);

  const overflow = await checkHorizontalOverflow(page);
  const axeInitial = summarizeAxe(await new AxeBuilder({ page }).analyze());
  const focus = await checkKeyboardFocusRings(page, 15);
  const interaction = await testInteractiveControls(page);

  await ctx.close();
  return {
    url,
    overflow,
    focus,
    axeInitialCount: axeInitial.length,
    axeInitial,
    interaction,
    consoleErrorCount: consoleErrors.length,
    pageErrorCount: pageErrors.length,
    consoleErrors: consoleErrors.slice(0, 3),
    pageErrors: pageErrors.slice(0, 3),
  };
}

async function main() {
  const args = process.argv.slice(2);
  let outDir = "audit-out";
  const urls = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out" && args[i + 1]) {
      outDir = args[++i];
    } else if (!args[i].startsWith("--")) {
      urls.push(args[i]);
    }
  }
  if (urls.length === 0) {
    console.error("Usage: node scripts/audit_interaction.mjs <url1> [url2 ...] [--out dir]");
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const executablePath = findChrome();
  const browser = await chromium.launch({ headless: true, executablePath });
  const results = [];

  try {
    for (const url of urls) {
      const row = await auditUrl(browser, url);
      results.push(row);
      const outPath = path.join(outDir, `${slugify(url)}.interaction.json`);
      fs.writeFileSync(outPath, JSON.stringify(row, null, 2), "utf-8");
      console.log(JSON.stringify({
        url,
        overflow: row.overflow.overflow,
        focusMissing: `${row.focus.missingRingCount}/${row.focus.tested}`,
        axeInitial: row.axeInitialCount,
        clicked: row.interaction.clicked.length,
        errors: row.consoleErrorCount + row.pageErrorCount,
      }));
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
