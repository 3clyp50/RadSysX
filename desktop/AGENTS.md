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
- The default desktop frontend path is a production Next.js standalone shell built with the Electron bridge origin and reused via `frontend/.next/radsysx-desktop-build.json`; use `RADSYSX_DESKTOP_REBUILD_FRONTEND=1` to force a rebuild.
- `RADSYSX_DESKTOP_FRONTEND_MODE=development` is the explicit live-UI-development mode and may use the Next.js dev server; normal fast-path validation should prefer the production standalone frontend.
- The local bridge may serve the generated `viewer/dist/` app and proxy backend routes, but durable OHIF behavior still belongs in `viewer/` assets or backend contracts.
- The local bridge must proxy Next.js development static assets and WebSocket upgrades reliably enough for the Electron shell to hydrate through the one-origin desktop URL.
- The bridge may use tolerant HTTP parsing only for trusted loopback upstreams that the desktop runtime starts itself; do not apply parser leniency to arbitrary remote archive targets.
- Do not add PHI-bearing launch context to desktop URLs.
- Do not let the browser write directly to Orthanc; backend-mediated derived result paths remain authoritative.
- A missing local DICOMweb archive should degrade honestly. Full Orthanc-backed image retrieval remains the compose-stack path until a local archive bundle is added.
- Desktop sets `RADSYSX_LOCAL_IMAGING_ENABLED=true` and stores local imports in an ignored repo-local backend data directory unless overridden.
- When `RADSYSX_DESKTOP_DICOMWEB_TARGET` is unset, the desktop bridge routes `/dicom-web` to the backend's local DICOMweb endpoints for imported DICOM studies.
- `preload.cjs` exposes only narrow desktop helpers, including native local imaging file/folder selection and the preferred direct desktop import bridge; browser drag-and-drop remains a portable frontend fallback and must still import through backend contracts. Do not expose raw filesystem or shell primitives to the renderer.
- The preferred native desktop import path should keep selected file paths and file bytes in Electron main, attach the existing backend-issued session cookie from the Electron cookie jar, and POST multipart data to `POST /api/local-imaging/import` through the one-origin desktop bridge.
- The legacy `selectLocalImagingFiles` helper may remain as a compatibility fallback, but normal desktop worklist imports should prefer `importLocalImaging` so large folders do not need to cross renderer IPC as ArrayBuffers.
- The desktop native picker must admit extensionless non-hidden files as DICOM candidates so DICOMDIR companion files can reach backend format detection; unsupported candidates are still rejected by the backend import contract.
- `RADSYSX_DESKTOP_ALLOW_TEST_SHUTDOWN=1` enables the local `/_radsysx/desktop/shutdown` endpoint for smoke tests only; do not enable it for normal desktop runs.
- `RADSYSX_DESKTOP_PICKER_TEST_PATHS` may be honored only when `RADSYSX_DESKTOP_ALLOW_TEST_SHUTDOWN=1`; it is a smoke-only native picker bridge override, not a normal desktop runtime feature.
- `RADSYSX_DESKTOP_EXIT_AFTER_READY_MS` should schedule smoke shutdown immediately after internal services report ready, before waiting on the final app URL load, so startup smokes cannot hang behind slow dev-shell navigation; scheduled startup-smoke teardown may suppress transient loopback Next.js dev asset parse noise.
- `npm run desktop:smoke:import` should keep proving local DICOMDIR/DICOM/NIFTI/image import, asset summaries, local previews including NIFTI slice navigation, backend technical analysis, DICOMweb discovery, and opaque launch without Docker.
- `npm run desktop:smoke:ui-import` should keep proving the hydrated worklist UI can import dropped local imaging files, inspect imported assets, change NIFTI preview slices, and run backend technical analysis without Docker.
- `npm run desktop:smoke:picker-import` should keep proving the hydrated worklist UI can invoke the Electron native picker bridge through `preload.cjs`, read a selected folder through the main-process recursive collector, upload selected files from Electron main to the backend import endpoint, inspect imported assets, change NIFTI preview slices, and run backend technical analysis without Docker. This does not replace a human or OS-automation smoke of the actual native dialog.
- `npm run desktop:smoke:picker-large-import` should keep proving the same direct native picker import path with an additional 8 MiB synthetic NIFTI volume, including backend asset summary, preview, and technical analysis checks.
- `npm run desktop:smoke:picker-many-import` should keep proving the same direct native picker import path with a nested folder of 32 additional extensionless DICOM instances, including recursive folder collection, backend import of 37 files, DICOM asset summary, and technical analysis checks.
- Run desktop UI smoke commands sequentially unless their ports are explicitly overridden; by default they share fixed high ports for Electron, the bridge, Next.js, and FastAPI.

## Work Guidance

- Prefer Node built-ins for process supervision and local proxying unless a dependency removes meaningful complexity.
- Keep startup errors actionable for non-specialist local users.
- Use repo-local `.venv` and workspace-managed npm dependencies.
- Preserve Linux-native commands in docs and scripts.

## Verification

- `npm run desktop:doctor`
- `npm run desktop:smoke`
- `npm run desktop:smoke:import`
- `npm run desktop:smoke:picker-large-import`
- `npm run desktop:smoke:picker-many-import`
- `npm run desktop:smoke:picker-import`
- `npm run desktop:smoke:ui-import`
- `node --check desktop/src/main.mjs`
- `node --check desktop/scripts/dev-frontend.mjs`
- `node --check desktop/scripts/doctor.mjs`
- `node --check desktop/scripts/import-smoke.mjs`
- `node --check desktop/scripts/startup-smoke.mjs`
- `node --check desktop/scripts/ui-import-smoke.mjs`
- `npm run build --workspace frontend`

## Child DOX Index
