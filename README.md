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

`assets/data/ngdp.js` contains the latest validated snapshot of all seventeen windows (4 through 20 quarters), with ten selected initially. `assets/data/ngdp-windows.csv` contains all observations, benchmarks, classifications, and counts of extrapolated forecast vintages.

The axes stay fixed across windows. All quarterly observations are plotted directly as one continuous line. Livingston supplies the early history until the quarter before the first complete SPF window; SPF supplies every observation thereafter. The join is unadjusted and the quarter readout names the source. The source transition is stored per window in `sourceSwitch`. The slider, quarter menu, pointer inspection, and touch inspection share the same data. Longer windows begin later because only complete windows are used.

The calculation uses current-quarter survey information plus W−1 earlier vintages. This is a consistent implementation across windows, not an assertion of exact replication of all published five- or twenty-quarter estimates. Classification bands use Luther's fixed thresholds, not forecast percentiles or confidence intervals. See the methodology section on `ngdp.html` and `tools/README.md`.

The calculation is based on Martinez, Schibuola, and Beckworth (2026), extended to compare alternative planning and commitment horizons. The original snapshot was downloaded October 12, 2026. Current snapshot and check dates appear on the NGDP page and in `tools/source_manifest.json`.

## Automatic refresh and publishing

`.github/workflows/site.yml` checks the public FRED and Philadelphia Fed sources at 17:23 UTC each weekday and supports a manual run. It validates the downloaded history, regenerates all seventeen windows and the CSV, refreshes the homepage chart and visible metadata, records the source vintage in git, and deploys one complete GitHub Pages artifact. A failed download, validation, calculation, or commit stops deployment, leaving the existing website online. Pushes to main deploy the reviewed snapshot without requiring a source download.

To activate after reviewing and merging the redesign, set Settings → Pages → Build and deployment → Source to **GitHub Actions**, enable Actions, and allow the workflow to commit data updates to `main`. Branch protection must permit those bot commits; the workflow never bypasses protection or force-pushes. The `github-pages` environment must allow deployment from `main`. Run **Refresh NGDP and publish website** once to check the initial deployment. Scheduled workflows only run on the default branch. GitHub may disable scheduled workflows in public repositories after 60 days without repository activity; check Actions if the displayed check date becomes stale. GitHub scheduling can be delayed.

No personal access token or paid data API is required. `GITHUB_TOKEN` bot commits do not trigger branch-based Pages builds, so this workflow explicitly deploys the artifact in the same run. Do not enable this workflow on the draft branch or change the live Pages settings until the redesign is approved.

## Editing

Shared styling is in `assets/css/site.css`. Navigation is intentionally present in every HTML file so it works without JavaScript. Update navigation consistently across pages. The older CSS files are retained for reference but are no longer loaded by the redesigned pages.

The repository's default branch serves the live site. Review changes on the redesign branch before merging.
