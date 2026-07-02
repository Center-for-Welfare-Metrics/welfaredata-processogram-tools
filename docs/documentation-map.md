# Documentation Map

This document defines the role, audience, and authority of each documentation
source in the WelfareData Canvas Navigator project.

When in doubt about which document to consult, start here.

---

## How to use this map

- **Looking for SVG technical rules?** → `docs/svg-preparation-requirements.md`
- **New to the project?** → `README.md` first, then `docs/handover/innovation-ops-brief.md`
- **Checking why a technical decision was made?** → ADR-001
- **Tracking Phase 1 test results and blockers?** → Issue #1
- **Using an AI agent or coding assistant?** → `AGENTS.md`
- **Two documents conflict?** → See the Conflict Resolution section below

---

## Document Hierarchy

| Document | Purpose | Audience | Status | Use when | Do not use when |
|---|---|---|---|---|---|
| [README.md](https://github.com/Center-for-Welfare-Metrics/welfaredata-processogram-tools/blob/main/README.md) | Entry point for the repository — project overview, current status, commands, and links to all key resources | Anyone arriving at the repository for the first time | ✅ current | First visit to the repository; quick status check; finding the right link | Deep technical decisions or SVG preparation rules |
| [docs/svg-preparation-requirements.md](https://github.com/Center-for-Welfare-Metrics/welfaredata-processogram-tools/blob/main/docs/svg-preparation-requirements.md) | Technical requirements for SVG files compatible with the Canvas Navigator — naming, structure, dimensions, export settings | Jean and future designers | ✅ current | Preparing, revising, or exporting any processogram SVG; checking compatibility with the motor | Conceptual design guidance or visual aesthetics — use the Processogram Development Manual instead |
| [docs/handover/innovation-ops-brief.md](https://github.com/Center-for-Welfare-Metrics/welfaredata-processogram-tools/blob/main/docs/handover/innovation-ops-brief.md) | Project handover brief — history, current state, responsibilities, milestones, pending decisions, and what is not a blocker | Innovation Operations Lead and new team members | ✅ current | Onboarding to the project; understanding who owns what; tracking the overall state without deep technical context | Motor architecture details or SVG preparation rules |
| [AGENTS.md](https://github.com/Center-for-Welfare-Metrics/welfaredata-processogram-tools/blob/main/AGENTS.md) | AI agent orientation — repository structure, source of truth hierarchy, SVG conventions, what agents can and cannot do | Claude Code, Codex, Cursor, and similar AI tools | ✅ current | Running AI-assisted reviews or edits in this repository | Human decision-making about WFI semantics or visual design |
| [ADR-001 — Current System Direction](https://github.com/Center-for-Welfare-Metrics/welfaredata-processogram-tools/blob/main/docs/architecture-decisions/adr-001-current-system-direction.md) | Architectural decisions — which systems are active, deprecated, or pending and why | Gabriel and Wladimir | ✅ current | Understanding why a technical decision was made; checking system status | Day-to-day SVG preparation or Phase 1 test tracking |
| [docs/migration-checklist.md](https://github.com/Center-for-Welfare-Metrics/welfaredata-processogram-tools/blob/main/docs/migration-checklist.md) | Repository migration planning — prerequisites, transfer sequence, files to update in both repositories, post-migration steps, and estimated effort for migrating to welfare-footprint-institute | Gabriel and Wladimir | ✅ current | Planning or executing the repository migration to welfare-footprint-institute | Any other purpose — this document is exclusively for migration planning |
| [Issue #1 — Phase 1 Validation](https://github.com/Center-for-Welfare-Metrics/welfaredata-processogram-tools/issues/1) | Phase 1 validation — test matrix, video evidence, blockers, SVG status per file | Gabriel and Wladimir | ✅ current | Tracking test results, blockers, and Phase 1 acceptance criteria | Architecture decisions or post-Phase-1 planning |
| [tools/README.md](https://github.com/Center-for-Welfare-Metrics/welfaredata-processogram-tools/blob/main/tools/README.md) | SVG preflight tool documentation — full list of checks, severity levels, and usage instructions | Jean and Gabriel | ✅ current | Understanding what the preflight checks, what each severity level means, and how to use the tool | Motor architecture or integration planning |
| [Processogram Development Manual](https://docs.google.com/document/d/1d9pN_-5bA2N-yQ2o-Wh4AQVQheTUpc5d6Cv9IFXKxxk/edit?usp=sharing) | Conceptual and visual design guidance — how to conceive a processogram, organize phases, work with scale, perspective, and composition | Researchers and designers | 📖 reference | Designing a new processogram from scratch; understanding the conceptual structure and visual language | Checking technical SVG compatibility with the Canvas Navigator — use svg-preparation-requirements.md instead |
| [Issue #2 — Post-Phase-1 UX](https://github.com/Center-for-Welfare-Metrics/welfaredata-processogram-tools/issues/2) | Post-Phase-1 roadmap — configurable visual parameters, side panel, UX layer | Gabriel and Wladimir | 🗺️ roadmap | Planning Integration Phase UX work; registering future UX requirements | Phase 1 validation or SVG preparation |
| [Issue #3 — Post-Phase-1 Themeable SVG](https://github.com/Center-for-Welfare-Metrics/welfaredata-processogram-tools/issues/3) | Light/dark mode pipeline, single SVG source, theming strategy, three-layer principle | Gabriel and Wladimir | 🗺️ roadmap | Planning theme support; understanding the separation of visual art, semantic structure, and interaction geometry | Phase 1 validation or immediate SVG fixes. Note: invisible hit-area geometry described in this issue is a future motor feature — not yet implemented and not a current instruction for Jean |
| [WelfareData Processograms: Technical and Contributor Documentation](https://docs.google.com/document/d/1QAzknzhbXbeBaItjQh9yfjKKwChzqli8sgn5KxuhcRY/edit?usp=sharing) | Historical umbrella document — legacy links, old stack, AI prompts, contributor instructions | Historical reference only | ⚠️ legacy | Consulting the AI prompts for description generation (still valid conceptually) | Any technical SVG or architecture decision — information is outdated |

**Preflight live version:** https://welfaredata-pre-flight.ulsyy6.easypanel.host/ — Jean can use this directly without downloading any file.
---

## Conflict resolution

When two documents give conflicting instructions, follow this priority order.
The document listed first always wins on its topic.

1. `docs/svg-preparation-requirements.md` — for SVG technical rules and compatibility
2. ADR-001 — for architectural decisions and system direction
3. Issue #1 — for Phase 1 acceptance criteria and test results
4. Processogram Development Manual — for visual and conceptual design
5. Legacy document — do not use as a source of truth for anything technical

**Special case — Issue #3 and invisible hit-areas:** Issue #3 describes invisible
hit-area geometry as a solution for stroke-only elements. This is a planned future
motor feature and is not yet implemented. Until motor support is confirmed,
`docs/svg-preparation-requirements.md` takes precedence: do not add invisible
shapes to SVG files.

---

## Status legend

| Icon | Meaning |
|---|---|
| ✅ current | Active source of truth — must be kept up to date |
| 📖 reference | Stable reference — valid but not the technical authority for the Canvas Navigator |
| 🗺️ roadmap | Future requirements — planned but not yet implemented |
| ⚠️ legacy | Historical — may contain outdated information; do not use for technical decisions |

---

## Maintenance rules

These rules apply to everyone updating project documentation.

- **SVG rules change** → update `docs/svg-preparation-requirements.md` first, then
  check `tools/README.md` and `tools/svg-preflight.html` for consistency
- **A new document is created** → add it to this map before closing the task
- **A document becomes outdated** → change its status to ⚠️ legacy and add a note
  explaining which document supersedes it
- **An architectural decision is made** → record it in ADR-001 and reference it
  from the relevant issue or document
- **Issue #3 is updated** → verify that any new instructions are consistent with
  `docs/svg-preparation-requirements.md` before communicating them to Jean
- **Repository migration is executed** → follow `docs/migration-checklist.md` step by step. After migration, update all hardcoded links in the repository before closing the checklist.