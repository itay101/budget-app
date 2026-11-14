# Import column detection uses AI Gateway on a shape-masked sample

File Import asks an AI model which columns hold the Date, Payee, Memo and
amount, which row is the header, whether amounts are one signed column or
Inflow/Outflow, and the date format (#197). A confident answer skips the
mapping step. A less confident one opens the mapping step pre-filled.

- **Provider:** Vercel AI Gateway through the `ai` SDK, called from the
  `detectImportColumns` server action. The model is
  `IMPORT_DETECTION_MODEL`, defaulting to `google/gemini-2.5-flash-lite`.
  The team's Gateway is on the free tier, which serves only some models
  and refuses the rest (403 `RestrictedModelsError`); Anthropic models
  aren't among them, so Claude Haiku, the first choice, was refused. The
  default is small and fast (no thinking by default), reliable at
  structured output and handles Hebrew headers. It's a setting so the
  model can follow the team's plan without a code change. On Vercel the Gateway authenticates with the deployment's
  OIDC token, so production and previews need no new secret. Elsewhere it
  needs `AI_GATEWAY_API_KEY`. With neither, the feature is off, which is
  the case for local dev and e2e: the account page tells the modal so, and
  the modal goes straight to the mapping step as before, with no request.
  Usage is billed to the Vercel team, and the Gateway must be enabled
  there. If it isn't, every
  call fails and File Import falls back to the heuristics.
- **What leaves the browser:** the rows up to the heuristically guessed
  header row, that header row, and the first 5 data rows: at most 12 rows,
  30 columns and 60 characters per cell, enforced on the client and again
  on the server. Every row except the guessed header is masked in the
  browser. Its shape is kept and its content is replaced: digits become
  `9`, and letters become `X` or `x`. So `-1,234.56` is sent as
  `-9,999.99` and `ACME Coffee #12` as `XXXX Xxxxxx #99`. The header is
  sent as plain text because column names are what the model needs most
  and aren't personal, but only when the guess is backed by a data row
  right after it and the guessed row isn't a data row itself. Otherwise
  (a file with no header row, or no recognizable data) every row is
  masked, so a real transaction or account line can't be sent by mistake.
  The modal tells the user that a masked sample is sent while detection
  runs.
- **Precedence:** the account's saved mapping, then AI, then the
  header-name heuristics. When a saved mapping exists, detection doesn't
  run and nothing is sent. The server gives the model 5 seconds and makes
  no retries. The client gives up after 7. Any failure, timeout or
  unusable answer falls back to the heuristics, and the mapping step then
  says detection didn't work, so a failure isn't mistaken for a
  low-confidence answer.
- **Skipping the mapping step** needs all of these: Date, Payee and the
  amount column(s) for the mode (Amount, or both Inflow and Outflow) are
  present; they and the amount mode each have a confidence of at least 0.8;
  no two fields share a column; and our own parser reads the date and
  amount of every sampled data row with that mapping. The last check is
  deterministic and doesn't rely on the model's own confidence.
- **Correcting a mistake:** after a skip, the preview step says the
  columns were detected and links back to the mapping step, pre-filled
  with the detection. Whatever is confirmed there is saved per account as
  before (`importMappingPreferences`). A skip saves the detected mapping
  too, so the next import into that account uses it with no AI call.
