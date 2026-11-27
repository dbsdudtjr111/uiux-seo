---
name: uiux-seo
description: "기존 UI/UX 도구(Lighthouse·axe-core·impeccable·Vercel web-design-guidelines)를 한 번에 돌려 무엇을 고칠지 알려 주는 검사 묶음. 'claude-seo ui/ux 버전'은 부르는 이름일 뿐 claude-seo의 일부가 아니다. 사용자가 'claude-seo ui/ux 버전으로 검사해줘', 'uiux-seo로 점검 및 개선해줘'라고 요청할 때 사용한다."
user-invocable: true
argument-hint: "<URL 또는 URL 목록> [--claude-headless]"
---

# uiux-seo (부르는 이름: `claude-seo` UI/UX 버전)

기존 도구를 모아 한 번에 검사하는 묶음이며, 그 이상도 이하도 아니다. 결과는 «고칠 것 목록»이고, 코드 수정은 사용자가 따로 시킬 때의 별도 작업이다.

## 이름과 범위

- «claude-seo UI/UX 버전»은 부르는 이름이다. claude-seo의 일부나 파생판이 아니며 claude-seo를 부르지 않는다.
- 검사 능력은 묶인 도구의 것이다. 보고할 때 항목마다 어느 도구가 낸 결과인지 적는다.

| 항목 | 실제로 하는 것 |
|---|---|
| 성능·접근성·SEO 점수 | Lighthouse (스크립트) |
| 접근성 위반 | axe-core (스크립트 · 안 돌면 Lighthouse 내장 결과) |
| 화면 결함 규칙 검사 | `impeccable detect` (스크립트 · 긴 문단 규칙은 없음) |
| 인터랙션·포커스·가로넘침·상태별 접근성 | `Playwright` + `@axe-core/playwright` (`scripts/audit_interaction.mjs` · 토큰 0) |
| 사용성 검토 (긴 글벽·오해·누르기 어려움 등) | `impeccable` 평가 기준으로 별도 평가자가 검토 (AI 판단 · 약 3분·토큰 약 10만) |
| UI 규칙 대조 | Vercel `web-design-guidelines` 문서를 읽고 비교 (소스가 있을 때) |
| 체류시간 | 재지 않음 |

## 실행 절차 (고정 순서)

1. **스크립트 실측**
   ```bash
   python "${CLAUDE_PLUGIN_ROOT}/scripts/audit_uiux.py" <URL1> [URL2 ...] --out audit-out
   ```
   - Lighthouse: Performance · Accessibility · Best Practices · SEO 점수, LCP / CLS / TBT, 실패 항목
   - axe-core: WCAG 접근성 위반
   - impeccable detect: 모바일 화면 기준 규칙 검사 (`<이름>.detect.json`)
   - *(선택)* `--claude-headless`: 로컬 Claude CLI로 요약 생성

2. **사용성 검토 (매번 실행 · 사용자가 빼라고 하면 생략)**
   - 별도 평가자(서브에이전트)에게 맡긴다. 1단계 결과와 의심하는 문제는 알려 주지 않고 `audit-out`도 읽지 않게 한다.
   - 평가자에게 줄 것: 대상 URL, `references/impeccable-critique.md`의 «Assessment A»와 `references/critique-rubric.md`(평가 기준으로만 씀), 창 없는 크롬/크로미움 390x844 로 페이지 전체를 구간별 촬영해 보기, 폼 제출·전화 버튼은 누르지 않기, 저장소는 고치지 않기.
   - 받을 것: 점수표, P0~P3 문제(화면 위치·고칠 방향), 확인 못 한 범위.
   - 주소가 여러 개면 틀(페이지 종류)마다 대표 1곳만 검토한다.
   - 서브에이전트를 쓸 수 없으면 직접 검토하고 보고에 «단독 검토»라고 적는다.

3. **Vercel `web-design-guidelines` 대조 (소스가 있을 때)**
   - `references/web-design-guidelines.md`를 읽고 검사 대상 컴포넌트 파일을 규칙과 대조한다.

4. **보고: 고칠 것 목록**
   - 심각한 순서로 합치고 겹치는 항목은 하나로 적는다. 항목마다 문제 · 화면/파일 위치 · 고칠 방향 · 낸 도구.
   - 실행 실패·생략한 단계를 함께 적는다.
