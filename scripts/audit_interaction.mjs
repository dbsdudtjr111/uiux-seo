#!/usr/bin/env node
/**
 * uiux-seo 자동 인터랙션·레이아웃·가독성·접근성 실측 스크립트 (토큰 소모 0)
 * - 모바일(390x844) 가로 스크롤(scrollWidth > clientWidth) 검사
 * - 키보드 Tab 포커스 링 가시성 검사
 * - 탭/필터/아코디언 전환 및 에러 여부 확인
 * - 초기 상태 및 전환 후 @axe-core/playwright WCAG 접근성 검사
 * - 고정(fixed) 요소 간 겹침, 깨진 이미지, raw 기호 아이콘(^, v, ⌄) 탐지
 * - <details> 아코디언 모두 펼친 후 <p> 글자 수(250자↑)·렌더링 줄 수(6줄↑) 텍스트 벽 탐지
 * - 선택(--critique-shots): 초기 전체 구간(800px 간격) + <details> 펼침 상태 스크린샷 저장
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

async function checkFixedOverlapsAndMedia(page) {
  return page.evaluate(() => {
    const fixedEls = [];
    for (const el of document.querySelectorAll("*")) {
      const st = getComputedStyle(el);
      if (st.position !== "fixed") continue;
      if (st.display === "none" || st.visibility === "hidden" || parseFloat(st.opacity || "1") === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      // pointer-events: none 인 투명 래퍼 대신 실제 클릭/표시 대상만 비교
      if (st.pointerEvents === "none" && el.children.length > 0) continue;
      fixedEls.push({
        label: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 30),
        rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
      });
    }
    const fixedOverlaps = [];
    for (let i = 0; i < fixedEls.length; i++) {
      for (let j = i + 1; j < fixedEls.length; j++) {
        const a = fixedEls[i].rect;
        const b = fixedEls[j].rect;
        const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        if (ix > 4 && iy > 4) {
          fixedOverlaps.push({ a: fixedEls[i].label, b: fixedEls[j].label, area: Math.round(ix * iy) });
        }
      }
    }

    const brokenImages = [];
    for (const img of document.querySelectorAll("img")) {
      const r = img.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (img.complete && img.naturalWidth === 0) {
        brokenImages.push({ src: (img.getAttribute("src") || "").slice(0, 80), alt: (img.getAttribute("alt") || "").slice(0, 30) });
      }
    }

    const rawSymbolIcons = [];
    const symbolRe = /^[\^v⌄⌃]$/;
    for (const el of document.querySelectorAll("button span, summary span, a span")) {
      const txt = (el.textContent || "").trim();
      if (symbolRe.test(txt)) {
        rawSymbolIcons.push({ symbol: txt, parent: (el.parentElement?.textContent || "").trim().slice(0, 40) });
      }
    }

    return { fixedOverlaps, brokenImages, rawSymbolIcons };
  });
}

async function expandDetailsAndCheckTextWalls(page) {
  // 모든 <details> 를 열어 접힌 내부 텍스트 벽까지 측정
  const detailsCount = await page.evaluate(() => {
    const list = document.querySelectorAll("details");
    list.forEach((d) => { d.open = true; });
    return list.length;
  });
  await page.waitForTimeout(150);

  const textWalls = await page.evaluate(() => {
    const hits = [];
    for (const p of document.querySelectorAll("p")) {
      const st = getComputedStyle(p);
      if (st.display === "none" || st.visibility === "hidden") continue;
      const r = p.getBoundingClientRect();
      if (r.height <= 0 || r.width <= 0) continue;
      const text = (p.textContent || "").trim();
      const chars = text.length;
      const fs = parseFloat(st.fontSize || "14");
      const lh = parseFloat(st.lineHeight) || fs * 1.5;
      const lines = Math.round(r.height / lh);
      if (chars >= 250 || lines >= 6) {
        hits.push({
          chars,
          lines,
          heightPx: Math.round(r.height),
          snippet: text.slice(0, 60),
        });
      }
    }
    return hits;
  });
  return { detailsExpanded: detailsCount, textWallCount: textWalls.length, textWalls: textWalls.slice(0, 10) };
}

async function captureCritiqueShots(page, outDir, name) {
  const shotDir = path.join(outDir, "shots", name);
  fs.mkdirSync(shotDir, { recursive: true });
  const saved = [];
  const h = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0, idx = 0; y < h; y += 800, idx++) {
    await page.evaluate((pos) => window.scrollTo(0, pos), y);
    await page.waitForTimeout(150);
    const fp = path.join(shotDir, `init_${idx}_y${y}.png`);
    await page.screenshot({ path: fp });
    saved.push(fp);
    if (idx >= 14) break;
  }
  return saved;
}

async function testInteractiveControls(page) {
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

async function auditUrl(browser, url, outDir, withShots) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 120)); });
  page.on("pageerror", (err) => pageErrors.push(String(err).slice(0, 120)));

  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(500);

  const name = slugify(url);
  const shots = withShots ? await captureCritiqueShots(page, outDir, name) : [];
  const overflow = await checkHorizontalOverflow(page);
  const layoutMedia = await checkFixedOverlapsAndMedia(page);
  const axeInitial = summarizeAxe(await new AxeBuilder({ page }).analyze());
  const focus = await checkKeyboardFocusRings(page, 15);
  const interaction = await testInteractiveControls(page);
  const expandedTextWalls = await expandDetailsAndCheckTextWalls(page);

  await ctx.close();
  return {
    url,
    overflow,
    focus,
    layoutMedia,
    expandedTextWalls,
    axeInitialCount: axeInitial.length,
    axeInitial,
    interaction,
    shotsCount: shots.length,
    consoleErrorCount: consoleErrors.length,
    pageErrorCount: pageErrors.length,
    consoleErrors: consoleErrors.slice(0, 3),
    pageErrors: pageErrors.slice(0, 3),
  };
}

async function main() {
  const args = process.argv.slice(2);
  let outDir = "audit-out";
  let withShots = false;
  const urls = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out" && args[i + 1]) {
      outDir = args[++i];
    } else if (args[i] === "--critique-shots") {
      withShots = true;
    } else if (!args[i].startsWith("--")) {
      urls.push(args[i]);
    }
  }
  if (urls.length === 0) {
    console.error("Usage: node scripts/audit_interaction.mjs <url1> [url2 ...] [--out dir] [--critique-shots]");
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const executablePath = findChrome();
  const browser = await chromium.launch({ headless: true, executablePath });

  try {
    for (const url of urls) {
      const row = await auditUrl(browser, url, outDir, withShots);
      const outPath = path.join(outDir, `${slugify(url)}.interaction.json`);
      fs.writeFileSync(outPath, JSON.stringify(row, null, 2), "utf-8");
      console.log(JSON.stringify({
        url,
        overflow: row.overflow.overflow,
        focusMissing: `${row.focus.missingRingCount}/${row.focus.tested}`,
        fixedOverlaps: row.layoutMedia.fixedOverlaps.length,
        brokenImages: row.layoutMedia.brokenImages.length,
        rawSymbols: row.layoutMedia.rawSymbolIcons.length,
        textWalls: row.expandedTextWalls.textWallCount,
        axeInitial: row.axeInitialCount,
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
