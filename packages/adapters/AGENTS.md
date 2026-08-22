# Adapters

- Adapters translate external APIs and storage shapes into internal contracts.
- Provider SDK types and errors stop here; normalize them before returning inward.
- Keep retries, timeouts, cancellation, authentication, and provider-specific pagination visible.
- An adapter does not own product eligibility or business policy.
- Preserve provider response evidence needed for auditability without leaking secrets or raw bodies to clients.
