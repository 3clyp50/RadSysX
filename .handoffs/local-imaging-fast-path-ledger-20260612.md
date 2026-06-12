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
  - `npm run desktop:smoke:import`
- Desktop runtime starts:
  - FastAPI backend on an internal loopback port.
  - Next.js frontend shell on an internal loopback port.
  - A local one-origin bridge, usually `http://127.0.0.1:3000`.
  - Generated OHIF viewer assets from `viewer/dist/`.
- Desktop runtime defaults to local `pilot` mode with local seeded auth and development secrets.
- The current desktop fast path can validate seeded login, worklist, launch/session resolution, workspace/report/AI/audit contracts.
- The Electron desktop path now exposes a native local imaging file/folder picker through a narrow preload bridge, while retaining browser file inputs as fallback.
- The desktop import smoke can validate no-Docker import/use of synthetic DICOMDIR, DICOM, `.nii`, `.nii.gz`, and PNG files through the one-origin local bridge.
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
- There is now a minimal backend local DICOMweb surface for imported DICOM: study/series/instance metadata, whole-instance multipart retrieval, bulk-data multipart retrieval, and simple frame multipart retrieval.
- There is now a backend-owned imported-study asset summary endpoint at `GET /api/local-imaging/studies/{studyUid}/assets`.
- The local asset endpoint reads private stored files server-side and returns safe technical metadata, including NIFTI header dimensions/datatype and DICOM/image counts, without exposing stored paths or PHI-bearing DICOM tags.
- There is now a reproducible desktop import smoke at `npm run desktop:smoke:import`; it starts Electron on high local ports, generates PHI-free synthetic imaging files, imports them, verifies worklist rows, asset summaries, local DICOMweb discovery, and opaque viewer launch, then shuts the runtime down.
- There is now an Electron-native file/folder selection bridge at `window.radsysxDesktop.selectLocalImagingFiles`; it reads selected files in the desktop main process, preserves folder-relative paths as `radsysxRelativePath`, and then the frontend imports through the same backend local imaging contract.
- NIFTI display still needs a dedicated volume-rendering path because OHIF/DICOMweb is DICOM-centric; short-term local analysis readiness is now represented by backend summaries.
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
  - Expose an Electron file/folder picker through narrow IPC for better cross-platform directory selection.
  - Keep web app fallback input for browser compatibility.
- Viewer/analysis:
  - Short-term: show imported studies in worklist and provide metadata/preview.
  - Current short-term for NIFTI/fallback images: worklist row plus backend-owned asset summary/inspection panel.
  - Medium-term: deepen local DICOMweb/OHIF parity for imported DICOM and add a real NIFTI volume viewer or converter.
  - NIFTI may need a non-OHIF analysis/preview path unless converted or handled by a suitable viewer library.

## Todo Ledger

### Git And Process

- [x] Create branch `easy`.
- [x] Commit completed Electron fast path with title and description.
- [x] Keep subsequent local-imaging changes on `easy`.
- [x] Before final completion, make one or more intentional commits for local imaging work.
- [x] Add a reproducible no-Docker desktop import smoke command.
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
- [x] Inspect `backend/clinical/contracts.py`.
- [x] Inspect `backend/clinical/repositories.py`.
- [x] Inspect `backend/clinical/services.py`.
- [ ] Inspect current test fixtures under `dicom-test-files/`.
- [ ] Determine whether any NIFTI fixture exists; if not, generate a tiny safe synthetic fixture for tests or document missing manual fixture.
- [x] Generate safe synthetic NIFTI headers inside backend tests for `.nii` and `.nii.gz` coverage without PHI fixtures.

### Backend Local Ingest

