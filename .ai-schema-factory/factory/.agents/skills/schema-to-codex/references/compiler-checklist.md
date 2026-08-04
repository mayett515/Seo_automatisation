# Schema to Codex Compiler Checklist

Before generating files:

- [ ] Approved blueprint exists.
- [ ] Target stack known.
- [ ] Folder map known.
- [ ] Cognitive modes known.
- [ ] Context shards chosen.
- [ ] Skills chosen.
- [ ] Codex runtime needs known.
- [ ] Test prompts written.

After generating files:

- [ ] `AGENTS.md` is concise.
- [ ] Every skill has good trigger phrases.
- [ ] `.ai-rules` files use YAML/XML/Markdown.
- [ ] Every normal-domain file above the default 15-rule threshold declares `rule_budget: "cohesion-retained"` and has a cohesion and attention rationale.
- [ ] Terminal leaves do not route downward.
- [ ] Test prompts are included.
