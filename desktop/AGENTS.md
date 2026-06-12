# Desktop DOX

## Purpose

- Own the RadSysX Electron fast path for local, no-Docker startup.
- Provide a friendly desktop entry point that starts the local FastAPI backend, Next.js shell, and OHIF viewer bridge under one localhost origin.
- Enable the backend-owned local imaging import path for no-Docker DICOM/DICOMDIR/NIFTI/fallback-file ingestion.

## Ownership

- Owns `package.json`, Electron main/preload code, desktop helper scripts, and local desktop runtime documentation.
- Does not own clinical backend contracts, frontend route behavior, or viewer runtime assets.

## Local Contracts

- The desktop path is a local convenience runtime, not a shortcut around governed clinical contracts.
- Electron must keep the app shell, `/api`, and `/viewer` under one local origin so clinical cookies and opaque launch sessions work without nginx.
- The local bridge may serve the generated `viewer/dist/` app and proxy backend routes, but durable OHIF behavior still belongs in `viewer/` assets or backend contracts.
- The local bridge must proxy Next.js development static assets and WebSocket upgrades reliably enough for the Electron shell to hydrate through the one-origin desktop URL.
- Do not add PHI-bearing launch context to desktop URLs.
- Do not let the browser write directly to Orthanc; backend-mediated derived result paths remain authoritative.
- A missing local DICOMweb archive should degrade honestly. Full Orthanc-backed image retrieval remains the compose-stack path until a local archive bundle is added.
- Desktop sets `RADSYSX_LOCAL_IMAGING_ENABLED=true` and stores local imports in an ignored repo-local backend data directory unless overridden.
- When `RADSYSX_DESKTOP_DICOMWEB_TARGET` is unset, the desktop bridge routes `/dicom-web` to the backend's local DICOMweb endpoints for imported DICOM studies.
- `preload.cjs` exposes only narrow desktop helpers, including the native local imaging file/folder picker; browser drag-and-drop remains a portable frontend fallback and must still import through backend contracts. Do not expose raw filesystem or shell primitives to the renderer.
- The desktop native picker must admit extensionless non-hidden files as DICOM candidates so DICOMDIR companion files can reach backend format detection; unsupported candidates are still rejected by the backend import contract.
- `RADSYSX_DESKTOP_ALLOW_TEST_SHUTDOWN=1` enables the local `/_radsysx/desktop/shutdown` endpoint for smoke tests only; do not enable it for normal desktop runs.
- `RADSYSX_DESKTOP_PICKER_TEST_PATHS` may be honored only when `RADSYSX_DESKTOP_ALLOW_TEST_SHUTDOWN=1`; it is a smoke-only native picker bridge override, not a normal desktop runtime feature.
- `npm run desktop:smoke:import` should keep proving local DICOMDIR/DICOM/NIFTI/image import, asset summaries, local previews including NIFTI slice navigation, backend technical analysis, DICOMweb discovery, and opaque launch without Docker.
- `npm run desktop:smoke:ui-import` should keep proving the hydrated worklist UI can import dropped local imaging files, inspect imported assets, change NIFTI preview slices, and run backend technical analysis without Docker.
- `npm run desktop:smoke:picker-import` should keep proving the hydrated worklist UI can invoke the Electron native picker bridge through `preload.cjs`, read a selected folder through the main-process recursive collector, submit the returned files to backend import, inspect imported assets, change NIFTI preview slices, and run backend technical analysis without Docker. This does not replace a human or OS-automation smoke of the actual native dialog.

## Work Guidance

- Prefer Node built-ins for process supervision and local proxying unless a dependency removes meaningful complexity.
- Keep startup errors actionable for non-specialist local users.
- Use repo-local `.venv` and workspace-managed npm dependencies.
- Preserve Linux-native commands in docs and scripts.

## Verification

- `npm run desktop:doctor`
- `npm run desktop:smoke`
- `npm run desktop:smoke:import`
- `npm run desktop:smoke:picker-import`
- `npm run desktop:smoke:ui-import`
- `node --check desktop/src/main.mjs`
- `node --check desktop/scripts/doctor.mjs`
- `node --check desktop/scripts/import-smoke.mjs`
- `node --check desktop/scripts/ui-import-smoke.mjs`

## Child DOX Index
