"""Download, validate, and stage a complete NGDP website refresh before writing."""
from pathlib import Path
from datetime import date, datetime, timezone
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import warnings
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
SHEETS = ['NGDP', 'RGDP', 'CPI', 'CPI10', 'RGDP10']
warnings.filterwarnings('ignore', category=UserWarning, module='openpyxl')


def payload(path):
    return json.loads(path.read_text().removeprefix('window.NGDP_DATA = ').rstrip(';\n'))


def download(url, destination):
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'NGDP-Research-Website/1.0'})
            with urllib.request.urlopen(request, timeout=45) as response:
                content = response.read(20_000_001)
            if not content or len(content) > 20_000_000:
                raise ValueError('Empty or oversized source download')
            destination.write_bytes(content)
            return
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def series_csv(path, name, freq):
    table = pd.read_csv(path)
    if list(table.columns) != ['observation_date', name]:
        raise ValueError(f'{name}: unexpected columns')
    index = pd.PeriodIndex(pd.to_datetime(table.observation_date), freq=freq)
    values = pd.to_numeric(table[name], errors='raise')
    if not len(index) or not index.equals(pd.period_range(index[0], index[-1], freq=freq)):
        raise ValueError(f'{name}: missing, unordered, or duplicate observations')
    if not np.isfinite(values).all():
        raise ValueError(f'{name}: non-finite observations')
    if (name == 'GDP' and (values <= 0).any()) or (name == 'USREC' and not values.isin([0, 1]).all()):
        raise ValueError(f'{name}: invalid values')
    return index


def validate_sources(raw, previous):
    gdp = None
    for name, freq in [('GDP', 'Q'), ('USREC', 'M')]:
        new = series_csv(raw / f'{name}.csv', name, freq)
        old = series_csv(previous / f'{name}.csv', name, freq)
        if not old.isin(new).all():
            raise ValueError(f'{name}: downloaded history regressed')
        if name == 'GDP':
            gdp = new
    book = pd.read_excel(raw / 'spf_medians.xlsx', sheet_name=SHEETS)
    old = pd.read_excel(previous / 'spf_medians.xlsx', sheet_name='NGDP')
    expected = set(zip(old.YEAR, old.QUARTER))
    for name, table in book.items():
        columns = [f'{name}{i}' for i in range(1, 7)] if name in ['NGDP', 'RGDP', 'CPI'] else [name]
        if not {'YEAR', 'QUARTER', *columns}.issubset(table.columns):
            raise ValueError(f'SPF {name}: unexpected schema')
        if table[['YEAR', 'QUARTER']].isna().any().any() or not table.QUARTER.isin([1, 2, 3, 4]).all():
            raise ValueError(f'SPF {name}: invalid dates')
        index = pd.PeriodIndex([f'{int(y)}Q{int(q)}' for y, q in zip(table.YEAR, table.QUARTER)], freq='Q')
        if not index.equals(pd.period_range(index[0], index[-1], freq='Q')) or not expected.issubset(set(zip(table.YEAR, table.QUARTER))):
            raise ValueError(f'SPF {name}: missing or regressed history')
        for column in columns:
            values = pd.to_numeric(table[column], errors='raise').dropna()
            if not np.isfinite(values).all():
                raise ValueError(f'SPF {column}: invalid values')
    livingston = pd.read_excel(raw/'livingston_medians.xlsx', sheet_name='GDPX')
    old_livingston = pd.read_excel(previous/'livingston_medians.xlsx', sheet_name='GDPX')
    if not {'Date','GDPX_BP','GDPX_ZM','GDPX_6M','GDPX_12M'}.issubset(livingston.columns):
        raise ValueError('Livingston: unexpected schema')
    dates = pd.DatetimeIndex(pd.to_datetime(livingston.Date, errors='raise'))
    if dates.hasnans or dates.has_duplicates or not dates.is_monotonic_increasing or not dates.month.isin([6,12]).all():
        raise ValueError('Livingston: invalid semiannual survey dates')
    if not pd.DatetimeIndex(pd.to_datetime(old_livingston.Date)).isin(dates).all():
        raise ValueError('Livingston: downloaded history regressed')
    for column in ['GDPX_BP','GDPX_ZM','GDPX_6M','GDPX_12M']:
        values = pd.to_numeric(livingston[column], errors='raise').dropna()
        if not np.isfinite(values).all() or (values <= 0).any():
            raise ValueError(f'Livingston {column}: invalid levels')
    return gdp


