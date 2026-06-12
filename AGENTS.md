# RadSysX Agent Guidance

Last updated: 2026-06-12

## Purpose

- This file is the root DOX rail for RadSysX: project-wide instructions, global preferences, durable workflow rules, and the top-level Child DOX Index.
- RadSysX has two parallel product surfaces:
  - `research`: rapid experimentation, legacy viewer flows, browser-side AI prototypes, and agent/MCP exploration.
  - `clinical`: governed FastAPI contracts, worklist-driven launch, opaque viewer sessions, OHIF reading, audited reporting, AI workflow state, and backend-mediated derived DICOM writeback.
- RadSysX now also has a `desktop` runtime path: an Electron fast path that starts the local backend, Next.js shell, and OHIF viewer bridge under one localhost origin without Docker.
- Do not treat the research and clinical surfaces as equivalent.

## Ownership

- Root owns project-wide posture, root manifests, root docs, root Docker Compose, top-level scripts, logo/assets, and cross-domain workflow guidance.
- Child `AGENTS.md` files own domain-specific instructions for their subtrees. When a path has a child doc, read the full chain from this file to the nearest child before editing.
- Root-owned files and folders include `README.md`, `CLAUDE.md`, `WARP.md`, `DEPLOY_GPU.md`, `DEPLOY_LOCAL.md`, `PHASE4_CLINICAL_EXECUTION_CHECKLIST.md`, `package.json`, `package-lock.json`, `docker-compose.yml`, `.gitignore`, `dev.sh`, `RadSysX-Logo.png`, `test-biomedparse.py`, `test-files-inventory.txt`, `.claude/`, `.cursor/`, `.handoffs/`, and `.serena/`.

## DOX Core Contract

- `AGENTS.md` files are binding work contracts for their subtrees.
- Work products, source materials, instructions, records, assets, and durable docs must stay understandable from the nearest applicable `AGENTS.md` plus every parent `AGENTS.md` above it.
- Before editing, re-read this file, identify every path you expect to touch, walk from the repository root to each target path, and read every `AGENTS.md` found along each route.
- If a parent `AGENTS.md` lists a child whose scope contains the path, read that child and continue from there.
- The closer doc controls local work details when instructions conflict, but no child doc may weaken this DOX contract or project-wide safety rules.
- After every meaningful change, do a DOX pass: update the closest owning `AGENTS.md` when purpose, scope, ownership, durable structure, contracts, workflows, inputs, outputs, permissions, constraints, side effects, artifacts, or durable user preferences change.
- Update parent docs when parent-level structure, ownership, workflow, or a Child DOX Index changes. Update children when parent changes alter local rules. Remove stale or contradictory text immediately.
- Small edits that do not change behavior or contracts may leave docs unchanged, but the DOX pass still must happen and closeout should state why docs were unchanged.

## Host Environment Posture

- The primary development and validation target is native Ubuntu/Linux.
- Do not assume WSL, Windows path translation, Docker Desktop integration, `fnm`, or Windows-only shell behavior.
- Prefer Linux paths and commands. Use `./.venv/bin/python` style paths, not Windows virtualenv paths.
- Prefer a repo-local Python virtual environment in `.venv` and the workspace `package.json` plus root `package-lock.json` for Node dependencies.
- Treat Docker Engine plus Compose on Linux as the reference container runtime.
- Do not rely on machine-specific temporary dependency paths, ad hoc `PYTHONPATH` overrides, or globally preinstalled packages that are not documented.
- On a fresh Linux host, first do quick repo/context recon, then stop and wait for the user's report about the first Linux app test pass before deeper code changes.

## Bootstrap

- Clinical-first local bootstrap:
  - `python3 -m venv .venv`
  - `. .venv/bin/activate`
  - `python3 -m pip install --upgrade pip`
  - `python3 -m pip install -r backend/requirements-clinical.txt`
  - `npm install --legacy-peer-deps`
