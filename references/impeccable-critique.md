<!-- 출처: https://github.com/pbakaus/impeccable 커밋 2fc5e14 (2026-11-26) · Apache-2.0 (impeccable-LICENSE.txt).
     critique.md 에서 «Assessment A» 절과 점수·심각도 절만 발췌. -->

# 디자인 검토 기준

### Assessment A: Design Review

Read relevant source files and visually inspect the live page when browser automation is available. Think like a design director.

Evaluate:
- **Design specificity**: Is the composition, interaction, and visual language grounded in this product, or could an unrelated product use it unchanged? Make this judgment before seeing detector output.
- **Holistic design**: hierarchy, IA, emotional fit, discoverability, composition, typography, color, accessibility, states, copy, and edge cases.
- **Cognitive load**: consult the Cognitive Load Assessment in [critique-rubric.md](critique-rubric.md); report checklist failures and decision points with >4 visible options.
- **Emotional journey**: peak-end rule, emotional valleys, reassurance at high-stakes moments.
- **Nielsen heuristics**: consult the Heuristics Scoring Guide in [critique-rubric.md](critique-rubric.md); score all 10 heuristics 0-4, marking any heuristic the mode-applicability rule allows as `n/a` instead of forcing a number.

- **Persona red flags**: select personas with the Selecting Personas table in [critique-rubric.md](critique-rubric.md), plus 1-2 project-specific ones from PRODUCT.md's `## Users` when it has one, and walk each through the primary action.

Read critique-rubric.md as part of Assessment A. When a sub-agent runs A, give it the file's path so it reads the rubric itself, and the parent does not load it. When A runs in this context (native critiques, or the single-context fallback), read the rubric here before scoring.

Return: design-specificity verdict, heuristic scores, cognitive load, emotional journey, 2-3 strengths, 3-5 priority issues, persona red flags, minor observations, and provocative questions.

## Reference Material

Assessment A scores against [critique-rubric.md](critique-rubric.md): the cognitive load checklist, the heuristic scoring guide, and the personas. The report uses the bands and severities below.

### Scoring the report

#### Score Summary

**Total possible**: 40 points (10 heuristics × 4 max)

| Score Range | Rating | What It Means |
|-------------|--------|---------------|
| 36–40 | Excellent | Minor polish only; ship it |
| 28–35 | Good | Address weak areas, solid foundation |
| 20–27 | Acceptable | Significant improvements needed before users are happy |
| 12–19 | Poor | Major UX overhaul required; core experience broken |
| 0–11 | Critical | Redesign needed; unusable in current state |

When heuristics were scored `n/a`, the maximum is lower than 40; read the band off the percentage instead of the raw number (90%+ Excellent, 70%+ Good, 50%+ Acceptable, 30%+ Poor, below that Critical). 24/32 is 75%, so Good.

---

#### Issue Severity (P0–P3)

Tag each individual issue found during scoring with a priority level:

| Priority | Name | Description | Action |
|----------|------|-------------|--------|
| **P0** | Blocking | Prevents task completion entirely | Fix immediately; this is a showstopper |
| **P1** | Major | Causes significant difficulty or confusion | Fix before release |
| **P2** | Minor | Annoyance, but workaround exists | Fix in next pass |
| **P3** | Polish | Nice-to-fix, no real user impact | Fix if time permits |

**Tip**: If you're unsure between two levels, ask: "Would a user contact support about this?" If yes, it's at least P1.
