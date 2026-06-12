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
  - `npm run desktop:smoke:ui-import`
  - `npm run desktop:smoke:picker-import`
  - `npm run desktop:smoke:picker-large-import`
- Desktop runtime starts:
  - FastAPI backend on an internal loopback port.
  - Next.js frontend shell on an internal loopback port.
  - A local one-origin bridge, usually `http://127.0.0.1:3000`.
  - Generated OHIF viewer assets from `viewer/dist/`.
- Desktop runtime defaults to local `pilot` mode with local seeded auth and development secrets.
- The current desktop fast path can validate seeded login, worklist, launch/session resolution, workspace/report/AI/audit contracts.
- The Electron desktop path now exposes a native local imaging file/folder picker through a narrow preload bridge, while retaining browser file input and drag-and-drop fallbacks.
- The preferred Electron native import path now keeps selected paths and file bytes in Electron main, uses file-backed blobs for multipart form data, attaches the backend-issued session cookie from the Electron cookie jar, and posts directly to `POST /api/local-imaging/import` through the one-origin desktop bridge; the renderer receives only the backend response.
- The native picker admits extensionless non-hidden files as DICOM candidates so DICOMDIR companion files such as `SCAN1DCM` can reach backend format detection instead of being filtered out in Electron.
- The desktop import smoke can validate no-Docker import/use of synthetic DICOMDIR, DICOM, `.nii`, `.nii.gz`, and PNG files through the one-origin local bridge.
- The desktop UI import smoke can validate a hydrated worklist UI drag/drop import path, local study inspection, NIFTI slice controls, and backend technical analysis through the Electron bridge.
- The desktop picker import smoke can validate the hydrated worklist `Import folder` action through the Electron preload IPC/native picker bridge, main-process recursive folder collector, backend import, local study inspection, NIFTI slice controls, and backend technical analysis without automating the OS dialog itself.
- The desktop large picker import smoke can validate the same direct native import path with an additional 8 MiB synthetic `256 x 256 x 128` NIFTI volume, proving the bridge/backend path beyond tiny fixtures.
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
- There is now a first backend-owned local file ingest service in `backend/clinical/local_imaging.py`.
- There is now an ignored repo-local storage default at `backend/local-imaging-data/`, enabled by Electron.
- There is now a minimal backend local DICOMweb surface for imported DICOM: study/series/instance metadata, whole-instance multipart retrieval, bulk-data multipart retrieval, and simple frame multipart retrieval.
- There is now a backend-owned imported-study asset summary endpoint at `GET /api/local-imaging/studies/{studyUid}/assets`.
- There is now a backend-owned imported-asset preview endpoint at `GET /api/local-imaging/studies/{studyUid}/assets/{assetId}/preview`.
- There is now a backend-owned imported-study technical analysis endpoint at `GET /api/local-imaging/studies/{studyUid}/analysis`.
- The local asset endpoints read private stored files server-side and return safe technical metadata/previews/analysis, including NIFTI header dimensions/datatype, axial/coronal/sagittal NIFTI SVG slice previews, DICOM/image counts, common image previews, NIFTI voxel statistics, simple uncompressed DICOM pixel statistics, and common image header dimensions, without exposing stored paths or PHI-bearing DICOM tags.
- There is now a reproducible desktop import smoke at `npm run desktop:smoke:import`; it starts Electron on high local ports, generates PHI-free synthetic imaging files, imports them, verifies worklist rows, asset summaries, local DICOMweb discovery, and opaque viewer launch, then shuts the runtime down.
- There is now a reproducible hydrated desktop UI import smoke at `npm run desktop:smoke:ui-import`; it drives Electron through the local bridge, signs in with a backend-issued cookie, clicks into `/worklist`, dispatches a DOM drag/drop with PHI-free synthetic DICOMDIR/DICOM/NIFTI/PNG files, verifies imported rows, inspects local assets, switches a NIFTI preview to a coronal slice, runs backend technical analysis, and shuts the runtime down.
- There is now a reproducible hydrated desktop native picker bridge smoke at `npm run desktop:smoke:picker-import`; it drives Electron through the local bridge, signs in with a backend-issued cookie, clicks into `/worklist`, clicks the real `Import folder` button, routes through `window.radsysxDesktop.importLocalImaging`, uses a smoke-only main-process test-path override guarded by `RADSYSX_DESKTOP_ALLOW_TEST_SHUTDOWN=1`, recursively collects the PHI-free fixture folder, verifies imported rows, inspects local assets, switches a NIFTI preview to a coronal slice, runs backend technical analysis, and shuts the runtime down.
- Desktop UI smoke commands share default high ports for Electron, the bridge, Next.js, and FastAPI; run them sequentially unless ports are explicitly overridden.
- The hydrated native picker bridge smoke now proves the preferred `window.radsysxDesktop.importLocalImaging` path: selected files stay in Electron main and are uploaded to backend import with the existing session cookie instead of being copied through renderer IPC as ArrayBuffers.
- The large native picker bridge smoke at `npm run desktop:smoke:picker-large-import` adds `large-volume.nii`, an 8 MiB `256 x 256 x 128` uint8 NIFTI, and verifies import of 6 files into 2 studies, preview loading, coronal slice switching, and backend technical analysis including the `8388608` voxel count.
- The first picker bridge smoke exposed and fixed an Electron-side DICOMDIR usability defect: extensionless DICOM companion files were filtered out before backend detection. `desktop/src/main.mjs` now treats extensionless non-hidden files as DICOM candidates while backend import remains the final authority.
- There is still a legacy Electron-native file/folder selection bridge at `window.radsysxDesktop.selectLocalImagingFiles`; it reads selected files in the desktop main process, preserves folder-relative paths as `radsysxRelativePath`, and lets the frontend import through the same backend local imaging contract when the preferred direct import helper is unavailable.
- The desktop bridge now sanitizes hop-by-hop proxy headers, disables upstream socket reuse for proxied HTTP requests, and proxies WebSocket upgrades so Next.js dev assets and HMR can hydrate the Electron shell reliably through the one-origin bridge.
- The desktop startup smoke now schedules `RADSYSX_DESKTOP_EXIT_AFTER_READY_MS` shutdown immediately after internal services report ready, before awaiting the final app URL load, so dev-shell navigation cannot strand the smoke process and child services.
- The shared clinical browser env now reads public `NEXT_PUBLIC_*` keys through guarded direct env access so Next.js can inline them consistently and avoid server/client mode hydration mismatch.
- NIFTI display still needs a dedicated full volume-rendering path because OHIF/DICOMweb is DICOM-centric; short-term local analysis readiness is now represented by backend summaries, multi-axis slice previews, and deterministic voxel statistics.
- Deeper DICOMDIR directory-record parsing and file-path resolution rules remain future work beyond the current included-file grouping path.
- Real native OS-dialog behavior and Windows/macOS directory-picker behavior still need explicit testing beyond the smoke-only picker bridge override.
- Diagnostic AI/segmentation remains future work; the current no-Docker analyzer is deliberately technical and deterministic, not a clinical diagnosis engine.

