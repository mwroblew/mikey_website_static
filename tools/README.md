# Reproducing the NGDP Gap Explorer

The bundled `raw/` files preserve the latest validated public-data snapshot (originally downloaded on October 12, 2026). `source_manifest.json` records the original URLs and SHA-256 hashes. Keeping this vintage is necessary to reproduce the published website values; current data downloads can contain revisions.

## Run

With Python 3, pandas, NumPy, and openpyxl installed:

```sh
python tools/build_ngdp.py
```

This regenerates `assets/data/ngdp.js` and `assets/data/ngdp-windows.csv`. It prints coverage and numerical aggregation checks for every integer window from 4 through 20 quarters. To inspect an output without replacing the website files:

```sh
python tools/build_ngdp.py --out /tmp/ngdp-check
```

No Python runtime or build step is required to serve the website.

## Method

For each survey origin, the script takes median SPF nominal GDP forecast levels (`NGDP1` through `NGDP6`), converts them to growth relative to the survey's previous-quarter estimate, and rebases the path to that previous quarter's revised GDP. Missing internal levels are interpolated in logs.

Beyond the quarterly forecast horizon, it uses long-run real growth and CPI forecasts adjusted by the terminal GDP-deflator/CPI wedge. When long-run forecasts are unavailable, it extends terminal quarterly growth. Before 1992, the SPF's nominal GNP forecast growth serves as a proxy for GDP growth.

A W-quarter benchmark averages forecasts for a target quarter from that quarter's survey and the preceding W−1 surveys. Only complete windows are included. The gap is `100 × (actual / benchmark − 1)`. All window settings use this same construction. The CSV also reports how many component forecasts were extrapolated. Monetary-policy labels apply Luther's fixed thresholds; they are not confidence intervals or causal estimates.

This is a custom reconstruction, not a claim of exact replication of any published series. The web page explains its interpretation and limitations.

## Automatic updating

`python tools/refresh_ngdp.py` downloads the three sources listed in `source_manifest.json` into a temporary directory. It rejects malformed files, missing historical coverage, duplicate dates, non-finite results, incomplete windows, or disagreement between the CSV and chart. It computes all output and renders both pages before replacing any website files. The workflow publishes only after the script succeeds.

A refresh includes the historical series, not just a new final observation, so GDP and survey revisions are reflected. The snapshot date changes when source bytes change; the check date records the last successful refresh. Both appear on the website. Every successful scheduled run commits its source files and hashes for reproducibility.

The GitHub workflow runs at 17:23 UTC each weekday. See the root README for the one-time Pages setup and branch-protection requirements. Until this workflow is merged and enabled, refreshing remains manual.

For offline validation, use `python tools/refresh_ngdp.py --source-dir tools/raw --check-date YYYY-MM-DD`. Run the regression tests with `python -m unittest discover -s tools/tests -v`. The original standalone `build_ngdp.py` remains available for calculation-only reproduction; `refresh_ngdp.py` coordinates the full website update.
