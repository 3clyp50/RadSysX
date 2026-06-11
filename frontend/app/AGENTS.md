# Frontend App Routes DOX

## Purpose

- Own Next.js route files for the RadSysX shell.

## Ownership

- Owns `layout.tsx`, `page.tsx`, `login/`, `worklist/`, route assets, and child route handlers under `api/`.

## Local Contracts

- `/login` establishes local seeded clinical sessions through the backend.
- `/worklist` is the clinical launch surface and must create opaque imaging launch sessions through the backend.
- `/` may help select or explain surfaces, but must not become a clinical viewer runtime.
- Do not add a Next.js `/viewer` route for clinical fallback.
- Route copy and behavior must preserve the distinction between research and governed clinical modes.

## Work Guidance

- Redirect unauthenticated clinical users to `/login` through backend session checks.
- Keep worklist launch URLs opaque and backend-issued.
- Keep client-side state secondary to backend contracts.

## Verification

- `npm run type-check --workspace frontend`

## Child DOX Index

- `frontend/app/api/AGENTS.md`: research-only Next route handlers.
