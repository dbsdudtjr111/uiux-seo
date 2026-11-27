#!/usr/bin/env python3
"""
uiux-seo 통합 실측 스크립트 (claude-seo UI/UX 버전)
- Lighthouse (성능·접근성·모범사례·SEO + LCP/CLS/TBT + 핵심 실패 노드)
- axe-core CLI (환경 호환 시 추가 실행, 미호환 시 Lighthouse 내장 axe 결과 활용)
- SSR HTML 텍스트 벽(연속 <p> 문단) 및 기본 UX 지표 점검
- 선택 옵션: --claude-headless (구독 기반 Claude CLI로 개선 요약 생성)
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path


def find_chrome() -> str:
    env_chrome = os.environ.get("CHROME_PATH", "").strip()
    if env_chrome and Path(env_chrome).exists():
        return env_chrome
    candidates = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ]
    for c in candidates:
        if Path(c).exists():
            return c
    return shutil.which("chrome") or shutil.which("google-chrome") or ""


def slugify(url: str) -> str:
    s = re.sub(r"^https?://", "", url).strip("/")
    s = re.sub(r"[^a-zA-Z0-9_-]+", "_", s)
    return s[:80] or "root"


def run_lighthouse(url: str, out_file: Path, chrome: str) -> dict | None:
    exe = shutil.which("lighthouse") or shutil.which("lighthouse.cmd")
    if not exe:
        return None
    cmd = [
        exe,
        url,
        "--output=json",
        f"--output-path={out_file}",
        "--only-categories=performance,accessibility,best-practices,seo",
        "--quiet",
    ]
    if chrome:
        cmd += [f"--chrome-path={chrome}", "--chrome-flags=--headless=new --no-sandbox --disable-gpu"]
    env = os.environ.copy()
    if chrome:
        env["CHROME_PATH"] = chrome
    subprocess.run(cmd, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    if not out_file.is_file():
        return None
    return json.loads(out_file.read_text(encoding="utf-8", errors="replace"))


def run_axe(url: str, out_dir: Path, name: str, chrome: str) -> list[dict] | None:
    exe = shutil.which("axe") or shutil.which("axe.cmd")
    if not exe:
        return None
    fname = f"{name}.axe.json"
    cmd = [exe, url, "--dir", str(out_dir), "--save", fname]
    if chrome:
        cmd += ["--chrome-path", chrome, "--chrome-options=headless=new,no-sandbox"]
    res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", check=False)
    fpath = out_dir / fname
    if res.returncode != 0 or not fpath.is_file():
        return None
    data = json.loads(fpath.read_text(encoding="utf-8", errors="replace"))
    row = data[0] if isinstance(data, list) and data else data
    return row.get("violations", []) if isinstance(row, dict) else None


def check_text_wall(url: str) -> dict:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 uiux-seo/1.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            html = r.read().decode("utf-8", errors="replace")
    except Exception as exc:
        return {"error": str(exc)}
    # <section> 내 연속 <p> 태그 개수 측정 (텍스트 벽 감지)
    sections = re.findall(r"<section\b[^>]*>(.*?)</section>", html, flags=re.S | re.I)
    max_p_in_section = 0
    for sec in sections:
        clean = re.sub(r"<details\b[^>]*>.*?</details>", "", sec, flags=re.S | re.I)
        p_count = len(re.findall(r"<p\b", clean, flags=re.I))
        if p_count > max_p_in_section:
            max_p_in_section = p_count
    return {"max_visible_paragraphs_in_section": max_p_in_section, "text_wall_risk": max_p_in_section >= 8}


def summarize_lh(d: dict) -> dict:
    cats = {k: int(round((v.get("score") or 0) * 100)) for k, v in d.get("categories", {}).items()}
    a = d.get("audits", {})
    a11y_fails = []
    for ref in d.get("categories", {}).get("accessibility", {}).get("auditRefs", []):
        if ref.get("weight", 0) > 0:
            aid = ref["id"]
            sc = (a.get(aid) or {}).get("score")
            if sc is not None and sc < 1:
                items = ((a[aid].get("details") or {}).get("items") or [])
                a11y_fails.append({"id": aid, "title": a[aid].get("title"), "count": len(items)})
    seo_fails = []
    for ref in d.get("categories", {}).get("seo", {}).get("auditRefs", []):
        if ref.get("weight", 0) > 0:
            aid = ref["id"]
            sc = (a.get(aid) or {}).get("score")
            if sc is not None and sc < 1:
                seo_fails.append({"id": aid, "title": a[aid].get("title")})
    return {
        "scores": cats,
        "metrics": {
            "lcp": (a.get("largest-contentful-paint") or {}).get("displayValue"),
            "cls": (a.get("cumulative-layout-shift") or {}).get("displayValue"),
            "tbt": (a.get("total-blocking-time") or {}).get("displayValue"),
        },
        "a11y_fails": a11y_fails,
        "seo_fails": seo_fails,
    }


def run_claude_headless(summary_path: Path, out_md: Path) -> bool:
    claude = shutil.which("claude") or shutil.which("claude.cmd")
    if not claude:
        return False
    prompt = (
        f"다음 uiux-seo 실측 결과 JSON({summary_path})을 읽고 한국어로 핵심 UI/UX·성능·접근성 개선 우선순위를 요약하라."
    )
    res = subprocess.run(
        [claude, "-p", "--model", "sonnet", "--safe-mode", "--no-session-persistence"],
        input=prompt,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if res.returncode == 0 and res.stdout.strip():
        out_md.write_text(res.stdout.strip(), encoding="utf-8")
        return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description="uiux-seo (claude-seo UI/UX 버전) 통합 실측")
    parser.add_argument("urls", nargs="+", help="검사할 URL 목록")
    parser.add_argument("--out", default="audit-out", help="결과 저장 디렉터리")
    parser.add_argument("--claude-headless", action="store_true", help="구독 Claude CLI 헤드리스 요약 추가 실행")
    args = parser.parse_args()

    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    chrome = find_chrome()
    results = []

    for url in args.urls:
        name = slugify(url)
        lh_data = run_lighthouse(url, out_dir / f"{name}.lh.json", chrome)
        axe_data = run_axe(url, out_dir, name, chrome)
        wall = check_text_wall(url)
        row = {
            "url": url,
            "lighthouse": summarize_lh(lh_data) if lh_data else None,
            "axe_external_violations": len(axe_data) if axe_data is not None else "skipped_driver_mismatch_using_lighthouse_axe",
            "ux_text_wall": wall,
        }
        results.append(row)
        print(json.dumps(row, ensure_ascii=False))

    summary_path = out_dir / "uiux-summary.json"
    summary_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")

    if args.claude_headless:
        ok = run_claude_headless(summary_path, out_dir / "UIUX-ACTION-PLAN.md")
        print(f"claude_headless_report={ok}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