def validate_output(out, existing, gdp):
    data = payload(out / 'ngdp.js')
    old = payload(existing / 'ngdp.js')
    csv = pd.read_csv(out / 'ngdp-windows.csv')
    if set(data['series']) != {str(w) for w in range(4, 21)}:
        raise ValueError('Incomplete window collection')
    if set(data.get('sourceSwitch', {})) != set(data['series']):
        raise ValueError('Missing survey transition metadata')
    if data['actualThrough'] != str(gdp[-1]):
        raise ValueError('Latest GDP not represented')
    if csv.duplicated(['quarter', 'window_quarters']).any():
        raise ValueError('Duplicate CSV observations')
    for width, points in data['series'].items():
        values = np.array(points)
        if len(points) < len(old['series'][width]) or not np.isfinite(values).all():
            raise ValueError(f'{width}Q: history regressed or non-finite output')
        latest = gdp[-1].year + (gdp[-1].quarter - 1) / 4
        if not np.isclose(values[-1, 0], latest) or not np.allclose(np.diff(values[:, 0]), .25):
            raise ValueError(f'{width}Q: incomplete quarterly coverage')
        rows = csv[csv.window_quarters == int(width)]
        dates = pd.PeriodIndex(rows.quarter, freq='Q')
        times = dates.year + (dates.quarter - 1) / 4
        if len(rows) != len(points) or not np.allclose(times, values[:, 0]) or not np.allclose(rows.gap_percent, values[:, 1], atol=1e-6):
            raise ValueError(f'{width}Q: CSV and chart disagree')
        expected_source = np.where(times < data['sourceSwitch'][width], 'Livingston', 'SPF')
        if not np.array_equal(rows.survey.to_numpy(), expected_source):
            raise ValueError(f'{width}Q: incorrect survey splice')
        counts = [sum((q-h).quarter in (2,4) for h in range(int(width)))
                  if source == 'Livingston' else int(width) for q,source in zip(dates, expected_source)]
        if not np.array_equal(rows.forecast_vintages.to_numpy(), counts):
            raise ValueError(f'{width}Q: incorrect survey counts')
    return data


def replace_one(text, pattern, replacement):
    result, count = re.subn(pattern, lambda _: replacement, text, flags=re.S)
    if count != 1:
        raise ValueError(f'Expected one website marker: {pattern}')
    return result


