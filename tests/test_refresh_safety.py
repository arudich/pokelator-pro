import json
import csv
import io
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from refresh_meta_usage import snapshot,parse_usage
from validate_site_data import payload,validate
from build_roster import build

INDEX=''.join(f'<a href="{name}-1630.txt">' for name in ['gen9championsbssregmc','gen9championsvgc2026regmc'])
TABLE=('Total battles: 1000\n'+''.join(f' | {i} | Species{i} | 0.5% | 10 |\n' for i in range(1,101))).encode()


class RefreshSafetyTests(unittest.TestCase):
    def test_csv_percentage_loss_is_rejected_even_when_rows_and_ranks_are_intact(self):
        fixture=ROOT/'tests/fixtures/furfrou-usage.csv'
        original=list(csv.DictReader(io.StringIO(fixture.read_text())))
        form={'saved_name':'Furfrou','showdown_name':'Furfrou','form_kind':'Base',
              'hp':150,'attack':100,'defense':100,'sp_attack':100,'sp_defense':100,'speed':100,
              'image_path':'pokemon_champions_assets/pokemon/Furfrou.png','types':['Normal'],'abilities':'Fur Coat'}
        record={'showdownName':'Furfrou','summary':{'forms':[form]},'learnableMoveNames':['Tackle'],
                'battleDataCsvs':[{'season':'Current','format':'Singles','path':'Singles/Furfrou.csv'}]}
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);shutil.copytree(ROOT/'data',root/'data');shutil.copytree(ROOT/'vendor',root/'vendor')
            path=root/'csv/Singles/Furfrou.csv';path.parent.mkdir(parents=True)
            for source_category,category in [('stat_points','spreads'),('move','moves'),('held_item','items'),('ability','abilities'),('stat_alignment','natures')]:
                with self.subTest(category=category):
                    rows=[dict(row) for row in original]
                    for row in rows:
                        if row['category']==source_category:row['percentage']=''
                    with path.open('w') as file:
                        writer=csv.DictWriter(file,fieldnames=rows[0].keys());writer.writeheader();writer.writerows(rows)
                    built=build({'pokemon':[record],'generatedAt':'fixture'},path.parent.parent)['pokemon'][0]
                    roster=payload(ROOT/'data/champions-roster.js')
                    species=next(p for p in roster['pokemon'] if p['id']=='Furfrou')
                    species['usage']['Singles']=built['usage']['Singles']
                    self.assertEqual([row['rank'] for row in built['usage']['Singles'][category]],list(range(1,len(built['usage']['Singles'][category])+1)))
                    (root/'data/champions-roster.js').write_text('window.CHAMPIONS_ROSTER = '+json.dumps(roster)+';')
                    with self.assertRaisesRegex(ValueError,'Furfrou Singles: no usable '+category+' percentages'):validate(root)

    def test_monthly_usage_rejects_interior_gaps_duplicates_and_malformed_rows(self):
        table=TABLE.decode()
        cases=[table.replace(' | 2 | Species2 | 0.5% | 10 |\n',''),
               table.replace(' | 2 | Species2 |',' | 1 | Species2 |'),
               table.replace('Species2 |','Species-1 |'),
               table.replace(' | 2 | Species2 | 0.5% |',' | 2 | Species2 | broken |')]
        for text in cases:
            with self.subTest(text=text[:120]),self.assertRaises(ValueError):parse_usage(text)
        self.assertEqual(len(parse_usage(table)),100)
        def fetch(url):return cases[0].encode() if url.endswith('.txt') else self.fetch(url)
        with self.assertRaisesRegex(RuntimeError,'refusing silent fallback.*consecutive'):
            snapshot(discover=True,fetcher=fetch,minimum_species=90)

    def test_stored_monthly_usage_rejects_one_missing_interior_rank(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);shutil.copytree(ROOT/'data',root/'data');shutil.copytree(ROOT/'vendor',root/'vendor')
            meta=payload(root/'data/meta-usage.js')
            records=meta['formats']['Doubles']['species']
            del records[next(key for key,row in records.items() if row['rank']==2)]
            (root/'data/meta-usage.js').write_text('window.META_USAGE = '+json.dumps(meta)+';')
            with self.assertRaisesRegex(ValueError,'unique and consecutive'):validate(root)

    def test_csv_body_identity_must_match_source_record_including_shared_forms(self):
        record={'showdownName':'Venusaur','summary':{'forms':[]},'battleDataCsvs':[
            {'season':'Current','format':'Singles','path':'Singles/Venusaur.csv'}]}
        for name,kind in [('Venusaur','Base'),('Venusaur-Mega','Mega')]:
            record['summary']['forms'].append({'saved_name':name,'showdown_name':name,'form_kind':kind,
                'hp':100,'attack':100,'defense':100,'sp_attack':100,'sp_defense':100,'speed':100,
                'image_path':'pokemon_champions_assets/pokemon/test.png','types':['Grass','Poison'],'abilities':'Overgrow'})
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'Singles/Venusaur.csv';path.parent.mkdir()
            path.write_text('pokemon,column_position,category,rank,name,percentage\nVenusaur,10,ability,1,Overgrow,100%\n')
            self.assertEqual(len(build({'pokemon':[record],'generatedAt':'2026-11-20'},temp)['pokemon']),2)
            for body in ['Furfrou,10,ability,1,Fur Coat,100%',
                         'Venusaur,10,ability,1,Overgrow,100%\nFurfrou,10,move,1,Cotton Guard,67.9%']:
                path.write_text('pokemon,column_position,category,rank,name,percentage\n'+body+'\n')
                with self.assertRaisesRegex(ValueError,'CSV species mismatch.*Venusaur Singles.*Furfrou'):
                    build({'pokemon':[record],'generatedAt':'2026-11-20'},temp)

    def test_complete_furfrou_csv_cannot_be_imported_as_gogoat(self):
        fixture=ROOT/'tests/fixtures/furfrou-usage.csv'
        record={'showdownName':'Gogoat','summary':{'forms':[]},'battleDataCsvs':[
            {'season':'Current','format':'Singles','path':'Singles/Gogoat.csv'}]}
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'Singles/Gogoat.csv';path.parent.mkdir();shutil.copyfile(fixture,path)
            with self.assertRaisesRegex(ValueError,'CSV species mismatch.*Gogoat Singles.*Furfrou'):
                build({'pokemon':[record],'generatedAt':'2026-11-20'},temp)

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

    def test_interior_rank_gaps_are_rejected_but_short_consecutive_lists_are_valid(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);shutil.copytree(ROOT/'data',root/'data');shutil.copytree(ROOT/'vendor',root/'vendor')
            original=payload(root/'data/champions-roster.js')
            for category in ['moves','items','abilities','natures','spreads']:
                roster=json.loads(json.dumps(original))
                species=next(p for p in roster['pokemon'] if len(p['usage']['Doubles'][category])>=3)
                del species['usage']['Doubles'][category][1]
                (root/'data/champions-roster.js').write_text('window.CHAMPIONS_ROSTER = '+json.dumps(roster)+';')
                with self.assertRaisesRegex(ValueError,'nonconsecutive '+category+' ranks'):validate(root)
            roster=json.loads(json.dumps(original))
            species=next(p for p in roster['pokemon'] if p['id']=='Furfrou')
            species['usage']['Doubles']['spreads']=species['usage']['Doubles']['spreads'][:-1]
            (root/'data/champions-roster.js').write_text('window.CHAMPIONS_ROSTER = '+json.dumps(roster)+';')
            validate(root)
