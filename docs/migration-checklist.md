# Repository Migration Checklist — welfare-footprint-institute

This document tracks the planned migration of the WelfareData project repositories
from the `Center-for-Welfare-Metrics` GitHub organization to `welfare-footprint-institute`.

**Status:** Not yet executed. Awaiting Wladimir's confirmation after integration
spike stabilization.

**Decision owner:** Wladimir (org setup, permissions, timing).
**Executor:** Gabriel (technical steps after Wladimir confirms).

> Do not execute any transfer step without Wladimir's explicit confirmation.

---

## Repositories to migrate

| Repository | Current URL | Destination |
|---|---|---|
| Canvas Navigator prototype | `github.com/Center-for-Welfare-Metrics/welfaredata-processogram-tools` | `github.com/welfare-footprint-institute/welfaredata-processogram-tools` |
| WelfareData platform | `github.com/Center-for-Welfare-Metrics/WelfareData-New` | `github.com/welfare-footprint-institute/WelfareData-New` |

---

## Pre-migration — confirm before any transfer

- [ ] Confirm the `welfare-footprint-institute` organization exists on GitHub
- [ ] Confirm Wladimir has Owner role in the destination organization
- [ ] Confirm Gabriel has Admin access to the source repositories (required to execute the transfer on GitHub)
- [ ] Confirm Gabriel has permission to create or receive repositories in the welfare-footprint-institute organization (set by Wladimir as Owner of the destination org)
- [ ] Confirm no repository named `welfaredata-processogram-tools` exists in `welfare-footprint-institute`
- [ ] Confirm no repository named `WelfareData-New` exists in `welfare-footprint-institute`
- [ ] Confirm neither repository has active CI/CD pipelines, webhooks, or external integrations that would break on URL change (e.g. Easypanel deploy hooks, Vercel integrations)
- [ ] Note: GitHub creates automatic redirects from old URLs to new URLs after transfer. These redirects remain active as long as no new repository with the same name is created in the source organization.

---

## Transfer sequence

Migrate in this order to minimize broken cross-links between the two repositories
during the transition window:

1. `welfaredata-processogram-tools` first — it contains the documentation that links to WelfareData-New
2. `WelfareData-New` second — update cross-links in INTEGRATION.md after both transfers are complete

---

## welfaredata-processogram-tools — links to update after transfer

The following files contain hardcoded URLs pointing to `Center-for-Welfare-Metrics/welfaredata-processogram-tools`.
Each must be updated after the transfer.

| File | Approximate link count | Notes |
|---|---|---|
| `README.md` | ~12 | All internal document links, Issue links, ADR link |
| `AGENTS.md` | ~3 | Issue links, ADR link, prototype URL |
| `ARCHITECTURE.md` | ~1 | Issue #1 reference in Fix 2b note |
| `docs/documentation-map.md` | ~10 | All document links in the hierarchy table |
| `docs/handover/innovation-ops-brief.md` | ~2 | README and Issue #1 links in "Where to find information" |
| `docs/svg-preparation-requirements.md` | ~1 | Self-reference link if present |
| `docs/migration-checklist.md` | This file | Update repo URLs in the header table |
| `Issue #1` (GitHub) | ~6 | ADR link, commit links, SVG preflight link |
| `Issue #2` (GitHub) | ~2 | Cross-references to Issue #1 and #3 |
| `Issue #3` (GitHub) | ~2 | Cross-references to Issue #1 and #2 |

**Approach:** after transfer, run a search for `Center-for-Welfare-Metrics/welfaredata-processogram-tools`
across all files in the repository and replace with `welfare-footprint-institute/welfaredata-processogram-tools`.
GitHub Issues must be updated manually.

---

## WelfareData-New — links to update after transfer

| File | Links to update | Notes |
|---|---|---|
| `frontend/src/components/processogram/navigator/INTEGRATION.md` | ~2 | Prototype repository URL, Issue links |
| `docs/index.md` | Clone URL (`Center-for-Welfare-Metrics`), platform description referencing old organization | Wladimir mentioned explicitly |

**Approach:** search for `Center-for-Welfare-Metrics/WelfareData-New` and
`Center-for-Welfare-Metrics/welfaredata-processogram-tools` across the repository
and replace accordingly. The main codebase has no hardcoded GitHub URLs — only the documentation files listed above are known to be affected at this time.

**Important:** do not assume only the files listed above are affected.
Before executing the migration, run a full text search for `Center-for-Welfare-Metrics`
across the entire WelfareData-New repository and review every result.
The list above reflects known occurrences at the time of writing.

---

## Cross-links between the two repositories

These specific cross-references connect the two repositories and must both be updated
after both transfers complete:

| Source file | Link | Target |
|---|---|---|
| `README.md` (prototype) | WelfareData-New repository link | `github.com/welfare-footprint-institute/WelfareData-New` |
| `AGENTS.md` (prototype) | WelfareData-New repository link | `github.com/welfare-footprint-institute/WelfareData-New` |
| `INTEGRATION.md` (WelfareData-New) | Standalone prototype link | `github.com/welfare-footprint-institute/welfaredata-processogram-tools` |
| `Issue #1` (prototype) | WelfareData-New commit link | Update to new org path |

---

## Post-migration steps

- [ ] Update local git remote for `welfaredata-processogram-tools`:
  ```bash
  git remote set-url origin https://github.com/welfare-footprint-institute/welfaredata-processogram-tools.git
  ```
- [ ] Update local git remote for `WelfareData-New`:
  ```bash
  git remote set-url origin https://github.com/welfare-footprint-institute/WelfareData-New.git
  ```
- [ ] Verify `git push` works from both local clones to new origin
- [ ] Verify all GitHub Issues are still accessible at new URLs
- [ ] Verify all commit links in Issue #1 still resolve (GitHub preserves commit SHAs across transfers)
- [ ] Verify the Google Drive video links in Issue #1 are unaffected (they are external — no change needed)
- [ ] Verify the live prototype URL (`welfaredata-prototype.ulsyy6.easypanel.host`) is unaffected (external — no change needed)
- [ ] Update all internal document links (see tables above)
- [ ] Update GitHub Issues cross-references manually
- [ ] Notify Wladimir of all new URLs for bookmark updates
- [ ] Confirm with Wladimir that the Easypanel/Cloud Run deployment configuration (if any) does not reference the old repository path

---

## Estimated effort

| Task | Effort |
|---|---|
| Pre-migration verification | 30 min |
| GitHub transfers (2 repos) | 10 min |
| Local remote updates (2 repos) | 5 min |
| Document link updates (find + replace) | 1–2 h |
| GitHub Issues manual updates | 30 min |
| Verification and confirmation | 30 min |
| **Total** | **~3–4 hours** |

---

## Impact on ongoing work

- All existing commits, issues, stars, and forks are preserved by GitHub on transfer
- GitHub redirects remain active from old URLs — external links continue to work unless a repository with the same name is created in the source organization
- The live prototype and all Google Drive video links are unaffected
- No code changes are required — only documentation and configuration links

---

## References

- [GitHub documentation: Transferring a repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository)
- Prototype repository: https://github.com/Center-for-Welfare-Metrics/welfaredata-processogram-tools
- Platform repository: https://github.com/Center-for-Welfare-Metrics/WelfareData-New
