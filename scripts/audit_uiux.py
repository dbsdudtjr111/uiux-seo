#!/usr/bin/env python3
"""
uiux-seo 실측 스크립트 — 기존 도구를 모아 돌린다.
(«claude-seo UI/UX 버전»은 부르는 이름일 뿐이며 claude-seo를 부르지 않는다.)
- Lighthouse (성능·접근성·모범사례·SEO + LCP/CLS/TBT + 핵심 실패 노드)
- axe-core CLI (환경 호환 시 추가 실행, 미호환 시 Lighthouse 내장 axe 결과 활용)
- impeccable detect (규칙 기반 화면 결함 검사 · 모바일 390x844 · 버전 고정)
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


IMPECCABLE = "impeccable@4.11.1"


def run_detect(url: str, out_file: Path) -> dict:
    exe = shutil.which("npx") or shutil.which("npx.cmd")
    if not exe:
        return {"error": "npx 없음"}
    cmd = [exe, "-y", IMPECCABLE, "detect", "--json", url, "--viewport", "390x844"]
    try:
        res = subprocess.run(
            cmd, cwd=out_file.parent, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=400, check=False
        )
        # 종료코드: 0 결함 없음, 2 결함 있음, 그 밖은 검사 실패
        if res.returncode not in (0, 2):
            return {"error": f"종료코드 {res.returncode}: {res.stderr.strip()[-300:]}"}
        data = json.loads(res.stdout)
    except (subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
        return {"error": str(exc)[:300]}
    out_file.write_text(res.stdout, encoding="utf-8")
    items = data if isinstance(data, list) else data.get("findings", [])
    rules: dict[str, dict] = {}
    for x in items:
        key = x.get("antipattern") or x.get("id") or "unknown"
        rule = rules.setdefault(key, {"rule": key, "count": 0, "fix": x.get("description"), "examples": []})
        rule["count"] += 1
        if len(rule["examples"]) < 3:
            rule["examples"].append(x.get("snippet"))
    return {"total": len(items), "rules": list(rules.values())}


def run_interaction(url: str, out_dir: Path) -> dict | None:
    node = shutil.which("node")
    script = Path(__file__).resolve().parent / "audit_interaction.mjs"
    if not node or not script.is_file():
        return None
    res = subprocess.run(
        [node, str(script), url, "--out", str(out_dir)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=120,
        check=False,
    )
    fpath = out_dir / f"{slugify(url)}.interaction.json"
    if not fpath.is_file():
        return {"error": res.stderr.strip()[-200:] or "interaction 실행 실패"}
    return json.loads(fpath.read_text(encoding="utf-8", errors="replace"))


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
    parser = argparse.ArgumentParser(description="uiux-seo: 기존 UI/UX 도구 묶음 실측")
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
        detect = run_detect(url, out_dir / f"{name}.detect.json")
        interaction = run_interaction(url, out_dir)
        row = {
            "url": url,
            "lighthouse": summarize_lh(lh_data) if lh_data else None,
            "axe_external_violations": len(axe_data) if axe_data is not None else "skipped_driver_mismatch_using_lighthouse_axe",
            "impeccable_detect": detect,
            "interaction_axe": interaction,
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
