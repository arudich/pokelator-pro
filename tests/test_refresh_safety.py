import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from refresh_meta_usage import snapshot
from validate_site_data import payload,validate

INDEX=''.join(f'<a href="{name}-1630.txt">' for name in ['gen9championsbssregmc','gen9championsvgc2026regmc'])
TABLE=('Total battles: 1000\n'+''.join(f' | {i} | Species{i} | 0.5% | 10 |\n' for i in range(1,101))).encode()


class RefreshSafetyTests(unittest.TestCase):
    def fetch(self,url):
        if url=='https://www.smogon.com/stats/':return b'<a href="2026-11/"><a href="2026-10/">'
        if url.endswith('/'):return INDEX.encode()
        return TABLE

    def test_transport_failure_in_newer_month_cannot_silently_use_older_month(self):
        def fetch(url):
            if '2026-11/' in url and url.endswith('.txt'):raise OSError('HTTP 429')
            return self.fetch(url)
        with self.assertRaisesRegex(RuntimeError,'2026-11.*refusing silent fallback.*429'):snapshot(discover=True,fetcher=fetch)

    def test_one_row_successful_http_response_is_not_a_complete_usage_snapshot(self):
        def fetch(url):return b'Total battles: 1000\n | 1 | Kingambit | 20% | 10 |' if url.endswith('.txt') else self.fetch(url)
        with self.assertRaisesRegex(RuntimeError,'Incomplete usage table'):snapshot(discover=True,fetcher=fetch)

    def test_month_without_a_published_pair_is_an_explicit_normal_fallback(self):
        def fetch(url):return b'<a href="unrelated-format-1630.txt">' if url=='https://www.smogon.com/stats/2026-11/' else self.fetch(url)
        data=snapshot(discover=True,fetcher=fetch)
        self.assertEqual(data['formats']['Singles']['month'],'2026-10')
        self.assertEqual(data['discovery']['skippedUnpublishedFormats'][0]['month'],'2026-11')

    def test_empty_or_challenge_archive_page_is_not_treated_as_unpublished(self):
        def fetch(url):return b'<html>Service unavailable</html>' if url=='https://www.smogon.com/stats/2026-11/' else self.fetch(url)
        with self.assertRaisesRegex(RuntimeError,'completeness cannot be verified'):snapshot(discover=True,fetcher=fetch)

    def test_mixed_quote_links_select_the_actual_newer_published_pair(self):
        def fetch(url):
            if url=='https://www.smogon.com/stats/':return b"<a href='2026-11/'><a href=2026-10/>"
            if url.endswith('/'):
                return b"<a href='gen9championsbssregmc-1630.txt'><a href='gen9championsvgc2026regmc-1630.txt'><a href=\"other-1630.txt\">"
            return TABLE
        data=snapshot(discover=True,fetcher=fetch)
        self.assertEqual(data['formats']['Singles']['month'],'2026-11')
        self.assertEqual(data['discovery']['skippedUnpublishedFormats'],[])

    def test_missing_format_and_empty_category_are_rejected_with_identity(self):
        for mutation,message in [('format','Gogoat.*Singles'),('category','Furfrou.*Doubles.*spreads')]:
            with tempfile.TemporaryDirectory() as temp:
                root=Path(temp);shutil.copytree(ROOT/'data',root/'data');shutil.copytree(ROOT/'vendor',root/'vendor')
                roster=payload(root/'data/champions-roster.js')
                species=next(p for p in roster['pokemon'] if p['id']==('Gogoat' if mutation=='format' else 'Furfrou'))
                if mutation=='format':del species['usage']['Singles']
                else:species['usage']['Doubles']['spreads']=[]
                (root/'data/champions-roster.js').write_text('window.CHAMPIONS_ROSTER = '+json.dumps(roster)+';')
                with self.assertRaisesRegex(ValueError,message):validate(root)

    def test_a_plausible_but_large_meta_coverage_drop_needs_review(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);shutil.copytree(ROOT/'data',root/'data');shutil.copytree(ROOT/'vendor',root/'vendor')
            meta=payload(root/'data/meta-usage.js')
            meta['formats']['Doubles']['species']=dict(list(meta['formats']['Doubles']['species'].items())[:150])
            (root/'data/meta-usage.js').write_text('window.META_USAGE = '+json.dumps(meta)+';')
            with self.assertRaisesRegex(ValueError,'Doubles: meta coverage fell'):validate(root)

    def test_missing_replaced_species_and_nonempty_truncation_need_review(self):
        for mutation in ['missing','replacement','truncated']:
            with tempfile.TemporaryDirectory() as temp:
                root=Path(temp);shutil.copytree(ROOT/'data',root/'data');shutil.copytree(ROOT/'vendor',root/'vendor')
                roster=payload(root/'data/champions-roster.js')
                if mutation=='missing':roster['pokemon']=[p for p in roster['pokemon'] if p['id']!='Gogoat']
                elif mutation=='replacement':next(p for p in roster['pokemon'] if p['id']=='Gogoat')['id']='UnexpectedReplacement'
                else:
                    species=next(p for p in roster['pokemon'] if p['id']=='Furfrou')
                    species['usage']['Doubles']['spreads']=species['usage']['Doubles']['spreads'][:1]
                (root/'data/champions-roster.js').write_text('window.CHAMPIONS_ROSTER = '+json.dumps(roster)+';')
                with self.assertRaisesRegex(ValueError,'Gogoat|Furfrou Doubles: spreads sharply reduced'):validate(root)

    def test_concentrated_but_complete_distribution_is_not_called_truncated(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);shutil.copytree(ROOT/'data',root/'data');shutil.copytree(ROOT/'vendor',root/'vendor')
            roster=payload(root/'data/champions-roster.js')
            usage=next(p for p in roster['pokemon'] if p['id']=='Furfrou')['usage']['Doubles']
            usage['spreads']=usage['spreads'][:1];usage['spreads'][0]['percent']=100
            (root/'data/champions-roster.js').write_text('window.CHAMPIONS_ROSTER = '+json.dumps(roster)+';')
            validate(root)