## Concrete Requirements Derived From User Objective

1. The app must be runnable locally through the desktop fast path.
2. A user must be able to choose or drop local medical image files or folders from the desktop app.
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
  - Use browser drag-and-drop as a portable fallback when it can still submit to the backend import contract.
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
- [x] Add a reproducible hydrated Electron UI import smoke command.
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
- [x] Add stable opaque local asset IDs for imported-study assets.
- [x] Add `GET /api/local-imaging/studies/{studyUid}/assets/{assetId}/preview` for backend-mediated local previews.
- [x] Serve common image previews through the backend without public static file exposure.
- [x] Render initial NIFTI axial previews server-side as dependency-free SVG from private voxel bytes.
- [x] Extend backend-mediated NIFTI previews to axial, coronal, and sagittal slice selection through `axis` and `slice` query parameters.
- [x] Return NIFTI preview slice counts and default preview state in the imported-study asset contract.
- [x] Keep local previews behind `RADSYSX_LOCAL_IMAGING_ENABLED` and an authenticated backend session.
- [x] Add `GET /api/local-imaging/studies/{studyUid}/analysis` for deterministic backend-side local technical analysis.
- [x] Analyze simple uncompressed DICOM pixel data for frame dimensions, intensity range, and mean intensity.
- [x] Analyze NIFTI voxel data for dimensions, voxel count, intensity range, and mean intensity using bounded sampling.
- [x] Analyze common image headers for dimensions and safe format metrics where possible.
- [x] Keep local analysis behind `RADSYSX_LOCAL_IMAGING_ENABLED` and an authenticated backend session.

