# Scout Run Review Artifacts

Store short human review notes for real-provider Opportunity Scout smoke runs here.

Each note should record:

- run id, date, and branch,
- provider/model,
- terminal `agent_runs.status` and `failure_code`,
- QA gate id when `failure_code = qa_rejected`,
- latency and usage/cost summary,
- persisted brief count and classification histogram,
- `input_ref` key only, not the packet contents,
- sanitized diagnostics summary,
- whether failure taxonomy was correct,
- whether the output used honest evidence refs,
- whether the German local SEO quality was plausible,
- follow-up prompt or packet tuning decisions.

For `ok: true` runs, store validated model output only for the synthetic
Martines fixture project. Real-customer-project runs must not commit validated
output, packet contents, customer notes, competitor body text, or other customer
data dumps.

Do not store API keys, raw prompts, unredacted provider responses, full competitor text, or customer data dumps.
