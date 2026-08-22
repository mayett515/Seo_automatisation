# Application shell

Code under `apps/` is a procedural shell. It reads state, delegates decisions to the functional core, performs effects, and maps results back to the transport or UI.

- Keep business policy out of controllers, workers, route loaders, effects, and provider adapters.
- Normalize provider failures before they cross into domain code.
- Make effect ordering explicit and readable from top to bottom.
- Do not swallow failures or emit a success-looking state when an effect did not happen.
- Infrastructure construction belongs in the composition root or providers, not scattered through features.
