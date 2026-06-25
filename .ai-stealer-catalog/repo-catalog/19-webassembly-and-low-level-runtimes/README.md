# WebAssembly (Wasm) And Low-Level Runtimes

Walk in here for the low-level machinery that runs code at near bare-metal speed: WebAssembly compilers, runtimes, plugin frameworks, and high-performance rendering engines that bypass standard runtime overhead. Whether you need a secure sandbox, a full language compiled to the browser, or an optimized rendering hot path, lift the engine instead of rebuilding it.

---

## 1. WebAssembly Runtimes & Plugin Engines

These systems host WebAssembly modules, managing memory bounds, sandboxed execution, and guest-host communication interfaces. Lift the runtime or the boundary bindings you need.

### Core Repos

| Link | Good For | What to steal |
| --- | --- | --- |
| [extism/extism](https://github.com/extism/extism) | Universal, secure plugin system using WebAssembly. | Steal guest-host interface bindings: how the SDK coordinates loading Wasm plugins, invoking functions, and passing complex datatypes across the runtime boundary. |
| [bytecodealliance/wasmtime](https://github.com/bytecodealliance/wasmtime) | Standalone JIT compiler and runtime for WebAssembly. | Steal how they compile Wasm instructions to native machine code on-the-fly and enforce strict stack/memory security sandboxing. |
| [wasmerio/wasmer](https://github.com/wasmerio/wasmer) | Multi-backend WebAssembly runtime supporting WASI. | Steal their modular compiler backends (Cranelift, LLVM, Singlepass) and how they support different virtual machine execution constraints. |

---

## 2. Compilers & Embedded Runtimes

These tools compile dynamic languages, database engines, or script runtimes into WebAssembly binaries so complex applications can run in browser threads. Lift the compilation approach that matches what you need to ship to the browser.

### Core Repos

| Link | Good For | What to steal |
| --- | --- | --- |
| [bytecodealliance/javy](https://github.com/bytecodealliance/javy) | Running JavaScript code within a WebAssembly wrapper. | Steal how they embed the QuickJS C interpreter inside a WebAssembly binary, allowing developers to execute JavaScript logic inside Wasm sandboxes. |
| [pyodide/pyodide](https://github.com/pyodide/pyodide) | Python runtime and scientific package ecosystem in Wasm. | Steal how they compile CPython, map Python data structures to JavaScript objects, and load compiled C extensions like NumPy in the browser. |
| [sql.js/sql.js](https://github.com/sql.js/sql.js) | SQLite database engine compiled to WebAssembly. | Steal how raw database reads and writes are mapped to memory buffers, enabling SQL queries to run on in-memory files directly in browser environments. |

---

## 3. High-Performance Text Layout & Performance Bypass

Bypassing DOM layout recalculations (reflows) is critical for rendering performance. This section sets native Wasm ports against pure math bypass engines — lift whichever fits your hot path.

### Core Repos

| Link | Good For | What to steal |
| --- | --- | --- |
| [chenglou/pretext](https://github.com/chenglou/pretext) | High-performance multiline text measurement and layout. | **Note: This library does NOT use WebAssembly.** It is categorized here because it solves the exact performance bottleneck that previously required heavy C++/Wasm engines. Steal how they measure text once with `canvas.measureText()` (`prepare()` path) and then execute layout wraps using pure arithmetic (`layout()` path) to bypass DOM reflows entirely. |
| [rhysd/vim.wasm](https://github.com/rhysd/vim.wasm) | Vim editor port running inside a canvas. | Steal how terminal keyboard actions and screen redrawing are serialized between the C-compiled Vim loop and the browser DOM/Canvas layer. |

---

## Stealable Modules: Low-Level Wasm Patterns

- **Guest-Host Memory Sharing (Serialization)**:
  - *Where to lift from*: `extism` guest SDKs (Rust/Go) and host runtimes.
  - *The Intent*: How to write data into Wasm memory, pass the pointer address to the host, read the memory block on the host side, and securely free the allocation.
- **Embedded JavaScript Execution in Wasm**:
  - *Where to lift from*: `javy` source structure.
  - *The Intent*: Sandboxing plugin code by packing a lightweight JavaScript evaluation engine (like QuickJS) into a compiled Wasm binary, enabling script customization with zero compiler toolchain requirements for the end-user.
- **Pure Math Layout Pre-Computation**:
  - *Where to lift from*: `pretext` measurement cache.
  - *The Intent*: Decoupling design system measurements from browser layout engines. By loading characters, capturing their bounding boxes once inside a canvas memory context, and caching them, you can build virtual lists that scale to millions of items without causing layout "jank."

---

## Search Inside

`extism`, `wasmtime`, `wasmer`, `javy`, `quickjs`, `pyodide`, `sql.js`, `pretext`, `canvas.measureText`, `measureText`, `reflow`, `layout`, `prepare`, `pointer`, `WASI`, `WebAssembly.instantiate`.