### Frontend Local Import

- [x] Add local import UI to the desktop/local app path.
- [x] Keep controls dense and operational, not marketing-style.
- [x] Support native Electron file/folder selection and browser file/directory selection where browsers allow it.
- [x] Support browser drag-and-drop for files and Chromium-exposed folders while preserving relative paths.
- [x] Add stable test hooks for the local import panel, imported rows, inspect action, analysis action, previews, and analysis panel so UI smoke can verify the hydrated workflow without brittle styling selectors.
- [x] Allow multiple files.
- [x] Clearly show supported formats without in-app instructional clutter.
- [x] Show import success, warnings, and errors.
- [x] Refresh worklist after import.
- [x] Route imported DICOM studies to viewer/workspace launch path; backend now serves minimal local DICOMweb for imported DICOM.
- [x] Route NIFTI/fallback images to a backend-owned inspection/analysis-summary path when OHIF is not immediately suitable.
- [x] Show backend-mediated preview thumbnails for previewable imported NIFTI and common image assets in the worklist inspection panel.
- [x] Add NIFTI axial/coronal/sagittal preview controls with a slice slider in the worklist inspection panel.
- [x] Add a worklist local-analysis action that renders backend technical metrics for imported assets.
- [x] Keep text inside buttons/cards from overflowing on mobile and desktop in the worklist controls touched by this tranche.
- [x] Prefer the Electron native file/folder picker when available, while retaining browser input fallback.
- [x] Add richer drag-and-drop affordance for local import if it can stay compatible with governed backend upload.
- [ ] Add a dedicated local study detail route if the inspection panel becomes too dense for the worklist.

### Desktop Integration

- [x] Add Electron IPC file/folder picker for the desktop fast path.
- [x] Expose the picker through `preload.cjs` without exposing raw filesystem or shell primitives.
- [x] Preserve folder-relative paths from Electron picks through `radsysxRelativePath`.
- [x] Keep drag-and-drop browser upload as a portable fallback.
- [x] Add a hydrated Electron UI smoke for drag/drop local imaging import through the worklist.
- [x] Add a smoke-only picker bridge override guarded by `RADSYSX_DESKTOP_ALLOW_TEST_SHUTDOWN=1` and `RADSYSX_DESKTOP_PICKER_TEST_PATHS`, so automation can exercise the native picker IPC path without OS-dialog control.
- [x] Add `desktop:smoke:picker-import` to exercise the real hydrated worklist `Import folder` button, preload IPC bridge, main-process recursive file/folder collector, direct backend import, local inspection, NIFTI preview controls, and technical analysis.
- [x] Keep `RADSYSX_DESKTOP_PICKER_TEST_PATHS` out of normal runtime behavior when `RADSYSX_DESKTOP_ALLOW_TEST_SHUTDOWN` is not set.
- [x] Allow extensionless non-hidden picked files to pass through as DICOM candidates so DICOMDIR companion files are not silently dropped before backend detection.
- [x] Add preferred `window.radsysxDesktop.importLocalImaging` IPC that keeps selected file paths and bytes inside Electron main and uploads them to the backend import endpoint with the existing session cookie.
- [x] Keep the old `selectLocalImagingFiles` IPC as a compatibility fallback, but route normal Electron worklist imports through the direct main-process upload path.
- [x] Update `desktop:smoke:picker-import` to assert the direct native import bridge is exposed before clicking the worklist `Import folder` action.
- [x] Add `desktop:smoke:picker-large-import` with an additional 8 MiB synthetic NIFTI volume to exercise the direct native picker upload path beyond tiny focused fixtures.
- [x] Fix desktop bridge HTTP proxying so proxied Next.js chunks do not intermittently fail with HTTP parser errors.
- [x] Proxy desktop bridge WebSocket upgrades so Next.js dev-mode hydration can run cleanly behind the one-origin Electron URL.
- [x] Move startup-smoke exit scheduling ahead of final app URL load so `npm run desktop:smoke` cannot hang after services are already ready.
- [x] Add a large-payload synthetic desktop picker smoke to prove bridge/proxy behavior beyond focused smoke fixtures.
- [ ] Add a high-volume many-file synthetic desktop picker smoke to prove folder traversal and upload behavior with many DICOM instances.
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
- [x] For NIFTI, add a short-term backend-mediated default axial preview path.
- [x] For NIFTI, add multi-axis slice navigation for imported local volumes in the worklist inspection panel.
- [x] For PNG/JPEG/GIF/BMP, add backend-mediated local preview retrieval for the inspection panel.
- [x] Add deterministic backend technical analysis for imported DICOM/NIFTI/common image assets.
- [ ] For NIFTI, implement longer-term volume rendering, conversion, or dedicated analysis viewer path beyond backend SVG slice navigation.
- [ ] Add diagnostic/AI/segmentation analysis that consumes local stored files server-side without browser direct third-party transfer.
- [x] Avoid claiming full OHIF image rendering until a real DICOMweb or compatible local source is verified; docs call this minimal local DICOM metadata/frame serving, not full archive parity.
- [x] Ensure the local asset-summary path consumes private local stored files server-side without browser direct third-party transfer.
- [ ] Ensure future AI/segmentation routes can consume local stored files server-side without browser direct third-party transfer.