- Desktop fast-path bootstrap:
  - `npm run desktop:bootstrap`
  - `npm run desktop:doctor`
  - `npm run desktop`
- `backend/requirements.txt` is the broader research/agent dependency set. Use it only when intentionally working on the research surface and its extra dependencies.
- Use Python `3.12` if one interpreter must install both clinical and broader research dependency sets.
- If the host is missing a required system dependency, surface that explicitly instead of patching around it with host-local hacks.

## Project Operating Rules

1. Update docs in the same tranche as code when behavior, architecture, env vars, commands, or operational expectations change.
2. Treat `AGENTS.md` as authoritative and keep `README.md`, `CLAUDE.md`, `WARP.md`, and active checklists aligned instead of letting them drift.
3. Keep the research and clinical surfaces explicitly separated; do not solve a clinical gap by routing through a research-only shortcut.
4. Prefer backend-authoritative contracts over browser-local state or inferred client behavior whenever clinical workflow, actor identity, reporting, AI, DICOM, or audit data is involved.
5. Keep the viewer bootstrap minimal; if behavior can live in an OHIF extension, mode, service, or backend contract, move it there.
6. Never normalize insecure local habits into maintained guidance: no committed live credentials, no PHI-bearing URLs, no casual identifier logging, and no dependence on machine-local temp paths.
7. Make environment setup reproducible from the repo itself: `.venv`, declared Python requirements, workspace-managed npm installs, and env-driven secrets.
8. When review comments expose a real defect or ambiguity, fix the code and capture the durable lesson in guidance or checklists if it is likely to recur.
9. After substantial changes, record what was actually verified and what was not; do not imply Docker, viewer, or end-to-end validation if it did not happen.
10. On new machines or major environment transitions, do initial recon first, then anchor next decisions to observed runtime behavior from the first user-reported test pass.

## Runtime Modes

- Mode is controlled by `RADSYSX_APP_MODE`.
- Valid modes are `research`, `pilot`, and `clinical`.
- Only `research` may expose experimental upload/analyze flows.
- `pilot` and `clinical` must use the clinical FastAPI surface and worklist/viewer flow.
- Do not send DICOM bytes directly from the browser to third-party AI services in `pilot` or `clinical`.
- The Electron desktop fast path defaults to `pilot` with local development secrets and seeded local auth; override via env only when intentionally validating another mode.

## Clinical Workflow Contract

1. Establish a clinical session via `POST /api/auth/local-login` and confirm it with `GET /api/auth/session`.
2. Open `/worklist` in the Next.js shell.
3. Create an opaque launch session via `POST /api/imaging/launch`.
4. Resolve that session in `/viewer/?launch=...` via `GET /api/imaging/launch/resolve`.
5. Let the dedicated OHIF viewer app bind to returned `viewerRuntime` and same-origin DICOMweb roots.
6. Load study workspace state via `GET /api/studies/{studyUid}/workspace`.
7. Persist reports, AI jobs, derived results, and audit events through backend contracts, including backend-mediated STOW via `POST /api/derived-results/stow`.

## Clinical Runtime Paths

- Backend authority:
  - `backend/server.py`
  - `backend/clinical/auth.py`
  - `backend/clinical/config.py`
  - `backend/clinical/contracts.py`
  - `backend/clinical/dicomweb.py`
  - `backend/clinical/models.py`
  - `backend/clinical/repositories.py`
  - `backend/clinical/seed_orthanc.py`
  - `backend/clinical/services.py`
- Clinical frontend shell:
  - `frontend/app/login/page.tsx`
  - `frontend/app/worklist/page.tsx`
  - `frontend/lib/clinical/client.ts`
  - `frontend/lib/clinical/contracts.ts`
  - `frontend/lib/env.ts`
- Shared browser package:
  - `packages/clinical-web/src/client.ts`
  - `packages/clinical-web/src/contracts.ts`
  - `packages/clinical-web/src/env.ts`
