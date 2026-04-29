# ADR-001 — Current System Direction

**Status:** under validation  
**Date:** 2026-04-20  
**Author:** Gabriel  
**Reviewed by:** Wladimir (Welfare Footprint Institute)

---

## Context

The WelfareData processogram viewer requires a navigation engine capable of
handling large, complex SVG files with hundreds of interactive elements across
a 4-level hierarchy (Production System → Life Fate → Phase → Circumstance).

Three systems have existed or are in development for this purpose. This document
records the direction of each system and the decisions made.

---

## Systems Overview

### System 1 — Herikle's WelfareData (deprecated)

**Status:** deprecated  
**Repository:** not maintained  
**Hosting:** frontend on Herikle's personal Vercel account;
backend on Welfare Footprint Institute's Cloud Run

**Description:**  
The original WelfareData system, developed by Herikle. It uses DOM-based SVG
rendering with `react-inlinesvg` and GSAP viewBox animation for navigation.
Hit-testing is performed via `element.closest()` on the SVG DOM.

**Why deprecated:**  
DOM-based SVG interaction does not scale to large processograms. SVGs with many
elements (e.g. Salmon, Laying Hens) produce severe lag (INP ~800ms) because
the browser must recalculate layout and run hit-testing across hundreds of DOM
nodes on every interaction. This is a fundamental architectural limitation, not
a fixable bug.

**Current role:**  
Herikle's involvement is now strictly operational. When the new system is ready
for production, Herikle will need to be contacted to:
- Disconnect the domain `app.welfaredata.org` from his personal Vercel account
- Transfer or release the domain for use with the new infrastructure

No technical contribution from Herikle is expected or required beyond this.

---

### System 2 — WelfareData-New (awaiting navigator integration)

**Status:** feature-complete locally; awaiting navigator integration
**Repository:** https://github.com/Center-for-Welfare-Metrics/WelfareData-New  
**Hosting:** development environment only (localhost); not deployed to production

**Description:**  
A full reconstruction of the WelfareData platform developed by Gabriel Sargeiro.
Includes:
- Backend: Node.js + Express 5 + TypeScript (Clean Architecture)
- Frontend: Next.js 16 + React 19 + Tailwind CSS
- Database: MongoDB 6 (Docker)
- Storage: Google Cloud Storage
- AI: Gemini 2.5-Flash (descriptions, questions, chat)
- Auth: JWT HttpOnly Cookie
- Admin panel: species, production modules, processogram upload
- Viewer: public route with SidePanel, Breadcrumb, ChatWidget

**Why not yet in production:**  
The navigation engine (react-inlinesvg + GSAP viewBox + DOM closest()) was
replicated from System 1 and carries the same DOM performance limitation.
The system is feature-complete but awaits replacement of the navigation engine
with the Canvas Navigator (System 3) before production deployment.

**Role of Cloud Run:**  
Cloud Run is available in the Welfare Footprint Institute's Google Cloud account
and is the confirmed deployment target for both backend and frontend of
WelfareData-New. No deployment has been executed yet — it will happen after
the Canvas Navigator is validated and integrated.

---

### System 3 — Canvas Navigator Prototype (under validation)

**Status:** under validation  
**Repository:** https://github.com/Center-for-Welfare-Metrics/welfaredata-processogram-tools  
**Live prototype:** https://welfaredata-prototype.ulsyy6.easypanel.host/  
**Hosting:** EasyPanel (Docker + Nginx), Gabriel's server

**Description:**  
A new navigation engine built entirely on Canvas 2D, replacing DOM-based SVG
interaction. Designed specifically to solve the performance limitations of
Systems 1 and 2.

**Core architecture:**
- Canvas 2D rendering with raster cache (low/mid tier)
- Color-based hit-testing via 4 invisible OffscreenCanvas layers (one per
  hierarchy level), with pre-computed `Int32Array` ID grid — O(1) lookup,
  zero GPU readback on mousemove
- Camera class with Dirty Flag pattern and cached DOMMatrix (zero allocation
  on hot path)
- IndexedDB L1 cache with SHA-1 hash of SVG as cache key
- Dynamic tier selection via `stretchFactor` (replaces fixed scale threshold)
- Audit layer (`audit.ts`) for detecting suspicious element IDs

