# RadSysX Local Imaging Fast Path Ledger

Date: 2026-06-12
Branch: `easy`
Anchor commit for completed desktop fast path: `9ad93e4 Add Electron desktop fast path`

## Objective To Preserve

Make RadSysX a local runnable, cross-platform app that lets anyone upload and use suitable local medical image files, including DICOM, DICOMDIR, NIFTI, and other medical imaging files, without requiring the full Docker/nginx/Orthanc clinical orchestration for the fast path.

This is not merely an upload button. The desired end state is a local app that can ingest local imaging studies, build a usable study/series workspace, display or hand off images to the viewer, and support analysis workflows while preserving the clinical/research separation and avoiding unsafe shortcuts.

## Existing Completed Foundation

- Electron desktop workspace exists in `desktop/`.
- Root scripts exist:
  - `npm run desktop:bootstrap`
  - `npm run desktop:doctor`
  - `npm run desktop`
  - `npm run desktop:smoke`
- Desktop runtime starts:
  - FastAPI backend on an internal loopback port.
  - Next.js frontend shell on an internal loopback port.
  - A local one-origin bridge, usually `http://127.0.0.1:3000`.
  - Generated OHIF viewer assets from `viewer/dist/`.
- Desktop runtime defaults to local `pilot` mode with local seeded auth and development secrets.
- The current desktop fast path can validate seeded login, worklist, launch/session resolution, workspace/report/AI/audit contracts.
- Full Orthanc-backed DICOMweb retrieval and durable STOW validation still require compose unless a local DICOMweb target is configured.

## Non-Negotiable Project Constraints

- Keep clinical and research surfaces explicitly separated.
- Do not reintroduce a Next.js `/viewer` clinical fallback.
- Do not encode PHI-bearing launch context directly in URLs.
- Do not let browser-supplied actor identity become authoritative in clinical APIs.
- Do not send DICOM bytes directly from browser to third-party AI services in `pilot` or `clinical`.
- Do not store clinical uploads in public static paths.
- Backend-mediated writeback remains authoritative for governed derived DICOM results.
- Desktop/local mode may be friendly and fast, but it must not weaken governed contracts.
- Use repo-local `.venv`, workspace npm dependencies, and root `package-lock.json`.
- Keep Linux-native commands in docs, while designing code paths to be cross-platform.

## Current Evidence And Known Gaps

- Existing frontend research upload code exists:
  - `frontend/components/ImageSeriesUpload.tsx`
  - `frontend/lib/services/imageUploadService.ts`
  - `frontend/app/api/upload/route.ts`
  - `frontend/app/api/analyze/route.ts`
- These routes are research-only and not a governed local archive ingest path.
- Existing clinical worklist is seeded in SQLite through `backend/clinical/repositories.py`.
- Existing clinical viewer expects DICOMweb roots from backend launch resolution.
- Desktop bridge can serve `/viewer` and proxy `/api`; it has a placeholder route for `/dicom-web`.
- There is not yet a local file ingest service that turns uploaded DICOM/DICOMDIR/NIFTI files into a clinical/local workspace.
- There is now a first backend-owned local file ingest service in `backend/clinical/local_imaging.py`.
- There is now an ignored repo-local storage default at `backend/local-imaging-data/`, enabled by Electron.
- There is not yet a local DICOMweb-compatible adapter for the desktop fast path.
- NIFTI display/analysis path needs explicit design because OHIF/DICOMweb is DICOM-centric.
- DICOMDIR expansion needs parsing and file-path resolution rules.
- Cross-platform file picker and directory upload behavior needs explicit testing.

## Concrete Requirements Derived From User Objective

1. The app must be runnable locally through the desktop fast path.
2. A user must be able to choose local medical image files or folders from the desktop app.
3. The local ingest path must accept at least:
   - Single DICOM files.
   - Multiple DICOM files representing a study/series.
   - DICOMDIR plus referenced DICOM files.
   - NIFTI `.nii`.
   - NIFTI `.nii.gz`.
   - Reasonable fallback files suitable for medical-image analysis, such as PNG/JPEG/TIFF, if they appear in existing research workflows.