### Tests And Verification

- [x] Unit-test file format detection through backend endpoint tests for DICOM, DICOMDIR, and NIFTI.
- [x] Unit-test DICOM metadata extraction without PHI logging in manifest.
- [x] Unit-test DICOMDIR reference handling for an included referenced DICOM.
- [x] Unit-test NIFTI detection for `.nii`.
- [x] Unit-test NIFTI detection and header summary for `.nii.gz`.
- [x] Unit-test NIFTI default axial preview retrieval for `.nii.gz`.
- [x] Unit-test NIFTI preview slice metadata and axial/coronal/sagittal preview retrieval.
- [x] Unit-test NIFTI voxel statistics through the local analysis endpoint.
- [x] Unit-test common image fallback import and asset-summary reporting with a synthetic PNG payload.
- [x] Unit-test common image preview retrieval with a synthetic PNG payload.
- [x] Unit-test common image header analysis with a synthetic PNG payload.
- [x] Unit-test local DICOM asset summary reports viewer eligibility for DICOMweb-backed imports.
- [x] Unit-test local DICOM pixel statistics for a simple uncompressed DICOM instance.
- [x] Add backend API test for local import with synthetic/safe files.
- [x] Add frontend type-check coverage for import UI.
- [x] Run `npm run desktop:doctor`.
- [x] Run `npm run desktop:smoke`.
- [x] Run `npm run desktop:smoke:import`.
- [x] Run `npm run desktop:smoke:ui-import`.
- [x] Run `npm run desktop:smoke:picker-import` after adding the picker bridge smoke.
- [x] Run `npm run desktop:smoke:picker-large-import` after adding the large picker payload smoke.
- [x] Run `python3 -m pytest backend/tests/test_clinical_platform.py`.
- [x] Run any new backend tests.
- [x] Run `npm run type-check`.
- [x] Run `npm run build --workspace viewer`.
- [x] Perform a live no-Docker runtime upload smoke through the desktop bridge API with synthetic DICOMDIR+DICOM+`.nii.gz`+PNG files.
- [x] Replace the one-off live no-Docker import smoke with a committed `desktop:smoke:import` command covering DICOMDIR, DICOM, `.nii`, `.nii.gz`, and PNG.
- [x] Extend `desktop:smoke:import` to verify backend-mediated NIFTI SVG preview and PNG byte preview retrieval.
- [x] Extend `desktop:smoke:import` to verify NIFTI preview slice metadata and coronal slice retrieval through the local bridge.
- [x] Extend `desktop:smoke:import` to verify backend local analysis for DICOM intensity range, NIFTI voxel count/mean intensity, and PNG dimensions.
- [x] Add `desktop:smoke:ui-import` to exercise hydrated Electron worklist controls, local drag/drop import, inspection, NIFTI preview controls, and backend technical analysis.
- [x] Perform a true UI drag-and-drop upload smoke through the hydrated Electron worklist controls with synthetic PHI-free files.
- [x] Perform the committed picker bridge smoke through `npm run desktop:smoke:picker-import`.
- [x] Perform the committed large picker payload smoke through `npm run desktop:smoke:picker-large-import`.
- [ ] Perform a native OS file-picker smoke with real or realistic local files once OS-dialog automation is available.

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
  - Evidence: the worklist local import panel now accepts browser drag-and-drop files and Chromium-exposed folders, preserving folder-relative paths as `radsysxRelativePath` before submitting to the backend import endpoint.
  - Evidence: `npm run desktop:smoke:ui-import` now proves the Electron shell hydrates through the one-origin bridge, clicks from the desktop root to `/worklist`, imports synthetic local files through a DOM drag/drop on the real worklist panel, inspects imported studies, switches a NIFTI preview to coronal, and runs backend technical analysis.
  - Evidence: `npm run desktop:smoke:picker-import` is now a committed hydrated Electron picker-bridge smoke; it clicks the real worklist `Import folder` button and proves renderer button, preload IPC, main-process recursive folder collection, backend import, inspection, NIFTI preview controls, and backend technical analysis using PHI-free synthetic files.
  - Evidence: `npm run desktop:smoke:picker-import` passed after fixing Electron-side extensionless DICOM candidate filtering, with `Imported 5 files into 2 local studies.`
  - Evidence: the preferred native picker import now uses `window.radsysxDesktop.importLocalImaging`, keeps selected file paths and bytes in Electron main, attaches the existing session cookie from the Electron cookie jar, and sends file-backed multipart data to `POST /api/local-imaging/import`; the renderer receives only the small backend import response.
  - Evidence: `npm run desktop:smoke:picker-large-import` passed with an additional 8 MiB `large-volume.nii`, yielding `Imported 6 files into 2 local studies.`
  - Evidence: the desktop bridge now sanitizes proxied HTTP headers and proxies WebSocket upgrades, fixing the hydration failures found while creating `desktop:smoke:ui-import`.
  - Evidence: `desktop:smoke:import` now also fetches backend-mediated NIFTI SVG and PNG previews through the local bridge.
  - Evidence: `desktop:smoke:import` now verifies NIFTI preview slice metadata and a non-default coronal preview through the local bridge.
  - Evidence: `desktop:smoke:import` now fetches backend technical analysis results for imported DICOM, NIFTI, and PNG assets through the local bridge.
  - Remaining gap: needs manual or automation-backed native OS dialog upload smoke before final completion.
