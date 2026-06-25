# ML Internals And Classic ML

Walk in here when you want the mechanics behind ML systems in your own hands instead of behind a black-box API: how a tensor records its own computation graph, how `loss.backward()` actually walks that graph in reverse, how an optimizer mutates parameters, and how decades of classic algorithms (k-means, random forests, SVMs, PCA) hide behind a deceptively simple `fit`/`predict`/`transform` contract. The repos here range from teaching-sized implementations you can lift whole in one sitting (micrograd's ~150-line autograd engine) to industrial libraries you raid one piece at a time (scikit-learn's estimator hierarchy, tinygrad's lazy kernel scheduler, llama.cpp's quantized inference).

A library like scikit-learn looks monolithic, but the engineering intent behind each piece — a reverse-mode autodiff node, a consistent estimator API, a KV-cache for autoregressive decoding, a deterministic train/test split — is a self-contained pattern you can pull into your own code. The small repos hand you the *idea* clean; the big repos show how that idea survives contact with production — numerical stability, memory layout, batching, API consistency across hundreds of algorithms — so you can lift the hardened version when you need it.

## Repos

| Link | Good For | What to steal |
| --- | --- | --- |
| [karpathy/nanoGPT](https://github.com/karpathy/nanoGPT) | Small GPT training and sampling codebase. | Steal tokenization, transformer blocks, attention, optimizer loop, checkpointing, and text generation. |
| [karpathy/micrograd](https://github.com/karpathy/micrograd) | ~150-line scalar reverse-mode autograd engine. | Steal how a `Value` node records its parents and a local backward closure, then `backward()` topologically sorts and accumulates gradients. The clearest backprop you will ever read. |
| [tinygrad/tinygrad](https://github.com/tinygrad/tinygrad) | Small deep learning framework. | Steal tensors, autograd, kernels, graph execution, optimization, and compiler-like internals. |
| [mlpack/mlpack](https://github.com/mlpack/mlpack) | C++ machine learning library. | Steal classic ML algorithms, bindings, and library design. |
| [scikit-learn/scikit-learn](https://github.com/scikit-learn/scikit-learn) | Classic Python ML library. | Steal clustering, classification, regression, pipelines, model selection, and API consistency. |
| [ggerganov/llama.cpp](https://github.com/ggerganov/llama.cpp) | Quantized LLM inference in portable C/C++. | Steal KV-cache management, GGUF quantization formats, the ggml tensor graph, and sampling — model internals stripped to the metal. |

## Mistral AI — Open-Weight Large Language Models

Mistral AI (Paris, 2023) builds high-performance open-weight LLMs with strong code generation, multilingual, and multimodal capabilities. Their open-source repos cover the full stack: model architecture, tokenization, inference, fine-tuning, and client SDKs.

### Official Mistral AI Repos

| Link | Good For | What to steal |
| --- | --- | --- |
| [mistralai/mistral-inference](https://github.com/mistralai/mistral-inference) | Reference inference implementation for Mistral models. | Steal the minimal inference loop, model loading, KV cache, batching, and sampling for MoE and dense architectures. |
| [mistralai/mistral-common](https://github.com/mistralai/mistral-common) | Tokenizers, validation, and normalization utilities. | Steal tokenizer implementations (SentencePiece, Tekken), chat template formatting, and request/response validation. |
| [mistralai/mistral-finetune](https://github.com/mistralai/mistral-finetune) | Fine-tuning codebase for Mistral models. | Steal LoRA, QLoRA, training loop, data loading, and hyperparameter configuration for Mistral architectures. |
| [mistralai/cookbook](https://github.com/mistralai/cookbook) | Recipes, examples, and best practices. | Steal RAG patterns, function calling, structured output, embeddings, and agent workflows with Mistral models. |
| [mistralai/mistral-src](https://github.com/mistralai/mistral-src) | Original model architecture reference code. | Steal the transformer block design, attention mechanisms, routing (for MoE), and model configuration. |
| [mistralai/client-python](https://github.com/mistralai/client-python) | Official Python SDK for the Mistral API. | Steal API client design, streaming, async patterns, SDK structure, pagination, and platform-specific modules. |
| [mistralai/mistral-vibe](https://github.com/mistralai/mistral-vibe) | Minimal CLI coding agent by Mistral. | Steal how a small, focused coding agent is built: tool use, context management, file editing, and conversation loop. |

### Community Inference And Ecosystem

| Link | Good For | What to steal |
| --- | --- | --- |
| [EricLBuehler/mistral.rs](https://github.com/EricLBuehler/mistral.rs) | Blazingly fast Rust inference engine for Mistral models. | Steal quantized inference (GGUF, GGML), metal/CUDA acceleration, HTTP server, chat interface, and model loading. |
| [samouraiworld/awesome-mistral](https://github.com/samouraiworld/awesome-mistral) | Curated list of Mistral ecosystem resources. | Use to discover tools, libraries, deployments, fine-tuning projects, and community apps for Mistral models. |
| [vllm-project/vllm](https://github.com/vllm-project/vllm) | High-throughput LLM serving engine with Mistral support. | Steal PagedAttention, continuous batching, tensor parallelism, and production inference serving architecture. |
| [ggerganov/llama.cpp](https://github.com/ggerganov/llama.cpp) | Ubiquitous local LLM inference in C/C++ with Mistral GGUF support. | Steal quantized inference, KV cache management, sampling, grammar-constrained generation, and server mode. |
| [ollama/ollama](https://github.com/ollama/ollama) | Run Mistral models locally with one command. | Steal model packaging (Modelfile), local serving, multi-platform inference, and developer UX for local LLMs. |
| [lm-sys/FastChat](https://github.com/lm-sys/FastChat) | Scalable serving platform with Chatbot Arena and Mistral support. | Steal model serving, worker management, chat UI, evaluation infrastructure, and multi-model deployment. |

## The Lift From Mistral Repos

- Model architecture: attention variants, MoE routing, sliding window, positional encodings.
- Inference pipeline: tokenizer → model forward pass → sampling → decoding.
- Fine-tuning workflow: data preparation, LoRA config, training loop, evaluation.
- API client design: request/response patterns, streaming, error handling, platform SDKs.
- Serving architecture: batching strategies, KV cache memory management, quantization.

## Search Inside Mistral Repos

`mixture of experts`, `moe`, `routing`, `sliding window`, `grouped query attention`, `rope`, `tokenizer`, `sentencepiece`, `tekken`, `finetune`, `lora`, `qlora`, `kv cache`, `paged attention`, `continuous batching`, `quantization`, `gguf`, `ggml`, `chat template`.

## 3. The Anatomy of Large Repos: Decomposing "Stealable" Modules

Reading scikit-learn or tinygrad as one giant codebase is overwhelming. Instead, decompose each repo into modules with a clear engineering intent. The product might be "a deep learning framework" or "a 200-algorithm ML toolkit," but the underlying intent of each module — reverse-mode autodiff, a uniform estimator contract, a numerically stable distance computation — is a pattern you can steal in isolation.

### Decomposed Module Index

| Intent | Product / Repo | Target Module / Directory | What to steal |
| --- | --- | --- | --- |
| **Reverse-mode autodiff (the bare idea)** | micrograd | [`micrograd/engine.py`](https://github.com/karpathy/micrograd/blob/master/micrograd/engine.py) | How a scalar `Value` stores its parents plus a `_backward` closure, and how `backward()` topo-sorts the graph and accumulates `grad` in reverse. |
| **Tensor-level autograd + lazy kernels** | tinygrad | [`tinygrad/tensor.py`](https://github.com/tinygrad/tinygrad/blob/master/tinygrad/tensor.py) | How a full framework records ops lazily, builds a graph, and only materializes/schedules kernels at `.realize()` — autograd that scales. |
| **The estimator contract (`fit`/`predict`)** | scikit-learn | [`sklearn/base.py`](https://github.com/scikit-learn/scikit-learn/blob/main/sklearn/base.py) | How `BaseEstimator`, mixins (`ClassifierMixin`, `TransformerMixin`), `get_params`/`set_params`, and `_validate_data` enforce one consistent API across 200+ algorithms. |
| **Composable pipelines** | scikit-learn | [`sklearn/pipeline.py`](https://github.com/scikit-learn/scikit-learn/blob/main/sklearn/pipeline.py) | How chaining transformers + a final estimator behind one `fit`/`predict` prevents train/test leakage and makes whole workflows hyperparameter-tunable. |
| **Cross-validation & splitting** | scikit-learn | [`sklearn/model_selection`](https://github.com/scikit-learn/scikit-learn/tree/main/sklearn/model_selection) | How `KFold`, `StratifiedKFold`, and `train_test_split` yield deterministic index splits (seeded) so evaluation is reproducible. |
| **Tree ensembles** | scikit-learn | [`sklearn/ensemble`](https://github.com/scikit-learn/scikit-learn/tree/main/sklearn/ensemble) | How bagging/boosting wrap a base estimator, aggregate predictions, and expose feature importances — the meta-estimator pattern. |
| **Transformer training loop** | nanoGPT | [`train.py`](https://github.com/karpathy/nanoGPT/blob/master/train.py) | How a minimal loop wires data batching, forward pass, `loss.backward()`, gradient clipping, LR schedule, and checkpointing in one readable file. |
| **KV-cache autoregressive decoding** | llama.cpp | [`src/`](https://github.com/ggerganov/llama.cpp/tree/master/src) | How past key/value tensors are cached so each new token costs O(1) attention against history instead of recomputing the whole sequence. |
| **Config separated from model code** | nanoGPT | [`model.py`](https://github.com/karpathy/nanoGPT/blob/master/model.py) | How a `GPTConfig` dataclass keeps architecture hyperparameters out of the module body, so the same code runs many model sizes. |

### Code You Can Steal

A reverse-mode autodiff node — the heart of micrograd's `engine.py`. Every op stores a closure that knows how to push gradient to its inputs:

```python
class Value:
    def __init__(self, data, _children=(), _op=''):
        self.data = data
        self.grad = 0.0
        self._backward = lambda: None      # local gradient rule
        self._prev = set(_children)

    def __mul__(self, other):
        out = Value(self.data * other.data, (self, other), '*')
        def _backward():
            self.grad  += other.data * out.grad   # chain rule
            other.grad += self.data  * out.grad
        out._backward = _backward
        return out

    def backward(self):
        topo, visited = [], set()
        def build(v):
            if v not in visited:
                visited.add(v)
                for child in v._prev: build(child)
                topo.append(v)
        build(self)
        self.grad = 1.0
        for v in reversed(topo):   # walk graph in reverse
            v._backward()
```

A from-scratch gradient-descent step — the same update every optimizer specializes:

```python
# theta <- theta - lr * grad(loss)
for _ in range(epochs):
    y_hat = X @ theta
    grad  = (2.0 / len(X)) * X.T @ (y_hat - y)   # MSE gradient
    theta -= lr * grad
```

The scikit-learn estimator contract you implement to make any model drop into a `Pipeline` or `GridSearchCV`:

```python
from sklearn.base import BaseEstimator, ClassifierMixin

class MyClassifier(BaseEstimator, ClassifierMixin):
    def __init__(self, alpha=1.0):      # only hyperparameters, stored verbatim
        self.alpha = alpha

    def fit(self, X, y):
        # ... learn parameters, store with trailing underscore ...
        self.coef_ = ...
        return self                     # fit must return self

    def predict(self, X):
        return ...                      # uses self.coef_
```

## Functional Patterns

- **Record-then-replay autograd**: Each forward op appends a node (data + a local backward rule) to an implicit graph; `backward()` replays it in reverse via the chain rule. micrograd does it per-scalar; tinygrad does it per-tensor with lazy kernels.
- **The `fit`/`predict`/`transform` contract**: One uniform interface lets any estimator slot into pipelines, grid search, and cross-validation. Learned state lives in `trailing_underscore_` attributes; constructor args are pure hyperparameters.
- **Composable pipelines**: Transformers chain into a final estimator behind a single `fit`/`predict`, so preprocessing is fit only on training folds — no leakage.
- **Config separated from code**: A dataclass/struct of hyperparameters (`GPTConfig`, estimator `__init__` args) keeps architecture decisions out of the math, so one implementation spans many model sizes.
- **Deterministic, seeded evaluation**: Splits and shuffles are seeded so train/test boundaries and metrics are reproducible run to run.

## The Lift

- Dataset split and evaluation patterns.
- Model API shape: fit, predict, transform, score.
- Training loop structure.
- Sampling and generation controls.
- How model configuration is separated from model code.

## Search Inside

`attention`, `transformer`, `embedding`, `optimizer`, `loss`, `backward`, `autograd`, `fit`, `predict`, `pipeline`, `cluster`, `classifier`, `regression`, `validation`.

