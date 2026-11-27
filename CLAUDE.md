# uiux-seo (`claude-seo` UI/UX 버전)

이 저장소는 `naver-seo`와 동일한 플러그인 규격을 따르는 **UI/UX·성능·접근성·체류시간 정량 감사 플러그인**입니다.

## 핵심 규칙
- **실측 엔진 우선**: 추측으로 UI/UX를 평가하지 않고 **Lighthouse + axe-core + Chrome DevTools** 실측 수치를 먼저 확보한다.
- **공식 기준 대조**: **Vercel `web-design-guidelines` (`references/web-design-guidelines.md`)** 체크리스트로 코드와 렌더링 결과를 대조한다.
- **SEO/GEO/AEO 비파괴 원칙**: UI/UX 개선(카드화, 필터, 아코디언 `<details>`) 시 SSR HTML 고유 문구·구조화 데이터(`C02`·`T11`·`Critical 0`)가 깨지지 않도록 유지한다.
- **100% 구독 기반 / 추가 API 과금 0원**: `--claude-headless` 옵션 사용 시 `claude -p --safe-mode` (OAuth 구독)만 사용한다.
- **한국어 보고 및 주석**: 모든 보고와 코드 주석은 한국어로 작성한다(한글 주석 끝에 국기 이모지 미사용).