- Upload/select local DICOM:
  - Evidence: backend endpoint tests import synthetic DICOM through `POST /api/local-imaging/import`; local DICOMweb and asset summary tests prove the stored DICOM is discoverable and viewer-eligible; `npm run desktop:smoke:import` imports synthetic DICOM and reports viewer eligibility.
  - Evidence: backend endpoint tests and `desktop:smoke:import` now prove simple uncompressed DICOM pixel technical analysis, including frame dimensions, intensity range, and mean intensity.
  - Evidence: the Electron native picker can select local imaging files and preserve them for the existing backend import flow.
  - Evidence: `desktop:smoke:ui-import` imports synthetic DICOM plus DICOMDIR through the hydrated worklist drag/drop UI and verifies DICOMDIR asset inspection plus DICOM intensity analysis.
  - Evidence: `desktop:smoke:picker-import` exercises the Electron picker bridge over a fixture folder containing DICOMDIR plus a DICOM instance, then verifies DICOMDIR inspection and DICOM intensity analysis.
  - Evidence: the picker now passes extensionless DICOM candidates such as `SCAN1DCM` through to backend detection, matching common DICOMDIR folder layouts.
  - Remaining gap: native OS dialog upload of a real local DICOM file still needs runtime smoke evidence.
- Upload/select DICOMDIR:
  - Evidence: backend endpoint tests import synthetic DICOMDIR plus referenced DICOM and group them into one local study row; `npm run desktop:smoke:import` imports synthetic DICOMDIR plus referenced DICOM and returns `dicom`/`dicomdir` asset summary.
  - Evidence: the Electron native folder picker preserves relative paths for DICOMDIR-style folder imports.
  - Evidence: `desktop:smoke:ui-import` imports synthetic DICOMDIR plus referenced DICOM through a hydrated worklist drag/drop and verifies the local DICOMDIR row can be inspected.
  - Evidence: `desktop:smoke:picker-import` exercises the hydrated `Import folder` action through the Electron picker bridge and recursive folder collector for a DICOMDIR-style folder.
  - Remaining gap: native OS directory-picker runtime smoke with a realistic DICOMDIR folder remains open.
