# Viewer Assets DOX

## Purpose

- Own RadSysX runtime assets injected into the OHIF distribution.

## Ownership

- Owns `radsysx-bootstrap.js`, `radsysx-ohif-extension.js`, `radsysx-ohif-mode.js`, and `radsysx-viewer.css`.

## Local Contracts

- Bootstrap must require a governed launch session, resolve it through `/api/imaging/launch/resolve`, and strip sensitive launch query parameters.
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

## Child DOX Index
