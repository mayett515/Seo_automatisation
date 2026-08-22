# Shared packages

- A package owns a coherent capability, contract, or adapter boundary—not merely a technical file category.
- Avoid circular package ownership and mirrored public types.
- Public exports are deliberate. Do not expose internal row, provider, or framework types for convenience.
- Keep transformations near the concept they own; do not create global `helpers` or `types` dumping grounds.
