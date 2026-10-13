"""Checks around the public-data boundary and complete website refresh."""
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
import warnings
from unittest.mock import patch
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('refresh_ngdp', ROOT / 'tools/refresh_ngdp.py')
refresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)


class RefreshTests(unittest.TestCase):
    def setUp(self):
        warnings.filterwarnings('ignore', message='Cannot parse header or footer')
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / 'site'
        for directory in ['tools/raw', 'assets/data']:
            shutil.copytree(ROOT / directory, self.root / directory)
        for file in ['index.html', 'ngdp.html', 'tools/source_manifest.json', 'tools/build_ngdp.py']:
            shutil.copyfile(ROOT / file, self.root / file)
        self.sources = Path(self.tmp.name) / 'sources'
        shutil.copytree(self.root / 'tools/raw', self.sources)
        self.patcher = patch.object(refresh, 'ROOT', self.root)
        self.patcher.start()

    def tearDown(self):
        self.patcher.stop()
        self.tmp.cleanup()

    def state(self):
        return {str(p.relative_to(self.root)): p.read_bytes() for p in self.root.rglob('*') if p.is_file()}

    def test_same_sources_preserve_all_values(self):
        before = refresh.payload(self.root / 'assets/data/ngdp.js')
        csv = pd.read_csv(self.root / 'assets/data/ngdp-windows.csv')
        refresh.refresh(self.sources, '2026-10-13')
        after = refresh.payload(self.root / 'assets/data/ngdp.js')
        self.assertEqual(before['series'], after['series'])
        pd.testing.assert_frame_equal(csv, pd.read_csv(self.root / 'assets/data/ngdp-windows.csv'))
        self.assertEqual(after['checked'], '2026-10-13')
        self.assertIn('Last checked: October 13, 2026', (self.root / 'ngdp.html').read_text())

    def test_new_gdp_release_updates_chart_csv_and_page(self):
        table = pd.read_csv(self.sources / 'GDP.csv')
        previous = pd.Period(table.observation_date.iloc[-1], freq='Q')
        new = previous + 1
        table.loc[len(table)] = [str(new.start_time.date()), float(table.GDP.iloc[-1]) * 1.01]
        table.to_csv(self.sources / 'GDP.csv', index=False)
        # A synthetic release may need a synthetic current-quarter survey too.
        book = pd.read_excel(self.sources / 'spf_medians.xlsx', sheet_name=None)
        for name in refresh.SHEETS:
            sheet = book[name]
            last = pd.Period(f'{int(sheet.YEAR.iloc[-1])}Q{int(sheet.QUARTER.iloc[-1])}', freq='Q')
            while last < new:
                last += 1
                row = sheet.iloc[-1].copy()
                row['YEAR'], row['QUARTER'] = last.year, last.quarter
                sheet.loc[len(sheet)] = row
        with pd.ExcelWriter(self.sources / 'spf_medians.xlsx') as writer:
            for name, sheet in book.items():
                sheet.to_excel(writer, sheet_name=name, index=False)
        refresh.refresh(self.sources, '2026-11-01')
        data = refresh.payload(self.root / 'assets/data/ngdp.js')
        self.assertEqual(data['actualThrough'], str(new))
        self.assertEqual(data['updated'], '2026-11-01')
        self.assertIn(f'Actual GDP through {new}', (self.root / 'ngdp.html').read_text())
        self.assertIn(f'to {new}', (self.root / 'index.html').read_text())
        rows = pd.read_csv(self.root / 'assets/data/ngdp-windows.csv')
        self.assertEqual(len(rows[rows.quarter == str(new)]), 17)

    def test_gdp_revision_changes_existing_gap(self):
        before = refresh.payload(self.root / 'assets/data/ngdp.js')
        table = pd.read_csv(self.sources / 'GDP.csv')
        table.loc[table.index[-1], 'GDP'] *= 1.001
        table.to_csv(self.sources / 'GDP.csv', index=False)
        refresh.refresh(self.sources, '2026-10-14')
        after = refresh.payload(self.root / 'assets/data/ngdp.js')
        self.assertEqual(before['actualThrough'], after['actualThrough'])
        self.assertNotEqual(before['series']['10'][-1][1], after['series']['10'][-1][1])
        self.assertEqual(after['updated'], '2026-10-14')

    def test_truncated_download_preserves_website(self):
        before = self.state()
        table = pd.read_csv(self.sources / 'GDP.csv')
        table.iloc[:-1].to_csv(self.sources / 'GDP.csv', index=False)
        with self.assertRaisesRegex(ValueError, 'regressed'):
            refresh.refresh(self.sources, '2026-10-13')
        self.assertEqual(before, self.state())

    def test_download_failure_preserves_website(self):
        before = self.state()
        with patch.object(refresh, 'download', side_effect=OSError('Source unavailable')):
            with self.assertRaises(OSError):
                refresh.refresh(check_date='2026-10-13')
        self.assertEqual(before, self.state())


if __name__ == '__main__':
    unittest.main()
