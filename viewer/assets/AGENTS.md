# Viewer Assets DOX

## Purpose

- Own RadSysX runtime assets injected into the OHIF distribution.

## Ownership

- Owns `radsysx-bootstrap.js`, `radsysx-ohif-extension.js`, `radsysx-ohif-mode.js`, and `radsysx-viewer.css`.

## Local Contracts

- Bootstrap must require a governed launch session, resolve it through `/api/imaging/launch/resolve`, and strip sensitive launch query parameters.
- The only no-launch exception is Electron local start: `/viewer/?local=1` may show the OHIF local-start import screen when `window.radsysxDesktop.importLocalImaging` exists. That path must auto-establish only the seeded local session, import through the backend local imaging contract, launch imported DICOM through `POST /api/imaging/launch`, and route non-DICOM local imports to `/worklist` inspection.
- Runtime DICOMweb roots must come from backend `viewerRuntime`.
- Workspace panels must use backend clinical endpoints for reports, AI jobs, derived results, workspace refresh, and audit.
- Direct browser STOW to Orthanc must remain disabled unless the governed backend contract explicitly changes.

## Work Guidance

- Keep global `window.__RADSYSX_*` usage deliberate and documented by nearby code.
- Keep UI resilient to missing launch/session/workspace state.
- Avoid storing PHI or launch context beyond what is required to survive login redirects.

## Verification

- `npm run type-check --workspace viewer`
- `npm run build --workspace viewer`
- `npm run desktop:smoke:local-start`
- `npm run desktop:smoke:local-start-nondicom`

## Child DOX Index