**Vercel:**  
Vercel is not part of the final stack. The WelfareData platform uses Google
Cloud Storage and Gemini (Google Cloud ecosystem). Splitting infrastructure
between Vercel and Google Cloud would create unnecessary complexity in
authentication, networking and billing. All production infrastructure will
run on Google Cloud (Cloud Run + GCS).

---

## Feature Status — Canvas Navigator (Phase 1)

> The Canvas Navigator is a standalone rendering and navigation prototype.
> It is not the integrated WelfareData platform.

| Feature | Status |
|---|---|
| Canvas 2D rendering (low/mid tier) | implemented |
| Color-based hit-testing (4-layer hitmap) | implemented |
| Int32Array ID grid (O(1) lookup) | implemented |
| Camera with DOMMatrix + Dirty Flag | implemented |
| IndexedDB cache with SHA-1 hash | implemented |
| Dynamic tier selection (stretchFactor) | implemented |
| Audit layer (suspicious ID detection) | implemented |
| SVG normalization (viewBox/width/height) | implemented |
| Anti-aliasing elimination (crispEdges) | implemented |
| Drill-down / drill-up navigation | implemented |
| Navigation through all levels down to --ci | implemented |
| Treatment of --? groups as layout containers | implemented |
| Singleton level skip in navigation | implemented |
| Breadcrumb with singleton level access | pending |
| Hover highlight | nice to have — under investigation |
| Integration with AI-generated descriptions | not in scope for Phase 1 |
| Integration with login, database and admin | not in scope for Phase 1 |
| Integration with WelfareData-New backend | not in scope for Phase 1 |
| Dark mode | not in scope for Phase 1 |
| Cloud Run deployment | not in scope for Phase 1 |

---

## Decisions Recorded

| Decision | Status | Rationale |
|---|---|---|
| System 1 (Herikle) deprecated | validated | DOM SVG does not scale |
| System 1 will not migrate to Cloud Run | validated | Deprecated, no migration path |
| Vercel is not part of the final stack | validated | Google Cloud ecosystem preferred |
| Cloud Run is the final deployment target | validated | Native GCS + Gemini integration |
| Canvas Navigator replaces DOM navigation | validated | Solves performance at root level |
| Validate before integrating | validated | Canvas Navigator must be fully validated as standalone before integration into WelfareData-New begins |
| Integration before deploy | validated | WelfareData-New will only be deployed to Cloud Run after Canvas Navigator integration is complete and validated |
| Integration with WelfareData-New | pending | Awaiting Phase 1 validation |
| Architecture final | pending | Depends on Phase 1 validation |

---

## Pending Decisions

| Decision | Owner | Context |
|---|---|---|
| When to begin integration with WelfareData-New | Gabriel + Wladimir | After Phase 1 acceptance |
| Domain transfer from Herikle's Vercel | Wladimir + Herikle | When production deploy is ready and validated |
| Gemini API Key rotation | Gabriel + Wladimir | Not a Phase 1 blocker. Documented in WelfareData-New/docs/environment_variables.md — to be executed before Post-Phase-1 Integration |

---

## Next Steps

1. Complete Phase 1 validation (see issue: Phase 1 — Validate Canvas navigator
   with priority WelfareData SVGs)
2. Implement pending features: breadcrumb with singleton access
   (hover highlight is under investigation — not required for Phase 1)
3. Run test matrix across priority SVGs: Pig, Laying Hens, Dark Hatchery, Cattle
4. If Phase 1 accepted: begin integration of Canvas Navigator into WelfareData-New
5. When integration complete: deploy WelfareData-New to Cloud Run
6. Contact Herikle to disconnect domain from his Vercel account (Only when we finish integrating and validating WelfareData_New)

---

## References

- Prototype repository: https://github.com/Center-for-Welfare-Metrics/welfaredata-processogram-tools
- WelfareData-New repository: https://github.com/Center-for-Welfare-Metrics/WelfareData-New
- Live prototype: https://welfaredata-prototype.ulsyy6.easypanel.host/
- Technical documentation (prototype): https://github.com/Center-for-Welfare-Metrics/welfaredata-processogram-tools/tree/main/docs 