- [x] Decide exact endpoint shape: `POST /api/local-imaging/import`.
- [x] Decide whether endpoint is available in `research`, `pilot`, and/or desktop-local mode: explicit `RADSYSX_LOCAL_IMAGING_ENABLED`, enabled by Electron desktop.
- [x] Require an authenticated local session for pilot/clinical-like desktop use.
- [x] Accept multipart uploads without writing to public static paths.
- [x] Store files under ignored `backend/local-imaging-data/` by default.
- [x] Add `.gitignore` rules for local uploaded image stores.
- [x] Enforce file size and count limits with clear errors.
- [x] Detect DICOM by pydicom parse and magic.
- [x] Detect DICOMDIR by filename and DICOM media storage metadata.
- [x] Resolve DICOMDIR referenced files safely enough for included-file warning/grouping; deeper directory-record coverage remains future work.
- [x] Detect `.nii` and `.nii.gz`.
- [x] Detect common image fallbacks: PNG, JPEG, TIFF, BMP, GIF as local files.
- [x] Return a structured ingest response with local study IDs, modality/format, count, and warnings.
- [x] Avoid logging patient names, identifiers, raw DICOM tags, or paths containing PHI in tests/manifest.
- [x] Record imported DICOM studies into the local clinical repository.
- [x] Preserve seeded demo worklist behavior.
- [x] Make local archive refs explicit, e.g. `local://...`, not `orthanc://default`.
- [x] Persist `localStudyInstanceUID` in new manifests so generated NIFTI/image study rows can find their private files later.
- [x] Add `GET /api/local-imaging/studies/{studyUid}/assets` for safe local asset summaries.
- [x] Return DICOM/NIFTI/image asset capability flags without exposing private stored paths.
- [x] Parse NIFTI headers server-side for dimensions, datatype code, bit depth, and storage summary.
- [x] Keep local asset summaries behind `RADSYSX_LOCAL_IMAGING_ENABLED` and an authenticated backend session.

### Frontend Local Import

- [x] Add local import UI to the desktop/local app path.
- [x] Keep controls dense and operational, not marketing-style.
- [x] Support native Electron file/folder selection and browser file/directory selection where browsers allow it.
- [x] Allow multiple files.
- [x] Clearly show supported formats without in-app instructional clutter.
- [x] Show import success, warnings, and errors.
- [x] Refresh worklist after import.
- [x] Route imported DICOM studies to viewer/workspace launch path; backend now serves minimal local DICOMweb for imported DICOM.
- [x] Route NIFTI/fallback images to a backend-owned inspection/analysis-summary path when OHIF is not immediately suitable.
- [x] Keep text inside buttons/cards from overflowing on mobile and desktop in the worklist controls touched by this tranche.
- [x] Prefer the Electron native file/folder picker when available, while retaining browser input fallback.
- [ ] Add richer drag-and-drop affordance for local import if it can stay compatible with governed backend upload.
- [ ] Add a dedicated local study detail route if the inspection panel becomes too dense for the worklist.

### Desktop Integration

- [x] Add Electron IPC file/folder picker for the desktop fast path.
- [x] Expose the picker through `preload.cjs` without exposing raw filesystem or shell primitives.
- [x] Preserve folder-relative paths from Electron picks through `radsysxRelativePath`.
- [ ] Keep drag-and-drop browser upload as a portable fallback.
- [ ] Ensure desktop bridge/proxy behavior handles large upload sizes beyond focused smoke fixtures.
- [x] Ensure startup environment points local upload storage to a predictable ignored path.
- [x] Verify `npm run desktop:smoke` still starts and cleans up.
- [x] Add `npm run desktop:smoke:import` for no-Docker local imaging import/use verification.
- [x] Make the import smoke isolate database and local imaging storage in a temporary directory.
- [x] Gate the desktop bridge shutdown endpoint behind `RADSYSX_DESKTOP_ALLOW_TEST_SHUTDOWN=1` for smoke tests only.
- [x] Verify the import smoke cleans up its desktop runtime children without leaving ports `37000`, `37010`, or `37080` open.

### Viewer And Analysis

