---
name: uiux-seo
description: "claude-seo UI/UX 버전 진입점. Chrome DevTools + Lighthouse + axe-core 실측 엔진과 Vercel web-design-guidelines를 한꺼번에 실행해 UI/UX·접근성·Core Web Vitals·텍스트 벽·체류시간을 감사하고 개선한다. 사용자가 'claude-seo ui/ux 버전으로 검사해줘', 'uiux-seo로 점검 및 개선해줘'라고 요청할 때 사용한다."
user-invocable: true
argument-hint: "<URL 또는 URL 목록> [--fix] [--claude-headless]"
---

# uiux-seo — `claude-seo` UI/UX 버전

**실측 엔진(Lighthouse + axe-core + Chrome DevTools)** 과 **공식 UI/UX 기준(Vercel `web-design-guidelines`)** 을 하나로 묶어 실행하는 통합 감사·개선 스킬이다.

## 실행 절차 (고정 순서)

1. **정량 실측 (`scripts/audit_uiux.py`) 실행**
   ```bash
   python "${CLAUDE_PLUGIN_ROOT}/scripts/audit_uiux.py" <URL1> [URL2 ...] --out audit-out
   ```
   - **Lighthouse**: Performance, Accessibility, Best Practices, SEO 점수 + LCP / CLS / TBT + `color-contrast` / `target-size` / `link-text` / `unsized-images` 실패 노드 추출
   - **axe-core**: WCAG 접근성 위반 노드 추출 (ChromeDriver 호환 환경에서 추가 실행, 미호환 시 Lighthouse 내장 axe-core 결과로 자동 통합)
   - **텍스트 벽·체류시간 휴리스틱**: 연속 `<p>` 텍스트 밀도(긴 평문 나열 여부) 검출
   - *(선택)* `--claude-headless` 전달 시 로컬 Claude CLI(`claude -p --safe-mode`)로 리포트 요약 생성 가능

2. **Chrome DevTools 실화면 점검 (브라우저 에이전트/MCP 사용 가능 시)**
   - 모바일 뷰포트(`375x812`) 기준 첫 화면(Above the fold) 핵심 비교표·CTA 노출, 가로 스크롤(`scrollWidth > innerWidth`), 콘솔/네트워크 에러 확인

3. **Vercel `web-design-guidelines` 대조**
   - `${CLAUDE_PLUGIN_ROOT}/references/web-design-guidelines.md`를 읽고, 수정 대상 컴포넌트 파일을 규칙과 1:1 대조

4. **UI/UX 개선 및 SEO 비파괴 검증**
   - 명도 대비(`>= 4.5:1`), 터치 타겟(`>= 44px` 또는 충분한 간격), 모호한 링크 텍스트(`sr-only` 맥락 보강), 텍스트 벽(상단 인터랙티브 필터/요약 카드 + `<details>` 아코디언) 개선
   - 개선 후 **수정된 페이지에 한해** `audit_uiux.py` 재실측 + `claude-seo` / `naver-seo` (`C02`·`T11`·`Critical 0`) 비파괴 확인
