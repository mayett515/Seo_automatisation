# Agentic Workflows And Model Context Protocol (MCP)

Walk in here to lift the working parts of modern AI agents: execution loops, memory graphs, browser interaction, tool-calling interfaces. In the agentic era, software is no longer built only for human consumption — it's browsed, queried, and manipulated by LLM-driven agents. Find the mechanism you need and take it, rather than adopting a whole framework.

---

## 1. Orchestration & State Graphs

These frameworks handle the execution loop of agents: deciding when to call a tool, how to persist conversation state, how to route between multiple agents, and how to recover from errors. Lift the loop or the routing logic that matches your setup.

### Core Repos

| Link | Good For | What to steal |
| --- | --- | --- |
| [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) | Stateful, multi-actor applications with feedback loops. | Steal graph-based routing, state persistence/checkpoints (enabling time-travel debugging of agents), and concurrent step execution. |
| [joaomdmoura/crewai](https://github.com/joaomdmoura/crewai) | Orchestrating teams of role-based agents. | Steal how tasks are broken down and delegated, how context is passed between agents, and how feedback loops evaluate output quality. |
| [agno-agi/agno](https://github.com/agno-agi/agno) | Lightweight, single-agent assistants with structured outputs. | Steal their minimal approach to tool-calling (converting python functions into JSON schema descriptions) and structured model validation. |
| [geekan/MetaGPT](https://github.com/geekan/MetaGPT) | Simulating multi-agent software engineering departments. | Steal their Standard Operating Procedure (SOP) design pattern: translating human processes into structured agent execution steps. |
| [mastra-ai/mastra](https://github.com/mastra-ai/mastra) | Production-grade AI agent framework in TypeScript. | Steal native type-safe agent tool-calling loops using Zod validation, declarative workflows, and built-in evaluators. |
| [0xPlaygrounds/rig](https://github.com/0xPlaygrounds/rig) | Modular, high-performance LLM agent framework in Rust. | Steal Rust-native tool-calling wrappers, async memory state pipelines, vector-store abstraction drivers, and WASM compatibility. |


---

## 2. Tool Integration & The Model Context Protocol (MCP)

Introduced by Anthropic, the Model Context Protocol (MCP) has quickly become the open standard for connecting AI clients (e.g., Claude Desktop, Cursor, Zed) to external tools and database environments.

### Core Repos & Connectors

| Link | Good For | What to steal |
| --- | --- | --- |
| [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) | Reference MCP servers built by the steering group. | Steal the server-client protocol handshake, prompt listing, resource reading, and tool call serialization (SQLite, Postgres, Git, Filesystem). |
| [punkpeye/awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) | Curated catalog of community-built MCP integrations. | Steal how developers connect AI to Slack, Notion, GitHub API, Cloudflare, local shells, and external memory caches. |

---

## 3. Sandboxing, Action, & Visual Grounding

For agents to act safely and effectively, they need sandboxed computation environments to execute code, alongside visual models to interact with browser interfaces. Lift the sandbox or grounding approach that fits how your agent needs to act.

### Core Repos

| Link | Good For | What to steal |
| --- | --- | --- |
| [e2b-dev/code-interpreter](https://github.com/e2b-dev/code-interpreter) | Running untrusted agent-generated code in sandboxed micro-VMs. | Steal their Firecracker micro-VM orchestration, terminal input/output multiplexing, and secure network gating patterns. |
| [browserbase/stagehand](https://github.com/browserbase/stagehand) | Web browsing agents utilizing the accessibility tree. | Steal how they parse the DOM accessibility tree to present a simplified representation to the LLM, reducing tokens and improving action accuracy. |
| [browser-use/browser-use](https://github.com/browser-use/browser-use) | Direct computer-use and browser automation. | Steal the visual feedback loop: capturing screenshots, marking bounding boxes, and mapping screen coordinates to click actions. |

---

## Stealable Modules: Agentic Design Patterns

Instead of building a massive AI framework, you can isolate and steal specific sub-systems:

- **Local Function-to-Schema Parser**:
  - *Where to steal*: `agno` or `langchain` codebase.
  - *The Intent*: Converting standard TypeScript/Python functions with docstrings and type-hints directly into JSON Schema objects that LLMs can understand as tools.
- **Checkpointers & Time-Travel Memory**:
  - *Where to steal*: `langgraph` core state manager.
  - *The Intent*: Storing a snapshot of state after every graph transition. This allows the user (or another agent) to rewind execution, rewrite a step, and resume execution.
- **Accessibility Tree Simplifier**:
  - *Where to steal*: `stagehand` or `browser-use` DOM extraction files.
  - *The Intent*: Scraping the DOM and stripping away styling, nested divs, and comments, leaving only interactive elements (buttons, inputs, links) to feed to LLMs.
- **Micro-VM Spawn APIs**:
  - *Where to steal*: `e2b-dev` runner backend.
  - *The Intent*: Invoking highly secure, ephemeral sandboxes for running user-generated code with sub-second startup latency.

---

## Search Inside

`langgraph`, `checkpoint`, `StateGraph`, `node`, `edge`, `mcp`, `mcp-server`, `tools/call`, `stagehand`, `accessibilityTree`, `boundingbox`, `firecracker`, `microvm`, `sandbox`, `crewai`, `MetaGPT`, `agentic`.