- [x] For DICOM, choose whether fast path serves a simple local DICOMweb endpoint or uses existing research DICOM viewer components first: first pass is simple local DICOMweb endpoint.
- [x] For DICOMDIR, ensure referenced DICOM files become a series/study collection.
- [x] For NIFTI, choose and implement the short-term metadata path: backend asset summary plus header inspection.
- [ ] For NIFTI, implement longer-term volume rendering, conversion, or analysis viewer path.
- [x] Avoid claiming full OHIF image rendering until a real DICOMweb or compatible local source is verified; docs call this minimal local DICOM metadata/frame serving, not full archive parity.
- [x] Ensure the local asset-summary path consumes private local stored files server-side without browser direct third-party transfer.
- [ ] Ensure future AI/segmentation routes can consume local stored files server-side without browser direct third-party transfer.

### Tests And Verification

- [x] Unit-test file format detection through backend endpoint tests for DICOM, DICOMDIR, and NIFTI.
- [x] Unit-test DICOM metadata extraction without PHI logging in manifest.
- [x] Unit-test DICOMDIR reference handling for an included referenced DICOM.
- [x] Unit-test NIFTI detection for `.nii`.
- [x] Unit-test NIFTI detection and header summary for `.nii.gz`.
- [x] Unit-test common image fallback import and asset-summary reporting with a synthetic PNG payload.
- [x] Unit-test local DICOM asset summary reports viewer eligibility for DICOMweb-backed imports.
- [x] Add backend API test for local import with synthetic/safe files.
- [x] Add frontend type-check coverage for import UI.
- [x] Run `npm run desktop:doctor`.
- [x] Run `npm run desktop:smoke`.
- [x] Run `npm run desktop:smoke:import`.
- [x] Run `python3 -m pytest backend/tests/test_clinical_platform.py`.
- [x] Run any new backend tests.
- [x] Run `npm run type-check`.
- [x] Run `npm run build --workspace viewer`.
- [x] Perform a live no-Docker runtime upload smoke through the desktop bridge API with synthetic DICOMDIR+DICOM+`.nii.gz`+PNG files.
- [x] Replace the one-off live no-Docker import smoke with a committed `desktop:smoke:import` command covering DICOMDIR, DICOM, `.nii`, `.nii.gz`, and PNG.
- [ ] Perform a true native UI file-picker or drag-and-drop upload smoke once browser automation can reliably exercise hydrated worklist controls and OS dialogs.

### Documentation

- [x] Update root `AGENTS.md` if local imaging changes behavior/contracts.
- [x] Update closest child `AGENTS.md` files touched by local imaging work.
- [x] Update `README.md` with local import workflow once real behavior exists.
- [x] Update `DEPLOY_LOCAL.md` if desktop/local imaging run path changes.
- [x] Document limitations honestly: e.g. metadata import vs full OHIF rendering if not yet complete.

## Completion Audit Template

Before marking this goal complete, fill in evidence for each explicit requirement:

- Local runnable desktop app:
  - Evidence: `npm run desktop:doctor` and `npm run desktop:smoke` passed after the Electron fast path commit; desktop scripts are in root `package.json` and `desktop/`.
  - Evidence: `npm run desktop:doctor` and `npm run desktop:smoke` also passed after the imported-study asset-summary tranche.
  - Evidence: `npm run desktop:smoke:import` passed after being added as a committed script.
  - Evidence: Electron now exposes a native local imaging file/folder picker through `window.radsysxDesktop.selectLocalImagingFiles`.
  - Remaining gap: needs manual or automation-backed native OS dialog upload smoke before final completion.
- Upload/select local DICOM:
  - Evidence: backend endpoint tests import synthetic DICOM through `POST /api/local-imaging/import`; local DICOMweb and asset summary tests prove the stored DICOM is discoverable and viewer-eligible; `npm run desktop:smoke:import` imports synthetic DICOM and reports viewer eligibility.
  - Evidence: the Electron native picker can select local imaging files and preserve them for the existing backend import flow.
  - Remaining gap: native OS dialog upload of a real local DICOM file still needs runtime smoke evidence.
