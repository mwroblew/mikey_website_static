# Michael Wroblewski — academic website

Static HTML/CSS/JavaScript for michaelwroblewski.com. No build step, framework, external fonts, or client-side libraries are required. Existing GitHub Pages hosting and `CNAME` are preserved.

## Pages

- `index.html`: introduction and research overview
- `research.html`: publications, working papers, and works in progress
- `teaching.html`: courses taught
- `ngdp.html`: interactive NGDP gap explorer
- `cv.html`: CV viewer and download
- `contact.html`: contact and affiliation

The current PDF is `assets/docs/cv.pdf`. It is the unchanged resume supplied on October 13, 2026. Academic content was updated from that resume. Research titles and coauthor spellings follow the supplied document; paper PDFs are not linked where none were supplied.

## Local preview

Serve the repository with any static web server, for example `python3 -m http.server 8000`, then open `http://localhost:8000`. The pages also work directly from disk. The NGDP data load from a local script, avoiding a network API or API key.

## NGDP explorer

`assets/data/ngdp.js` contains a frozen snapshot of all seventeen windows (4 through 20 quarters), with ten selected initially. `assets/data/ngdp-windows.csv` contains all observations, benchmarks, classifications, and counts of extrapolated forecast vintages.

The axes stay fixed across windows. All quarterly observations are plotted directly. The slider, quarter menu, pointer inspection, and touch inspection share the same data. Longer windows begin later because only complete windows are used.

The calculation uses current-quarter survey information plus W−1 earlier vintages. This is a consistent implementation across windows, not an assertion of exact replication of all published five- or twenty-quarter estimates. Classification bands use Luther's fixed thresholds, not forecast percentiles or confidence intervals. See the methodology section on `ngdp.html` and `tools/README.md`.

The source data snapshot is October 12, 2026, with actual GDP through 2026Q2. Updating the page requires explicitly regenerating the data; it does not update automatically.

## Editing

Shared styling is in `assets/css/site.css`. Navigation is intentionally present in every HTML file so it works without JavaScript. Update navigation consistently across pages. The older CSS files are retained for reference but are no longer loaded by the redesigned pages.

The repository's default branch serves the live site. Review changes on the redesign branch before merging.
