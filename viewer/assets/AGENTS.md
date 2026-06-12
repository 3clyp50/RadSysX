# Viewer Assets DOX

## Purpose

- Own RadSysX runtime assets injected into the OHIF distribution.

## Ownership

- Owns `radsysx-bootstrap.js`, `radsysx-ohif-extension.js`, `radsysx-ohif-mode.js`, and `radsysx-viewer.css`.

## Local Contracts

- Bootstrap must require a governed launch session for governed viewer URLs, resolve it through `/api/imaging/launch/resolve`, and strip sensitive launch query parameters.
- The no-launch exception is standalone local OHIF mode: `/viewer/local` and `/viewer/dicomlocal` must render without a governed launch, suppress the clinical workspace panel, register OHIF's `dicomlocal` data source, keep `/viewer` as the router base on subroutes, and let local DICOM files load directly into OHIF. Legacy `/viewer/?local=1` should be treated as a compatibility entry and redirected into `/viewer/local`, not shown as an intermediate RadSysX card.
- Standalone local drop handling may forward file drops to OHIF's local file input, but it must not create a governed launch or expose PHI-bearing study context in the URL. Non-DICOM local assets remain a backend/worklist inspection path until OHIF-native rendering for those formats is implemented.
- The viewer must keep the visible app/document title as `RadSysX`.
- The RadSysX AI right-sidebar panel is currently frontend-only. It may keep local chat state, expose text and voice-input composer affordances, and attach ROI/segmentation/measurement chips through `@`, but it must not call backend AI endpoints or imply persisted clinical AI context until the backend contract is explicitly designed.
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
- `npm run desktop:smoke:local-start-drop`
- `npm run desktop:smoke:local-start-nondicom`

## Child DOX Index