- OHIF viewer runtime:
  - `viewer/scripts/build-ohif-dist.mjs`
  - `viewer/assets/radsysx-bootstrap.js`
  - `viewer/assets/radsysx-ohif-extension.js`
  - `viewer/assets/radsysx-ohif-mode.js`
  - `viewer/assets/radsysx-viewer.css`
- Desktop fast path:
  - `desktop/package.json`
  - `desktop/src/main.mjs`
  - `desktop/src/preload.cjs`
  - `desktop/scripts/doctor.mjs`
- Local clinical stack:
  - `docker-compose.yml`
  - `deploy/clinical-stack/nginx.conf`
  - `deploy/clinical-stack/orthanc.json`

## Research Surface Contract

- Research-only routes and components remain valid for experimentation, but are not authoritative clinical paths:
  - `frontend/app/page.tsx`
  - `frontend/components/core/CoreViewer.tsx`
  - `frontend/components/DicomViewer.tsx`
  - `frontend/app/api/analyze/route.ts`
  - `frontend/app/api/upload/route.ts`
  - `frontend/components/toolbars/RightPanel.tsx`
  - `backend/radsysx.py`
  - `backend/chat_interface.py`
  - `backend/mcp/*`
  - `backend/biomedparse_api.py`
- Research-only routes must stay gated outside `pilot` and `clinical` modes.

## Security And PHI Rules

- Do not put PHI-bearing launch context directly into viewer URLs.
- Use opaque launch tokens, then resolve server-side.
- Do not write uploads into public static paths for clinical workflows.
- Do not log patient names, identifiers, DICOM tags, or FHIR payloads casually.
- Keep AI execution server-side for governed workflows.
- Treat `frontend/app/api/analyze` and `frontend/app/api/upload` as research-only.
- Do not reintroduce browser-supplied `role`, `user_id`, `requestedBy`, or other actor identity inputs into governed clinical APIs.
- Treat backend-issued signed session cookies as the source of clinical actor context until a real OIDC provider replaces the local issuer.
- Keep DICOM SR and DICOM SEG writeback mediated by the backend rather than letting the browser store directly to Orthanc.

## Working Conventions

- Backend: use async endpoints for I/O boundaries; keep orchestration in services, persistence in repositories, and request/response definitions in contracts.
- Frontend: use TypeScript strict-mode patterns already present in the repo; keep viewer and worklist pages study-centric, not file-centric.
- Clinical frontend code should import the client from `@/lib/clinical/client`, which re-exports the shared `@radsysx/clinical-web` package.
- Do not treat `frontend/lib/api.ts` as the primary clinical API client; it remains a legacy convenience surface.
- The clinical public `/viewer` route is owned exclusively by the dedicated OHIF app in `viewer/`. There is no supported Next.js `/viewer` fallback route.
- Cornerstone remains the rendering and tooling substrate inside OHIF.
- For Agent Zero plugin/backend code outside this repo, treat the Docker container at `localhost:32080` as the live runtime code and always copy live runtime changes into `/home/eclypso/a0/agent-zero/plugins`.

## Verification

- Preferred focused checks for the clinical slice:
  - `python3 -m pytest backend/tests/test_clinical_platform.py`
  - `python3 -m compileall backend/clinical backend/server.py backend/radsysx.py`
  - `npm run desktop:doctor`
  - `npm run desktop:smoke`
  - `npm run type-check --workspace frontend`
  - `npm run type-check --workspace viewer`
  - `npm run build --workspace viewer`
- Use broader suites only when the change demands it.
- Install missing Python dependencies into `.venv`; do not normalize one-off temp-path dependency shims as part of expected workflow.
- If Docker Engine and Compose are available on the Linux host, validate the composed stack with Orthanc and nginx for clinical end-to-end work.

## Commands

