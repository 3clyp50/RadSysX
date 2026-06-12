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
- Do not add PHI-bearing launch context to desktop URLs.
- Do not let the browser write directly to Orthanc; backend-mediated derived result paths remain authoritative.
- A missing local DICOMweb archive should degrade honestly. Full Orthanc-backed image retrieval remains the compose-stack path until a local archive bundle is added.
- Desktop sets `RADSYSX_LOCAL_IMAGING_ENABLED=true` and stores local imports in an ignored repo-local backend data directory unless overridden.
- When `RADSYSX_DESKTOP_DICOMWEB_TARGET` is unset, the desktop bridge routes `/dicom-web` to the backend's local DICOMweb endpoints for imported DICOM studies.

## Work Guidance

- Prefer Node built-ins for process supervision and local proxying unless a dependency removes meaningful complexity.
- Keep startup errors actionable for non-specialist local users.
- Use repo-local `.venv` and workspace-managed npm dependencies.
- Preserve Linux-native commands in docs and scripts.

## Verification

- `npm run desktop:doctor`
- `npm run desktop:smoke`
- `node --check desktop/src/main.mjs`
- `node --check desktop/scripts/doctor.mjs`

## Child DOX Index
