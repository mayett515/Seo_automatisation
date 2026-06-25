# Anomaly Detection And Time Series

Walk in here for monitoring, alerts, fraud-ish behavior, usage spikes, sensor/log data, weird account activity, and forecasting. At heart, almost every detector answers the same question two ways: build an *expectation* of what a signal should look like (a moving average, a seasonal decomposition, a forecast, a density model) and then flag the points that deviate from it by more than some threshold. The repos here span the whole spectrum, and you take the one that fits your signal — batch forecasters that fit a curve to historical data (Prophet, statsmodels), online learners that update one sample at a time and never store the full series (river), robust statistical tests built for seasonal data (Twitter's AnomalyDetection), and high-dimensional outlier toolkits (PyOD).

The product might be "Facebook's forecasting library" or "an online ML framework," but the underlying intent of each module — STL seasonal decomposition, an EWMA control chart, an isolation-forest split, a streaming z-score that updates in O(1) — is a self-contained pattern you can drop straight into a monitoring pipeline. The small statistical recipes hand you the bare *idea* (a z-score, an EWMA); the big repos hand you the same idea already hardened against seasonality, missing data, concept drift, and alert noise — lift whichever version your pipeline can afford.

## Repos And Lists

| Link | Good For | What to steal |
| --- | --- | --- |
| [yzhao062/anomaly-detection-resources](https://github.com/yzhao062/anomaly-detection-resources) | Anomaly detection resources and tools. | Good entry point for PyOD and multivariate outlier detection methods. |
| [lmmentel/awesome-time-series](https://github.com/lmmentel/awesome-time-series) | General time-series resource list. | Use for forecasting, sequential data, monitoring, and time-series libraries. |
| [lzz19980125/awesome-multivariate-time-series-anomaly-detection-algorithms](https://github.com/lzz19980125/awesome-multivariate-time-series-anomaly-detection-algorithms) | Paper list for multivariate time-series anomaly detection. | Use when anomalies depend on many signals moving together. |
| [rob-med/awesome-TS-anomaly-detection](https://github.com/rob-med/awesome-TS-anomaly-detection) | Time-series anomaly detection resources. | Good additional list for methods, datasets, and related software. |
| [yzhao062/pyod](https://github.com/yzhao062/pyod) | Python Outlier Detection toolbox with 50+ algorithms. | Practical library to lift from: isolation forest, LOF, autoencoders, and ensemble detectors with a unified API. |
| [facebook/prophet](https://github.com/facebook/prophet) | Decomposable additive forecasting (trend + seasonality + holidays). | Steal how a forecast becomes `y(t) = g(t) + s(t) + h(t) + e`, and how prediction intervals turn a forecast into an anomaly threshold. |
| [statsmodels/statsmodels](https://github.com/statsmodels/statsmodels) | Classical statistical time-series models. | Steal ARIMA, exponential smoothing, and STL seasonal decomposition under `statsmodels/tsa` — the building blocks Prophet and others wrap. |
| [online-ml/river](https://github.com/online-ml/river) | Online / streaming machine learning. | Steal one-sample-at-a-time learning: streaming stats, `HalfSpaceTrees` anomaly scoring, and ADWIN concept-drift detection that never stores the full series. |
| [twitter/AnomalyDetection](https://github.com/twitter/AnomalyDetection) | Seasonal Hybrid ESD anomaly test (R). | Steal S-H-ESD: STL/median decomposition followed by a robust Generalized ESD test — built specifically for seasonal data with global and local spikes. |

## 2. The Anatomy of Large Repos: Decomposing "Stealable" Modules

Taking on Prophet or statsmodels as a single forecasting product is overwhelming. Decompose them into modules with a clear intent. The product might be "Facebook's forecaster" or "an online ML framework," but the underlying intent of each module — seasonal decomposition, a streaming variance estimator, a tree-based outlier score, a drift detector — is a pattern you can steal into a monitoring pipeline on its own.

### Decomposed Module Index

| Intent | Product / Repo | Target Module / Directory | What to steal |
| --- | --- | --- | --- |
| **Decomposable additive forecast** | Prophet | [`python/prophet/forecaster.py`](https://github.com/facebook/prophet/blob/main/python/prophet/forecaster.py) | How a forecast is modeled as trend + seasonality + holidays, fit with Stan, and turned into prediction intervals you can threshold for anomalies. |
| **STL seasonal decomposition** | statsmodels | [`statsmodels/tsa/seasonal`](https://github.com/statsmodels/statsmodels/tree/main/statsmodels/tsa) | How to split a series into trend / seasonal / residual so you can run detection on the *residual* instead of the raw, seasonal signal. |
| **ARIMA / exponential smoothing** | statsmodels | [`statsmodels/tsa/arima`](https://github.com/statsmodels/statsmodels/tree/main/statsmodels/tsa/arima) | How classical models produce one-step-ahead forecasts and residuals — the baseline an anomaly is measured against. |
| **Streaming anomaly scoring** | river | [`river/anomaly`](https://github.com/online-ml/river/tree/main/river/anomaly) | How `HalfSpaceTrees` and Gaussian scorers assign an anomaly score to one sample at a time without storing history. |
| **Online running statistics** | river | [`river/stats`](https://github.com/online-ml/river/tree/main/river/stats) | How `Mean`, `Var`, and `EWMean` update incrementally in O(1) — the engine behind a streaming z-score / EWMA control chart. |
| **Concept-drift detection** | river | [`river/drift`](https://github.com/online-ml/river/tree/main/river/drift) | How ADWIN and Page-Hinkley detect that "normal" has shifted, so your baseline retrains instead of alerting forever. |
| **Robust seasonal hypothesis test** | Twitter | [`R/vec_anom_detection.R`](https://github.com/twitter/AnomalyDetection/blob/master/R/vec_anom_detection.R) | How S-H-ESD removes seasonality with the median, then iteratively applies a robust Generalized ESD test to flag spikes. |
| **High-dimensional outlier ensemble** | PyOD | [`pyod/models`](https://github.com/yzhao062/pyod/tree/master/pyod/models) | How Isolation Forest, LOF, and autoencoders share one `fit` / `decision_function` API so detectors are swappable and stackable. |

### Code You Can Steal

The workhorse univariate detector — a rolling z-score. Flag any point whose deviation from the rolling mean exceeds k standard deviations:

```python
import numpy as np

def rolling_zscore_anomalies(x, window=30, k=3.0):
    x = np.asarray(x, dtype=float)
    flags = np.zeros(len(x), dtype=bool)
    for i in range(window, len(x)):
        w = x[i - window:i]
        mu, sigma = w.mean(), w.std()
        if sigma > 0 and abs(x[i] - mu) > k * sigma:
            flags[i] = True   # deviates from expected behavior
    return flags
```

A streaming EWMA + EWMSD control chart that updates in O(1) per sample — the pattern river's `stats` module generalizes. No history is stored, so it runs forever on a metrics stream:

```python
class EwmaDetector:
    def __init__(self, alpha=0.1, k=3.0):
        self.alpha, self.k = alpha, k
        self.mean = None
        self.var = 0.0

    def update(self, x):
        if self.mean is None:        # first sample: just seed
            self.mean = x
            return False
        diff = x - self.mean
        is_anomaly = abs(diff) > self.k * (self.var ** 0.5)
        self.mean += self.alpha * diff                       # EWMA
        self.var = (1 - self.alpha) * (self.var + self.alpha * diff * diff)
        return is_anomaly
```

Decompose first, detect on the residual — the move Prophet and S-H-ESD both rely on so seasonal peaks are not mistaken for anomalies:

```python
from statsmodels.tsa.seasonal import STL

res = STL(series, period=7).fit()        # weekly seasonality
residual = series - res.trend - res.seasonal
# now threshold `residual`, not the raw, seasonal signal
anomalies = residual.abs() > 3 * residual.std()
```

## Functional Patterns

- **Expectation minus observation**: Build a model of "normal" (rolling mean, forecast, density, or decomposition) and flag points whose deviation exceeds a threshold. Every detector here is a variation on this.
- **Decompose, then detect on the residual**: Strip trend and seasonality (STL / median) so a Tuesday peak is not flagged; run the detector on what is left over.
- **Online vs batch**: Batch forecasters refit on the full history (Prophet, ARIMA); online detectors update one sample at a time in O(1) (river) and never store the series — pick by data volume and latency.
- **Threshold vs model-based**: Cheap statistical thresholds (z-score, EWMA, ESD) for univariate signals; model-based scores (Isolation Forest, LOF, autoencoders) when anomalies live in combinations of many signals.
- **Drift-aware baselines**: Detect when "normal" itself has shifted (ADWIN, Page-Hinkley) and retrain the baseline, rather than alerting indefinitely on a new regime.

## The Lift

- Windowing strategy.
- Baseline calculation.
- Thresholding vs model-based detection.
- Univariate vs multivariate detection.
- Labeling and evaluation strategy.
- Alert noise reduction.

## Search Inside

`anomaly`, `outlier`, `forecast`, `seasonality`, `trend`, `window`, `residual`, `threshold`, `multivariate`, `time series`, `drift`, `alert`.