- Upload/select DICOMDIR:
  - Evidence: backend endpoint tests import synthetic DICOMDIR plus referenced DICOM and group them into one local study row; `npm run desktop:smoke:import` imports synthetic DICOMDIR plus referenced DICOM and returns `dicom`/`dicomdir` asset summary.
  - Evidence: the Electron native folder picker preserves relative paths for DICOMDIR-style folder imports.
  - Remaining gap: native OS directory-picker runtime smoke with a realistic DICOMDIR folder remains open.
- Upload/select NIFTI `.nii`:
  - Evidence: backend endpoint tests import a synthetic `.nii` file and register a local worklist row; `npm run desktop:smoke:import` imports `.nii` and verifies analysis-supported asset summary.
  - Remaining gap: native OS dialog upload/inspection of `.nii` remains open.
- Upload/select NIFTI `.nii.gz`:
  - Evidence: backend endpoint tests import synthetic gzipped NIFTI, preserve relative path, and extract `2 x 3 x 4` dimensions through the asset-summary endpoint; `npm run desktop:smoke:import` imports `.nii.gz` and returns the same dimension summary.
  - Remaining gap: native OS dialog upload/inspection of `.nii.gz` remains open.
- Generic suitable medical files:
  - Evidence: backend endpoint tests import a synthetic PNG fallback and report it through the asset-summary endpoint; importer accepts PNG/JPEG/TIFF/BMP/GIF extensions; `npm run desktop:smoke:import` imports a PNG fallback and reports it as analysis-supported.
  - Remaining gap: native OS dialog upload/inspection of real image fallback files remains open.
- Files become usable in worklist/viewer/analysis:
  - Evidence: imported rows are registered in the clinical worklist; DICOM rows are viewer-eligible through local DICOMweb metadata/frame/instance endpoints; NIFTI/image rows are inspectable through backend-owned asset summaries in the worklist UI.
  - Remaining gap: full OHIF pixel rendering across real-world DICOM and a richer NIFTI/image analysis workflow remain unproven.
- No Docker required for the fast path:
  - Evidence: Electron supervises FastAPI, Next.js, and the local viewer bridge; local import, worklist, asset summaries, and local DICOMweb are backend filesystem/database contracts, not Docker/Orthanc-only contracts; `npm run desktop:smoke:import` passed while compose/Orthanc were not running.
  - Remaining gap: final UI runtime smoke should be repeated through hydrated worklist controls and the native OS dialog.
- Cross-platform design:
  - Evidence: browser file inputs preserve `webkitRelativePath` when available; Electron picks preserve `radsysxRelativePath`; backend sanitizes POSIX-style relative paths and stores private files under configured local storage; docs use Linux commands while Electron path avoids Docker-specific assumptions.
  - Remaining gap: Windows/macOS native directory picker behavior is implemented via Electron but not yet tested on those OSes.
- PHI/security guardrails preserved:
  - Evidence: imported files stay outside public static routes; manifests avoid raw DICOM patient identifiers in tests; local asset summaries omit private stored paths and raw DICOM tags; endpoints require signed backend session and `RADSYSX_LOCAL_IMAGING_ENABLED`.
  - Remaining gap: broader real-world PHI log audit remains open.
- Tests and runtime smoke:
  - Evidence: focused local imaging backend tests and Python compile checks passed during this tranche; full clinical platform test suite passed; frontend/viewer type-checks passed; viewer build passed; desktop doctor and desktop smoke passed; committed desktop import smoke passed.
  - Remaining gap: true native OS dialog upload smoke and full real-world viewer rendering remain open before marking complete.

If any evidence slot is missing, weak, indirect, or only proves a narrower behavior, keep the goal active.
