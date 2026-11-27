# uiux-seo (`claude-seo` UI/UX 버전)

실측 기반 UI/UX · 접근성 · Core Web Vitals 감사 및 개선 워크플로우 플러그인입니다.  
`naver-seo`와 동일한 `C:\Users\USER\Desktop\workspace` 공통 플러그인 규격(`.claude-plugin/`, `skills/`, `scripts/`, `references/`)을 따릅니다.

## 구성 요소

| 구분 | 도구 | 역할 |
|---|---|---|
| 실측 엔진 1 | **Chrome DevTools** (`chrome-devtools-plugin`) | 실시간 DOM, 레이아웃, 콘솔/네트워크, 뷰포트·인터랙션 검증 |
| 실측 엔진 2 | **Lighthouse 13.6.0** | Performance(LCP/CLS/TBT), Accessibility, Best Practices, SEO, 내장 axe-core |
| 실측 엔진 3 | **axe-core CLI 4.14.1** | WCAG 2.1/2.2 접근성 정밀 감사 (ChromeDriver 호환 시 단독 + 미스매치 시 Lighthouse 폴백) |
| 공식 UI/UX 기준 | **Vercel `web-design-guidelines` v1.1.0** | 접근성, 포커스, 폼, 타이포그래피(`tabular-nums`), 대비, 이미지, 모션 기준 체크 |
| 선택 헤드리스 연동 | **Claude Code CLI (`claude -p`)** | `--claude-headless` 플래그 시 구독 OAuth 기반 AI 리포트 요약 (추가 API 과금 없음) |

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

- Node.js 18+ (`npm i -g lighthouse @axe-core/cli`)
- Python 3.10+
- Google Chrome
- (선택) Claude Code CLI (`claude` 로그인 상태)
