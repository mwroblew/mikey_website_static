"""Reproduce the website's SPF-based NGDP windows from the bundled snapshot."""
from pathlib import Path
import argparse
import csv
import hashlib
import json
import warnings
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--raw', type=Path, default=ROOT/'raw')
parser.add_argument('--out', type=Path, default=ROOT.parent/'assets/data')
parser.add_argument('--as-of', default='2026-10-12')
args = parser.parse_args()
RAW, OUT = args.raw, args.out
OUT.mkdir(parents=True, exist_ok=True)
warnings.filterwarnings('ignore', category=UserWarning, module='openpyxl')

def classify(g):
    if g < -1.25: return 'Tight'
    if g < -0.75: return 'Moderately Tight'
    if g <= 0.75: return 'Approximately Neutral'
    if g <= 1.25: return 'Moderately Loose'
    return 'Loose'

def main():
    actual = pd.read_csv(RAW / 'GDP.csv')
    gdp = pd.Series(actual.GDP.values, index=pd.PeriodIndex(actual.observation_date, freq='Q'))
    book = pd.read_excel(RAW / 'spf_medians.xlsx', sheet_name=['NGDP', 'RGDP', 'CPI', 'CPI10', 'RGDP10'])
    for table in book.values():
        table.index = pd.PeriodIndex([f'{int(y)}Q{int(q)}' for y, q in zip(table.YEAR, table.QUARTER)], freq='Q')
    lr_real = book['RGDP10'].RGDP10.ffill()
    lr_cpi = book['CPI10'].CPI10.ffill()
    records = []
    for origin, row in book['NGDP'].iterrows():
        if origin - 1 not in gdp.index or origin > gdp.index[-1]: continue
        levels = np.array([row[f'NGDP{i}'] for i in range(1, 7)], dtype=float)
        if not np.isfinite(levels[0]) or levels[0] <= 0: continue
        valid = np.isfinite(levels) & (levels > 0)
        knots = np.arange(-1, 5)[valid]
        logs = np.log(levels[valid] / levels[0])
        if len(knots) < 3 or knots[-1] < 1: continue
        last = int(knots[-1])
        terminal = (logs[-1] - logs[-2]) / (knots[-1] - knots[-2])
        tail, tail_source = terminal, 'last_available_quarterly_growth'
        rr, cc = book['RGDP'].loc[origin], book['CPI'].loc[origin]
        if pd.notna(lr_real.loc[origin]) and pd.notna(lr_cpi.loc[origin]):
            r1, r0, inflation = rr[f'RGDP{last+2}'], rr[f'RGDP{last+1}'], cc[f'CPI{last+2}']
            if all(pd.notna(x) for x in [r1, r0, inflation]) and min(r1, r0) > 0 and valid[last+1] and valid[last]:
                deflator = 4 * (np.log(levels[last+1] / levels[last]) - np.log(r1 / r0))
                wedge = deflator - np.log1p(inflation / 100)
                tail = (np.log1p(lr_real.loc[origin]/100) + np.log1p(lr_cpi.loc[origin]/100) + wedge) / 4
                tail_source = 'long_run_real_CPI_adjusted_by_terminal_deflator_wedge'
        for h in range(20):
            target = origin + h
            if target not in gdp.index: continue
            short = np.interp(min(h, last), knots, logs)
            forecast = gdp.loc[origin-1] * np.exp(short + max(h-last, 0)*tail)
            terminal_forecast = gdp.loc[origin-1] * np.exp(short + max(h-last, 0)*terminal)
            records.append(dict(origin=origin, target=target, horizon=h, forecast=forecast,
                terminal_tail_forecast=terminal_forecast, revised_GDP_base=gdp.loc[origin-1],
                survey_base=levels[0], last_reported_horizon=last, extrapolated=h>last,
                interpolated=h<=last and h not in knots, tail_source=tail_source, quarterly_log_tail=tail))
    paths = pd.DataFrame(records)
    results, checks = {}, {}
    for width in range(4, 21):
        selected = paths[paths.horizon < width]
        rows = []
        for target, p in selected.groupby('target'):
            if len(p) != width: continue
            assert set(p.origin) == {target-h for h in range(width)}
            benchmark = p.forecast.mean()
            gap = 100 * (gdp.loc[target] / benchmark - 1)
            rows.append(dict(quarter=target, actual_ngdp=gdp.loc[target], benchmark_ngdp=benchmark,
                gap_percent=gap, classification=classify(gap), forecast_vintages=width,
                extrapolated_vintages=int(p.extrapolated.sum()),
                terminal_tail_gap_percent=100*(gdp.loc[target]/p.terminal_tail_forecast.mean()-1)))
        r = pd.DataFrame(rows).set_index('quarter')
        assert r.index.equals(pd.period_range(r.index[0], r.index[-1], freq='Q'))
        assert np.isfinite(r.gap_percent).all()
        pivot = selected.pivot(index='target', columns='horizon', values='forecast').dropna()
        independent = 100*(gdp.loc[pivot.index]/pivot.sum(axis=1)*width-1)
        assert np.allclose(independent, r.gap_percent, atol=1e-10)
        results[width] = r
        checks[str(width)] = dict(first_quarter=str(r.index[0]), last_quarter=str(r.index[-1]),
            observations=len(r), latest_gap_percent=float(r.gap_percent.iloc[-1]),
            minimum=float(r.gap_percent.min()), maximum=float(r.gap_percent.max()),
            independent_aggregation_max_error_pp=float((independent-r.gap_percent).abs().max()))
    rec = pd.read_csv(RAW/'USREC.csv')
    months = pd.PeriodIndex(rec.observation_date, freq='M')
    spans, start = [], None
    decimal = lambda p: p.year + (p.month-1)/12
    for month, value in zip(months, rec.USREC):
        if value == 1 and start is None:
            start = month
        elif value == 0 and start is not None:
            spans.append([decimal(start), decimal(month)])
            start = None
    if start is not None:
        spans.append([decimal(start), decimal(months[-1]+1)])
    payload = dict(series={str(w): [[q.year+(q.quarter-1)/4, round(float(v),6)]
        for q,v in r.gap_percent.items()] for w,r in results.items()},
        recessions=spans, updated=args.as_of, actualThrough=str(gdp.index[-1]))
    (OUT/'ngdp.js').write_text('window.NGDP_DATA = '+json.dumps(payload,separators=(',',':'))+';\n')
    with (OUT/'ngdp-windows.csv').open('w',newline='') as f:
        writer = csv.writer(f, lineterminator="\n")
        writer.writerow(['quarter','window_quarters','actual_ngdp_billions_saar',
            'benchmark_ngdp_billions_saar','gap_percent','classification','extrapolated_vintages'])
        for w,r in results.items():
            for q,row in r.iterrows():
                writer.writerow([str(q),w,f'{row.actual_ngdp:.6f}',f'{row.benchmark_ngdp:.6f}',
                    f'{row.gap_percent:.6f}',row.classification,int(row.extrapolated_vintages)])
    print(json.dumps(checks,indent=2))

if __name__ == '__main__':
    main()
