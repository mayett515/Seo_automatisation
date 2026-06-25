# Advanced RAG And Document Parsing

Walk in here to lift the moving parts of a real RAG pipeline: advanced indexing structures, layout-aware document extraction, query translation, context reranking, and self-reflection evaluation loops. RAG has outgrown simple text chunking (Naive RAG) into stateful architectures that stack multi-step queries, hierarchical indexes, and agentic workflows for factual precision — take the technique you're missing rather than rebuilding the stack.

---

## 1. Curated Implementations & Cookbook Guides

These repositories hand you complete code walkthroughs, notebooks, and reference guides for advanced retrieval and verification patterns — lift the notebook that implements the pattern you need.

### Cookbooks & Libraries

| Link | Good For | What to steal |
| --- | --- | --- |
| [NirDiamant/RAG_Techniques](https://github.com/NirDiamant/RAG_Techniques) | 30+ advanced RAG techniques implemented in Python. | Steal notebooks for Self-RAG, Corrective RAG (CRAG), Fusion Retrieval (reciprocal rank fusion), RAPTOR (recursive summarization tree indexing), and query translation. |
| [GURPREETKAURJETHRA/Advanced_RAG](https://github.com/GURPREETKAURJETHRA/Advanced_RAG) | Agentic and adaptive RAG implementations. | Steal code setups for routing queries dynamically between web search and vector caches, query rewriting loops, and multi-query retrieval. |
| [Danielskry/Awesome-RAG](https://github.com/Danielskry/Awesome-RAG) | Curated catalog of RAG research, tools, and architectures. | Use this list to locate papers, dataset formats, specialized retrieval methods, and evaluation libraries. |

---

## 2. Production RAG Engines & Frameworks

These frameworks are built to manage massive volumes of unstructured data, parse complex files (PDFs, scans, tables), and run evaluations at scale. Lift the parser or evaluator that solves your bottleneck.

### Frameworks & Evaluation Engines

| Link | Good For | What to steal |
| --- | --- | --- |
| [run-llama/llama_index](https://github.com/run-llama/llama_index) | Data-heavy indexing and query engine pipelines. | Steal their hierarchical document nodes, auto-retrievers, integration with cross-encoder rerankers, and the TypeScript port (`run-llama/llama-index-ts`). |
| [infiniflow/ragflow](https://github.com/infiniflow/ragflow) | OCR, deep layout parsing, and table-aware document extraction. | Steal how they segment PDFs based on visual layout cues to preserve table structures and reading order before chunking and embedding. |
| [explodinggradients/ragas](https://github.com/explodinggradients/ragas) | Evaluation of retrieval accuracy and generation quality. | Steal how they calculate mathematical metrics for RAG pipelines: Faithfulness (checking hallucinations), Answer Relevance, and Context Precision. |

---

## Stealable Modules: Advanced RAG Design Patterns

- **Multi-Query Expansion Generator**:
  - *Where to lift from*: `NirDiamant/RAG_Techniques` or `llama_index` query translators.
  - *The Intent*: Feeding a user's prompt to a small LLM to generate 3-5 variations of the search query. This increases retrieval coverage by fetching vector candidates for all variations, then merging and deduplicating them.
- **Hierarchical Parent-Child Chunking**:
  - *Where to lift from*: `llama_index` node parsers.
  - *The Intent*: Splitting text into large parent chunks (e.g., 2000 tokens) and small child chunks (e.g., 200 tokens). The system searches against the small child chunks for semantic match, but passes the containing parent chunk's full context to the LLM, ensuring details are read with complete context.
- **Reranker Candidate Filtering**:
  - *Where to lift from*: `llama_index` post-processors or `vespa-engine` ranking.
  - *The Intent*: Fetching 50 candidates using fast approximate vector search (Cosine distance), then passing them through a slower Cross-Encoder Model (Reranker) to evaluate exact semantic similarity, selecting only the top 5 for generation.
- **Self-Reflection Retrieval Verification (Self-RAG)**:
  - *Where to lift from*: `NirDiamant/RAG_Techniques` or `langchain-ai/langgraph` examples.
  - *The Intent*: Checking the retrieved document context against the prompt. If the documents do not contain relevant facts, the agent automatically triggers a web search to fill the gap before invoking the LLM generator.

---

## Search Inside

`retrieval`, `augmentation`, `vectorstore`, `chunking`, `RAPTOR`, `CRAG`, `Self-RAG`, `rerank`, `cross-encoder`, `fusion`, `reciprocal rank fusion`, `RRF`, `parent-child`, `chunk size`, `layout parser`, `ocr`, `ragas`, `faithfulness`, `context precision`.