def render_pages(data):
    updated = date.fromisoformat(data['updated']).strftime('%B %d, %Y').replace(' 0', ' ')
    checked = date.fromisoformat(data['checked']).strftime('%B %d, %Y').replace(' 0', ' ')
    note = f'Data snapshot: {updated} · Actual GDP through {data["actualThrough"]} · Last checked: {checked}'
    page = (ROOT / 'ngdp.html').read_text()
    page = replace_one(page, r'<span class="source-note" id="data-status">.*?</span>', f'<span class="source-note" id="data-status">{note}</span>')
    points = data['series']['10']
    qname = lambda x: f'{int(x)}Q{round((x % 1) * 4) + 1}'
    value = points[-1][1]
    category = 'Tight' if value < -1.25 else 'Moderately tight' if value < -.75 else 'Approximately neutral' if value <= .75 else 'Moderately loose' if value <= 1.25 else 'Loose'
    for tag, identifier, content in [
        ('small', 'latest-quarter', f'Latest · {qname(points[-1][0])}'),
        ('strong', 'latest-gap', f'{value:+.2f}%'.replace('-', '−')),
        ('span', 'latest-classification', f'{category} · Luther classification'),
        ('span', 'coverage', f'{qname(points[0][0])}–{qname(points[-1][0])}')]:
        page = replace_one(page, f'<{tag} id="{identifier}">.*?</{tag}>', f'<{tag} id="{identifier}">{content}</{tag}>')
    home = (ROOT / 'index.html').read_text()
    chart = [p for p in points if p[0] >= 1997]
    low = min(p[1] for p in chart) - 1
    high = max(p[1] for p in chart) + 1
    x = lambda t: 20 + 420 * (t - chart[0][0]) / (chart[-1][0] - chart[0][0])
    y = lambda v: 160 - 140 * (v - low) / (high - low)
    coordinates = ' '.join(f'{x(t):.2f},{y(v):.2f}' for t, v in chart)
    svg = f'<svg class="mini-chart" viewBox="0 0 460 180" role="img" aria-label="Ten-quarter NGDP gap, {qname(chart[0][0])} to {qname(chart[-1][0])}."><line x1="20" x2="440" y1="{y(0):.2f}" y2="{y(0):.2f}" stroke="#8c9b8f"/><polyline points="{coordinates}" fill="none" stroke="#214d3e" stroke-width="2.3" stroke-linejoin="round"/></svg>'
    home = replace_one(home, r'<svg class="mini-chart".*?</svg>', svg)
    meta = f'<div class="feature-meta"><span>{int(chart[0][0])}</span><span>10-quarter window · Gap (%)</span><span>{int(chart[-1][0])}</span></div>'
    home = replace_one(home, r'<div class="feature-meta">.*?</div>', meta)
    return {'ngdp.html': page, 'index.html': home}


def refresh(source_dir=None, check_date=None):
    today = check_date or datetime.now(timezone.utc).date().isoformat()
    date.fromisoformat(today)
    manifest = json.loads((ROOT / 'tools/source_manifest.json').read_text())
    with tempfile.TemporaryDirectory(prefix='ngdp-refresh-') as temp:
        stage = Path(temp)
        raw, out = stage / 'raw', stage / 'out'
        raw.mkdir()
        files = []
        changed = False
        for entry in manifest['files']:
            name = Path(entry['file']).name
            target = raw / name
            if source_dir:
                shutil.copyfile(source_dir / name, target)
            else:
                download(entry['source'], target)
            content = target.read_bytes()
            digest = hashlib.sha256(content).hexdigest()
            changed |= digest != entry['sha256']
            files.append(dict(file=f'raw/{name}', bytes=len(content), sha256=digest, source=entry['source']))
        gdp = validate_sources(raw, ROOT / 'tools/raw')
        snapshot_date = today if changed else manifest['date']
        subprocess.run([sys.executable, str(ROOT / 'tools/build_ngdp.py'), '--raw', str(raw), '--out', str(out), '--as-of', snapshot_date], check=True, capture_output=True, text=True)
        data = validate_output(out, ROOT / 'assets/data', gdp)
        data['checked'] = today
        data['method'] = 'Based on Martinez, Schibuola, and Beckworth (2026), with adjustable forecast windows.'
        pages = render_pages(data)
        (out / 'ngdp.js').write_text('window.NGDP_DATA = ' + json.dumps(data, separators=(',', ':')) + ';\n')
        new_manifest = dict(date=snapshot_date, checked=today, files=files)
        # All downloads, computations, and page rendering succeeded before any destination writes.
        # The Actions job publishes one artifact only after this process exits successfully.
        for entry in files:
            shutil.copyfile(raw / Path(entry['file']).name, ROOT / 'tools' / entry['file'])
        for name in ['ngdp.js', 'ngdp-windows.csv']:
            shutil.copyfile(out / name, ROOT / 'assets/data' / name)
        for name, text in pages.items():
            (ROOT / name).write_text(text)
        (ROOT / 'tools/source_manifest.json').write_text(json.dumps(new_manifest, indent=2) + '\n')
        print(json.dumps(dict(sources_changed=changed, checked=today, snapshot=snapshot_date, actual_through=data['actualThrough'], windows=len(data['series']))))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, help='Use local source fixtures instead of downloading.')
    parser.add_argument('--check-date', help='Override the UTC check date for reproducibility.')
    args = parser.parse_args()
    refresh(args.source_dir, args.check_date)
