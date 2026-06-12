# Clinical Backend DOX

## Purpose

- Own the governed clinical FastAPI implementation for sessions, worklist, launch, workspace, reports, AI jobs, derived results, DICOMweb handoff, and audit.

## Ownership

- Owns `auth.py`, `config.py`, `contracts.py`, `db.py`, `dicomweb.py`, `local_imaging.py`, `models.py`, `repositories.py`, `seed_orthanc.py`, and `services.py`.
- Owns SQLAlchemy-backed clinical persistence behavior and seed data conventions.

## Local Contracts

- Backend-issued signed session cookies are the source of actor identity until real OIDC replaces local auth.
- Do not accept browser-supplied `role`, `user_id`, `requestedBy`, or equivalent actor identity for governed APIs.
- Keep launch sessions opaque. PHI-bearing context must be resolved server-side and not encoded directly into viewer URLs.
- Keep DICOM SR/SEG and other derived object writeback mediated by the backend, including STOW via `POST /api/derived-results/stow`.
- Keep local imaging import and local DICOMweb serving backend-owned through `local_imaging.py`; imported files must stay in private local storage, not public frontend paths.
- `contracts.py` must stay aligned with `packages/clinical-web/src/contracts.ts`.
- `config.py` owns mode, auth, cookie, viewer, archive, AI, and database settings. Governed modes must not silently fall back to insecure secrets.

## Work Guidance

- Put request/response definitions in `contracts.py`.
- Put orchestration and policy in `services.py`.
- Put persistence in `repositories.py` and `models.py`.
- Put DICOMweb/Orthanc boundary logic in `dicomweb.py`.
- Put local DICOM/DICOMDIR/NIFTI/fallback-file import detection, storage, and local DICOMweb metadata/frame serving logic in `local_imaging.py`.
- Keep audit events meaningful but avoid recording unnecessary identifiers or payload detail.

## Verification

- `python3 -m pytest backend/tests/test_clinical_platform.py`
- `python3 -m compileall backend/clinical backend/server.py`

## Child DOX Index