- Upload/select NIFTI `.nii`:
  - Evidence: backend endpoint tests import a synthetic `.nii` file and register a local worklist row; `npm run desktop:smoke:import` imports `.nii` and verifies analysis-supported asset summary.
  - Evidence: the shared local asset contract now exposes opaque asset IDs plus preview capability flags/URLs for NIFTI assets.
  - Evidence: backend technical analysis now computes NIFTI dimensions, voxel count, intensity range, and mean intensity from private local voxel bytes.
  - Evidence: NIFTI assets now expose preview slice counts and can render axial/coronal/sagittal SVG slices through authenticated backend preview URLs.
  - Evidence: `desktop:smoke:ui-import` imports `.nii` and `.nii.gz` through the hydrated worklist drag/drop UI, verifies the NIFTI row, loaded previews, coronal preview control, and voxel technical analysis.
  - Evidence: `desktop:smoke:picker-import` imports `.nii` through the hydrated `Import folder` picker bridge path and verifies NIFTI inspection, preview loading, coronal preview control, and voxel technical analysis.
  - Evidence: `desktop:smoke:picker-large-import` imports an 8 MiB `.nii` volume through the direct native picker path and verifies `256 x 256 x 128` dimensions plus `8388608` voxel technical analysis.
  - Remaining gap: native OS dialog upload/inspection of `.nii` remains open; full volume rendering and diagnostic/AI analysis are still future work.
- Upload/select NIFTI `.nii.gz`:
  - Evidence: backend endpoint tests import synthetic gzipped NIFTI, preserve relative path, and extract `2 x 3 x 4` dimensions through the asset-summary endpoint; `npm run desktop:smoke:import` imports `.nii.gz` and returns the same dimension summary.
  - Evidence: backend endpoint tests and `desktop:smoke:import` now fetch an authenticated backend-mediated SVG default axial preview for `.nii.gz`.
  - Evidence: backend endpoint tests and `desktop:smoke:import` now prove deterministic voxel statistics for imported NIFTI assets.
  - Evidence: backend endpoint tests now fetch axial/coronal/sagittal preview slices for `.nii.gz`, and `desktop:smoke:import` verifies non-default coronal preview retrieval.
  - Evidence: `desktop:smoke:ui-import` verifies a NIFTI preview image loads in the UI and that selecting the coronal control changes the preview URL to a coronal slice.
  - Evidence: `desktop:smoke:picker-import` imports `.nii.gz` through the hydrated `Import folder` picker bridge path and verifies loaded preview plus coronal preview URL transition.
  - Remaining gap: native OS dialog upload/inspection of `.nii.gz` remains open; full NIFTI volume rendering and diagnostic/AI analysis remain open.
- Generic suitable medical files:
  - Evidence: backend endpoint tests import a synthetic PNG fallback and report it through the asset-summary endpoint; importer accepts PNG/JPEG/TIFF/BMP/GIF extensions; `npm run desktop:smoke:import` imports a PNG fallback and reports it as analysis-supported.
  - Evidence: backend endpoint tests and `desktop:smoke:import` now fetch authenticated PNG preview bytes through the backend preview endpoint.
  - Evidence: backend endpoint tests and `desktop:smoke:import` now prove local PNG header analysis, including image dimensions.
  - Evidence: `desktop:smoke:ui-import` imports PNG through the hydrated worklist drag/drop UI, verifies a preview image loads, and verifies local image dimension analysis.
  - Evidence: `desktop:smoke:picker-import` imports PNG through the hydrated picker bridge path, verifies preview loading, and verifies local image dimension analysis.
  - Remaining gap: native OS dialog upload/inspection of real image fallback files remains open; TIFF is accepted as an analyzable local image file but does not yet have a guaranteed browser-renderable preview.