4. The ingest path must produce a usable local study/workspace entry.
5. The worklist or equivalent local launcher must expose uploaded studies.
6. The viewer or analysis surface must be able to use the uploaded content.
7. Local storage must stay outside public static routes and avoid accidental commits.
8. Uploaded PHI-bearing metadata must not be casually logged.
9. Local analysis must not depend on Docker.
10. Docker/Orthanc may remain the deeper validation path, but not the only local run path.
11. Cross-platform behavior must avoid Linux-only assumptions in the Electron/UI code path, while docs may prefer Linux commands.
12. Verification must prove actual upload and use, not just type-check.

## Suggested Architecture Direction

Prefer a backend-owned local imaging ingest service rather than browser-local state.

Likely components:

- `backend/clinical/local_imaging.py` or similar:
  - Stores uploaded files under an ignored local app-data directory.
  - Detects DICOM, DICOMDIR, NIFTI, and fallback image formats.
  - Extracts minimal safe metadata with `pydicom` for DICOM.
  - Handles DICOMDIR references carefully and cross-platform.
  - Creates local study/series records or an ingest manifest.
- `backend/clinical/contracts.py`:
  - Add request/response contracts for local imaging uploads/imports.
  - Keep response payloads low-PHI; prefer opaque local IDs and study UIDs.
- `backend/clinical/repositories.py`:
  - Add or reuse study records for local imports.
  - Store archive references such as `local://study/<id>` instead of `orthanc://default`.
- `backend/server.py`:
  - Add desktop/local upload endpoints only where mode permits.
  - Require active backend-issued session where appropriate.
- `frontend/app/worklist/page.tsx` or a dedicated local import route:
  - Add a compact local import control visible in desktop/local modes.
  - Use browser file/directory input as a fallback.
- `desktop/src/main.mjs` and `desktop/src/preload.cjs`:
  - Later improvement: expose an Electron file/folder picker through IPC for better cross-platform directory selection.
  - Keep web app fallback input for browser compatibility.
- Viewer/analysis:
  - Short-term: show imported studies in worklist and provide metadata/preview.
  - Medium-term: provide local DICOMweb-like serving for DICOM imports or convert to temporary DICOMweb sources for OHIF.
  - NIFTI may need a non-OHIF analysis/preview path unless converted or handled by a suitable viewer library.

## Todo Ledger

### Git And Process

- [x] Create branch `easy`.
- [x] Commit completed Electron fast path with title and description.
- [x] Keep subsequent local-imaging changes on `easy`.
- [ ] Before final completion, make one or more intentional commits for local imaging work.
- [ ] Do not mark the goal complete until upload/use of local files is proven with runtime evidence.

### Discovery

- [x] Read `frontend/app/api/AGENTS.md` before editing existing upload/analyze route handlers.
- [x] Read `backend/clinical/AGENTS.md` before editing clinical contracts/services/repositories.
- [x] Inspect `frontend/components/ImageSeriesUpload.tsx`.
- [x] Inspect `frontend/lib/services/imageUploadService.ts`.
- [x] Inspect `frontend/app/api/upload/route.ts`.
- [x] Inspect `frontend/app/api/analyze/route.ts`.
- [ ] Inspect `frontend/components/DicomViewer.tsx`.
- [ ] Inspect `frontend/components/AdvancedViewer.tsx`.
- [ ] Inspect `frontend/components/ViewportManager.tsx`.
- [ ] Inspect `backend/clinical/contracts.py`.
- [ ] Inspect `backend/clinical/repositories.py`.
- [ ] Inspect `backend/clinical/services.py`.
- [ ] Inspect current test fixtures under `dicom-test-files/`.
- [ ] Determine whether any NIFTI fixture exists; if not, generate a tiny safe synthetic fixture for tests or document missing manual fixture.

### Backend Local Ingest

- [x] Decide exact endpoint shape: `POST /api/local-imaging/import`.
- [x] Decide whether endpoint is available in `research`, `pilot`, and/or desktop-local mode: explicit `RADSYSX_LOCAL_IMAGING_ENABLED`, enabled by Electron desktop.
- [x] Require an authenticated local session for pilot/clinical-like desktop use.
- [x] Accept multipart uploads without writing to public static paths.
- [x] Store files under ignored `backend/local-imaging-data/` by default.
- [x] Add `.gitignore` rules for local uploaded image stores.
- [ ] Enforce file size and count limits with clear errors.
- [x] Detect DICOM by pydicom parse and magic.
- [x] Detect DICOMDIR by filename and DICOM media storage metadata.
- [x] Resolve DICOMDIR referenced files safely enough for included-file warning/grouping; deeper directory-record coverage remains future work.
- [x] Detect `.nii` and `.nii.gz`.
- [x] Detect common image fallbacks: PNG, JPEG, TIFF, BMP, GIF as local files.
- [x] Return a structured ingest response with local study IDs, modality/format, count, and warnings.
- [x] Avoid logging patient names, identifiers, raw DICOM tags, or paths containing PHI in tests/manifest.
- [x] Record imported DICOM studies into the local clinical repository.
- [ ] Preserve seeded demo worklist behavior.
- [ ] Make local archive refs explicit, e.g. `local://...`, not `orthanc://default`.

