# uiux-seo (`claude-seo` UI/UX 버전)

기존 도구를 모아 한 번에 검사하고 «고칠 것 목록»을 알려 주는 묶음입니다. 코드 수정은 하지 않습니다.
«claude-seo UI/UX 버전»은 부르는 이름일 뿐이며 claude-seo의 일부가 아닙니다.

## 구성 요소

| 도구 | 역할 | 실행 |
|---|---|---|
| Lighthouse | 성능(LCP/CLS/TBT)·접근성·모범사례·SEO | 스크립트 |
| axe-core CLI | 접근성 위반 (안 돌면 Lighthouse 내장 결과) | 스크립트 |
| Playwright + @axe-core/playwright | 가로 넘침·Tab 포커스 링·클릭 전환·상태별 WCAG (`audit_interaction.mjs`) | 스크립트 (토큰 0) |
| impeccable detect 4.11.1 | 모바일 화면 규칙 검사 (긴 문단 규칙은 없음) | 스크립트 (`npx`) |
| impeccable 평가 기준 | 사용성 검토 (AI 판단) | 스킬을 돌리는 AI의 별도 평가자 |
| Vercel web-design-guidelines | UI 코드 규칙 대조 (소스가 있을 때) | 스킬을 돌리는 AI |
| Claude Code CLI | `--claude-headless` 를 붙일 때만 결과 요약 | 선택 |

체류시간은 재지 않습니다. 절차는 `skills/uiux-seo/SKILL.md` 에 있습니다.
`references/impeccable-*` 와 `critique-rubric.md` 는 [impeccable](https://github.com/pbakaus/impeccable)(Apache-2.0)에서 가져왔습니다.

## 빠른 실행

```bash
python scripts/audit_uiux.py https://rchada.com/articles/lease-rent/40-to-55
```

여러 URL 동시 감사:

```bash
python scripts/audit_uiux.py https://rchada.com/ https://rchada.com/eco-deal https://rchada.com/events --out ./audit-out
```

Claude 구독 헤드리스 요약 포함:

```bash
python scripts/audit_uiux.py https://rchada.com/events --claude-headless
```

## 사전 요구사항

- Node.js 18+ (`npm i -g lighthouse @axe-core/cli`, 플러그인 폴더 내 `npm install` 로 `playwright` / `@axe-core/playwright` 설치)
- Python 3.10+
- Google Chrome
- (선택) Claude Code CLI (`claude` 로그인 상태)
