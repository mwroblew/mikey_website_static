# Reproducing the NGDP Gap Explorer

The bundled `raw/` files preserve the public-data snapshot downloaded on October 12, 2026. `source_manifest.json` records the original URLs and SHA-256 hashes. Keeping this vintage is necessary to reproduce the published website values; current data downloads can contain revisions.

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

## Updating

Provide compatible replacement source files using `--raw DIRECTORY`, with the filenames and worksheet names used in the bundled snapshot. Pass the actual download date with `--as-of YYYY-MM-DD`. Updating is a deliberate maintenance task, not an automatic feed. Review any source format changes and revise the visible snapshot date, initial values, and homepage preview in the HTML alongside the generated data. Preserve a source manifest for the new vintage.