### Frontend Local Import

- [x] Add local import UI to the desktop/local app path.
- [ ] Keep controls dense and operational, not marketing-style.
- [x] Support files and directory selection where browsers allow it.
- [x] Allow multiple files.
- [ ] Clearly show supported formats without in-app instructional clutter.
- [x] Show import success, warnings, and errors.
- [x] Refresh worklist after import.
- [ ] Route imported DICOM studies to viewer/workspace when available.
- [ ] Route NIFTI/fallback images to an analysis/preview path if OHIF is not immediately suitable.
- [ ] Keep text inside buttons/cards from overflowing on mobile and desktop.

### Desktop Integration

- [ ] Consider Electron IPC file/folder picker for a second pass.
- [ ] Keep drag-and-drop browser upload as a portable fallback.
- [ ] Ensure desktop bridge/proxy behavior handles large upload sizes beyond focused smoke fixtures.
- [x] Ensure startup environment points local upload storage to a predictable ignored path.
- [ ] Verify `npm run desktop:smoke` still starts and cleans up.

### Viewer And Analysis

- [ ] For DICOM, choose whether fast path serves a simple local DICOMweb endpoint or uses existing research DICOM viewer components first.
- [ ] For DICOMDIR, ensure referenced DICOM files become a series/study collection.
- [ ] For NIFTI, choose short-term preview/metadata path and longer-term volume rendering/analysis path.
- [ ] Avoid claiming full OHIF image rendering until a real DICOMweb or compatible local source is verified.
- [ ] Ensure analysis routes can consume local stored files server-side without browser direct third-party transfer.

### Tests And Verification

- [x] Unit-test file format detection through backend endpoint tests for DICOM, DICOMDIR, and NIFTI.
- [ ] Unit-test DICOM metadata extraction without PHI logging.
- [x] Unit-test DICOMDIR reference handling for an included referenced DICOM.
- [x] Unit-test NIFTI detection for `.nii`; `.nii.gz` still needs explicit coverage.
- [x] Add backend API test for local import with synthetic/safe files.
- [ ] Add frontend type-check coverage for import UI.
- [ ] Run `npm run desktop:doctor`.
- [ ] Run `npm run desktop:smoke`.
- [x] Run `python3 -m pytest backend/tests/test_clinical_platform.py`.
- [x] Run any new backend tests.
- [x] Run `npm run type-check`.
- [ ] Run `npm run build --workspace viewer`.
- [ ] Perform at least one runtime upload smoke test if browser tooling is available.

### Documentation

- [ ] Update root `AGENTS.md` if local imaging changes behavior/contracts.
- [ ] Update closest child `AGENTS.md` files touched by local imaging work.
- [ ] Update `README.md` with local import workflow once real behavior exists.
- [ ] Update `DEPLOY_LOCAL.md` if desktop/local imaging run path changes.
- [ ] Document limitations honestly: e.g. metadata import vs full OHIF rendering if not yet complete.

## Completion Audit Template

Before marking this goal complete, fill in evidence for each explicit requirement:

- Local runnable desktop app:
  - Evidence:
- Upload/select local DICOM:
  - Evidence:
- Upload/select DICOMDIR:
  - Evidence:
- Upload/select NIFTI `.nii`:
  - Evidence:
- Upload/select NIFTI `.nii.gz`:
  - Evidence:
- Generic suitable medical files:
  - Evidence:
- Files become usable in worklist/viewer/analysis:
  - Evidence:
- No Docker required for the fast path:
  - Evidence:
- Cross-platform design:
  - Evidence:
- PHI/security guardrails preserved:
  - Evidence:
- Tests and runtime smoke:
  - Evidence:

If any evidence slot is missing, weak, indirect, or only proves a narrower behavior, keep the goal active.