- Files become usable in worklist/viewer/analysis:
  - Evidence: imported rows are registered in the clinical worklist; DICOM rows are viewer-eligible through local DICOMweb metadata/frame/instance endpoints; NIFTI/image rows are inspectable through backend-owned asset summaries and preview thumbnails in the worklist UI.
  - Evidence: the worklist now renders NIFTI axis buttons and a slice slider backed by authenticated backend preview URLs.
  - Evidence: the worklist now exposes a backend-owned local analysis action and renders deterministic technical metrics returned by `GET /api/local-imaging/studies/{studyUid}/analysis`.
  - Evidence: `desktop:smoke:ui-import` proves those controls work in a hydrated Electron renderer rather than only through API-level smoke calls.
  - Evidence: `desktop:smoke:picker-import` proves those controls also work after files arrive from the Electron native picker bridge rather than synthetic DOM drag/drop.
  - Evidence: the native picker path no longer requires selected file contents to be marshalled through renderer IPC before backend import, reducing the fragility of larger local DICOM/NIFTI folders.
  - Evidence: `desktop:smoke:picker-large-import` verifies backend summary text for the `256 x 256 x 128` larger NIFTI, preview loading, coronal slice switching, and backend analysis text including the `8388608` voxel count.
  - Remaining gap: full OHIF pixel rendering across real-world DICOM and richer diagnostic/AI NIFTI/image analysis remain unproven.
- No Docker required for the fast path:
  - Evidence: Electron supervises FastAPI, Next.js, and the local viewer bridge; local import, worklist, asset summaries/previews/analysis, and local DICOMweb are backend filesystem/database contracts, not Docker/Orthanc-only contracts; `npm run desktop:smoke:import` passed while compose/Orthanc were not running.
  - Evidence: `npm run desktop:smoke:ui-import` passed while compose/Orthanc were not running and exercised the hydrated Electron worklist drag/drop surface.
  - Evidence: `npm run desktop:smoke:picker-import` passed while compose/Orthanc were not running and exercised the native picker bridge path.
  - Evidence: `npm run desktop:smoke:picker-large-import` passed while compose/Orthanc were not running and exercised direct native picker upload of an 8 MiB NIFTI payload.
  - Remaining gap: final native OS dialog smoke should be repeated with real or realistic local files.
- Cross-platform design:
  - Evidence: browser file inputs preserve `webkitRelativePath` when available; browser drag-and-drop preserves Chromium directory-entry relative paths as `radsysxRelativePath`; Electron picks preserve `radsysxRelativePath`; backend sanitizes POSIX-style relative paths and stores private files under configured local storage; docs use Linux commands while Electron path avoids Docker-specific assumptions.
  - Evidence: desktop UI smoke uses Electron/Chromium APIs and repo-local temp storage/database, avoiding Linux-only paths inside the app/runtime path.
  - Evidence: picker bridge smoke uses JSON-encoded fixture paths and Electron IPC, avoiding Linux-only renderer file APIs while still preserving POSIX-style relative paths for backend manifests.
  - Evidence: direct native import relies on Electron IPC, the Electron cookie jar, Node file-backed blobs, and backend multipart upload rather than Linux-specific renderer file APIs or absolute-path exposure.
  - Evidence: the large picker payload smoke uses the same Electron-main direct upload path and avoids renderer `File`/`ArrayBuffer` construction for the 8 MiB NIFTI.
  - Remaining gap: Windows/macOS native directory picker behavior is implemented via Electron but not yet tested on those OSes.
- PHI/security guardrails preserved:
  - Evidence: imported files stay outside public static routes; manifests avoid raw DICOM patient identifiers in tests; local asset summaries/previews/analysis omit private stored paths and raw DICOM tags; endpoints require signed backend session and `RADSYSX_LOCAL_IMAGING_ENABLED`.
  - Remaining gap: broader real-world PHI log audit remains open.