- Backend dev server: `. .venv/bin/activate && python3 backend/server.py`
- Desktop bootstrap: `npm run desktop:bootstrap`
- Desktop preflight: `npm run desktop:doctor`
- Desktop app: `npm run desktop`
- Desktop startup smoke test: `npm run desktop:smoke`
- Clinical backend tests: `. .venv/bin/activate && python3 -m pytest backend/tests/test_clinical_platform.py`
- Whole backend runtime: `. .venv/bin/activate && RADSYSX_APP_MODE=research python3 backend/server.py`
- Frontend dev server: `npm run dev --workspace frontend`
- Viewer dev server: `npm run dev --workspace viewer`
- Frontend type check: `npm run type-check --workspace frontend`
- Viewer type check: `npm run type-check --workspace viewer`
- Viewer build: `npm run build --workspace viewer`
- Root type check: `npm run type-check`

## Local Clinical Stack

- Fast local desktop path:
  - Run `npm run desktop:bootstrap` once on a fresh clone.
  - Run `npm run desktop` for the Electron app.
  - Electron exposes one local origin, usually `http://127.0.0.1:3000`, and internally supervises FastAPI, Next.js, and the generated OHIF viewer bridge.
  - This path validates local login, worklist, launch, workspace, report, AI job, and audit contracts without Docker.
  - Full Orthanc-backed DICOMweb retrieval and durable STOW validation still require the compose stack or an explicitly configured local DICOMweb target.
- Before starting compose:
  - `export RADSYSX_ORTHANC_USERNAME=local-user`
  - `export RADSYSX_ORTHANC_PASSWORD=local-pass`
- Start stack: `docker compose up --build`
- This stack validates the governed clinical surface only; it is not the full research plus clinical runtime.
- Clinical public origin: `http://localhost:3000`
- Do not validate the governed viewer flow by opening the raw viewer dev server on port `3001`; use the nginx-served `http://localhost:3000` origin instead.
- Next.js shell: `/`
- OHIF viewer: `/viewer/`
- FastAPI: `/api`
- Orthanc DICOMweb: `/dicom-web`

## Avoid These Wrong Assumptions

- `frontend/app/page.tsx` is not the main product entry point for clinical work.
- `frontend/lib/api.ts` is not the authoritative clinical API client.
- `frontend/app/api/analyze/route.ts` and `frontend/app/api/upload/route.ts` are not normal production paths.
- `frontend/components/core/CoreViewer.tsx` is not the long-term clinical viewer shell.
- Prisma is not the backend clinical runtime datastore.
- Viewer launch should not trust raw query parameters like `study=...&patient=...`.
- The Electron fast path is not a reason to reintroduce a Next.js `/viewer` fallback or browser-local clinical state.

## User Preferences

- Favor rigorous, beautiful, professional solutions with high signal-to-noise.
- Prefer Linux-native commands and paths.
- Record durable behavior changes in this file or the nearest relevant child `AGENTS.md`.

## Child DOX Index

- `backend/AGENTS.md`: FastAPI backend, clinical/research backend split, Python dependencies, backend tests, MCP, skills, tools, and model utilities.
- `deploy/AGENTS.md`: deploy/runtime configuration, especially the clinical nginx and Orthanc stack.
- `desktop/AGENTS.md`: Electron desktop fast path, local process supervision, one-origin bridge, and desktop preflight/smoke checks.
- `dicom-test-files/AGENTS.md`: local DICOM fixtures and non-production imaging test assets.
- `frontend/AGENTS.md`: Next.js shell, clinical login/worklist pages, research UI, frontend libraries, and styling.
- `ideas-inspo/AGENTS.md`: source inspiration documents and exploratory materials.
- `packages/AGENTS.md`: workspace packages shared across app surfaces.
- `related-papers/AGENTS.md`: research papers and media used as source material.
- `tests/AGENTS.md`: root-level legacy/test harness scripts outside `backend/tests`.
- `viewer/AGENTS.md`: dedicated OHIF clinical viewer app, build wrapper, runtime assets, and generated viewer distribution.
