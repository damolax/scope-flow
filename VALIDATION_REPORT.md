# ScopeFlow 6 validation report

Validated before packaging:

- 41 TypeScript/TSX source files parsed successfully.
- Strict semantic source validation passed using dependency-compatible declarations.
- Delivery calculation tests passed for calendar days, business days, pause/resume and urgency states.
- Legacy single-invoice migration and multiple-invoice calculations passed.
- Versioned backup creation and validation tests passed.
- JSON configuration files parsed successfully.
- CSS braces/comments/quoted strings passed structural validation.
- Deployment shell scripts passed `bash -n`.
- Package lock uses the public npm registry and contains no private OpenAI registry URLs.
- Final ZIP extraction and integrity are checked after creation.

The complete dependency-backed Next.js production build is executed by Vercel after the repository push. Dependency installation could not be completed inside the artifact container because outbound npm installation timed out; this is not represented as a successful local production build.