- Tests and runtime smoke:
  - Evidence: focused local imaging backend tests and Python compile checks passed during this tranche; full clinical platform test suite passed; frontend/viewer type-checks passed; viewer build passed; desktop doctor and desktop smoke passed; committed desktop import smoke passed.
  - Evidence: after the preview tranche, `python3 -m pytest backend/tests/test_clinical_platform.py` passed with 26 tests and the expected warnings.
  - Evidence: after the local technical analysis tranche, `python3 -m pytest backend/tests/test_clinical_platform.py` passed with 26 tests and the expected warnings; broader verification must be rerun after final edits.
  - Evidence: after the drag-and-drop import tranche, `npm run type-check --workspace frontend`, `npm run type-check`, `npm run desktop:smoke:import`, `npm run desktop:doctor`, `python3 -m pytest backend/tests/test_clinical_platform.py`, `npm run desktop:smoke`, and `git diff --check` passed.
  - Evidence: after the hydrated UI import smoke tranche, `node --check desktop/src/main.mjs desktop/scripts/doctor.mjs desktop/scripts/import-smoke.mjs desktop/scripts/ui-import-smoke.mjs`, `npm run type-check`, `npm run desktop:doctor`, `. .venv/bin/activate && python3 -m pytest backend/tests/test_clinical_platform.py`, `npm run desktop:smoke:ui-import`, `npm run desktop:smoke:import`, `npm run desktop:smoke`, `. .venv/bin/activate && python3 -m compileall backend/clinical backend/server.py backend/radsysx.py`, `npm run build --workspace viewer`, and `git diff --check` passed; smoke ports were clear afterward.
  - Evidence: after the native picker bridge smoke tranche, `node --check desktop/src/main.mjs desktop/scripts/ui-import-smoke.mjs`, `node --check desktop/src/main.mjs desktop/scripts/ui-import-smoke.mjs desktop/scripts/doctor.mjs desktop/scripts/import-smoke.mjs`, `npm run desktop:smoke:picker-import`, `npm run desktop:smoke:ui-import`, `npm run desktop:smoke:import`, `npm run desktop:doctor`, `npm run type-check`, `npm run desktop:smoke`, `. .venv/bin/activate && python3 -m compileall backend/clinical backend/server.py backend/radsysx.py`, `. .venv/bin/activate && python3 -m pytest backend/tests/test_clinical_platform.py`, `npm run build --workspace viewer`, and `git diff --check` passed; checked smoke ports were clear afterward.
  - Evidence: after the direct native import tranche, `node --check desktop/src/main.mjs desktop/src/preload.cjs desktop/scripts/ui-import-smoke.mjs`, `npm run type-check --workspace frontend`, `npm run desktop:smoke:picker-import`, `node --check desktop/src/main.mjs desktop/src/preload.cjs desktop/scripts/doctor.mjs desktop/scripts/import-smoke.mjs desktop/scripts/ui-import-smoke.mjs`, `npm run type-check`, `npm run desktop:smoke:ui-import`, `npm run desktop:smoke:import`, `npm run desktop:doctor`, `. .venv/bin/activate && python3 -m compileall backend/clinical backend/server.py backend/radsysx.py`, `. .venv/bin/activate && python3 -m pytest backend/tests/test_clinical_platform.py`, `npm run build --workspace viewer`, and `npm run desktop:smoke` passed before final hygiene; checked smoke ports were clear afterward.
  - Evidence: after the large picker payload tranche, `node --check desktop/src/main.mjs desktop/src/preload.cjs desktop/scripts/doctor.mjs desktop/scripts/import-smoke.mjs desktop/scripts/ui-import-smoke.mjs`, `npm run type-check`, `. .venv/bin/activate && python3 -m compileall backend/clinical backend/server.py backend/radsysx.py`, `. .venv/bin/activate && python3 -m pytest backend/tests/test_clinical_platform.py`, `npm run build --workspace viewer`, `npm run desktop:doctor`, `npm run desktop:smoke`, `npm run desktop:smoke:import`, `npm run desktop:smoke:picker-large-import`, `npm run desktop:smoke:picker-import`, `npm run desktop:smoke:ui-import`, and `git diff --check` passed; checked smoke ports were clear afterward.
  - Evidence: a parallel rerun of two desktop UI smokes was discarded because those scripts share default high ports; final verification reran all affected UI smokes sequentially.
  - Remaining gap: native OS dialog upload smoke and full real-world viewer rendering remain open before marking complete.

If any evidence slot is missing, weak, indirect, or only proves a narrower behavior, keep the goal active.
