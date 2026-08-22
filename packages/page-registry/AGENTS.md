# Page registry functional core

- Page definitions and lifecycle transitions are explicit typed data.
- Preserve the accepted PageJson and page-version approval invariants documented in the relevant ADRs.
- Do not allow provider/storage representations to become the domain source of truth.
- Validate persisted JSON at ingress, map it into domain types, and surface incompatible historical data explicitly.
- Changes to approval, preview, or publication state require focused transition tests.
