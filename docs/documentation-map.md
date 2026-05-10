# Documentation Map

This document defines the role, audience and authority of each 
documentation source in the WelfareData Processogram project.
When in doubt about which document to consult, use this map.

---

## Document Hierarchy

| Document | Purpose | Audience | Status | Use when | Do not use when |
|---|---|---|---|---|---|
| [docs/svg-preparation-requirements.md](https://github.com/Center-for-Welfare-Metrics/welfaredata-processogram-tools/blob/main/docs/svg-preparation-requirements.md) | Technical requirements for SVG files compatible with the Canvas Navigator | Jean and future designers | ✅ current | Preparing, revising or exporting any processogram SVG; checking compatibility with the motor | Looking for conceptual design guidance or visual aesthetics |
| [Processogram Development Manual](https://docs.google.com/document/d/1d9pN_-5bA2N-yQ2o-Wh4AQVQheTUpc5d6Cv9IFXKxxk/edit?usp=sharing) | Conceptual and visual design guidance — how to conceive a processogram, organize phases, work with scale, perspective and composition | Researchers and designers | 📖 reference | Designing a new processogram from scratch; understanding the conceptual structure and visual language | Checking technical SVG compatibility with the Canvas Navigator — use svg-preparation-requirements.md instead |
| [Issue #1 — Phase 1 Validation](https://github.com/Center-for-Welfare-Metrics/welfaredata-processogram-tools/issues/1) | Phase 1 validation — test matrix, video evidence, blockers, SVG status | Gabriel and Wladimir | ✅ current | Tracking test results, blockers and Phase 1 acceptance criteria | Architecture decisions or post-Phase-1 planning |
| [ADR-001 — Current System Direction](https://github.com/Center-for-Welfare-Metrics/welfaredata-processogram-tools/blob/main/docs/architecture-decisions/adr-001-current-system-direction.md) | Architectural decisions — which systems are active, deprecated or pending | Gabriel and Wladimir | ✅ current | Understanding why a technical decision was made; checking system status | Day-to-day SVG preparation or test tracking |
| [Issue #2 — Post-Phase-1 UX](https://github.com/Center-for-Welfare-Metrics/welfaredata-processogram-tools/issues/2) | Post-Phase-1 roadmap — configurable parameters, side panel, UX layer | Gabriel and Wladimir | 🗺️ roadmap | Planning Integration Phase work; registering UX requirements | Phase 1 validation or SVG preparation |
| [Issue #3 — Post-Phase-1 Themeable SVG](https://github.com/Center-for-Welfare-Metrics/welfaredata-processogram-tools/issues/3) | Light/dark mode pipeline, single SVG source, theming strategy | Gabriel and Wladimir | 🗺️ roadmap | Planning theme support; understanding fill/stroke rules for future theming | Phase 1 validation or immediate SVG fixes |
| [WelfareData Processograms: Technical and Contributor Documentation](https://docs.google.com/document/d/1QAzknzhbXbeBaItjQh9yfjKKwChzqli8sgn5KxuhcRY/edit?usp=sharing) | Historical umbrella document — legacy links, old stack, AI prompts, contributor instructions | Historical reference only | ⚠️ legacy | Consulting the AI prompts for description generation (still valid conceptually) | Any technical SVG or architecture decision — information may be outdated |

---

## Conflict resolution

When two documents give conflicting instructions, follow this priority order:

1. `docs/svg-preparation-requirements.md` — for SVG technical compatibility
2. ADR-001 — for architectural decisions
3. Issue #1 — for Phase 1 test criteria
4. Processogram Development Manual — for visual and conceptual design
5. Legacy document — do not use as source of truth

---

## Status legend

| Icon | Meaning |
|---|---|
| ✅ current | Active source of truth — keep updated |
| 📖 reference | Stable reference — valid but not the technical authority for the Canvas Navigator |
| 🗺️ roadmap | Future requirements — not yet implemented |
| ⚠️ legacy | Historical — may contain outdated information |