# End-to-end tests (Playwright)

- Install dependencies: `npm install`
- Run a smoke test against a running app (defaults to `http://localhost:3000`): `npm run test:e2e`
- To auto-start the dev server for tests, leave `E2E_WEB_SERVER` unset (default). Set `E2E_WEB_SERVER=0` if you are pointing at an already running instance.
- Override the target URL with `E2E_BASE_URL=http://127.0.0.1:3000`.

## Authenticated surfaces
- Save a signed-in storage state to `playwright/.auth/user.json` (or set `E2E_STORAGE_STATE` to another file). Playwright will reuse it automatically for authenticated projects.
- Auth-dependent specs are skipped when no storage state is found. Generate one by running Playwright headed, signing in, and saving storage state (`npx playwright codegen --save-storage=playwright/.auth/user.json http://localhost:3000`).

## Coverage roadmap (steps 1-4)
- Step 1 (initial smoke): `landing.spec.ts` hits the public marketing page; `home-authenticated.spec.ts` stubs `/api/posts` for a predictable feed once auth state is provided.
- Step 2 (uploads pipeline): `uploads.spec.ts` drives the upload harness (`/playwright-harness/uploads`) with mocked presign/part/complete endpoints.
- Step 3 (chat & party realtime): `chat-party.spec.ts` drives the chat/party harness (`/playwright-harness/chat`) to send messages, surface typing, and resume party state.
- Step 4 (social graph & requests): `social-requests.spec.ts` drives the social harness (`/playwright-harness/social`) to validate request counters across friend/capsule/party actions.
