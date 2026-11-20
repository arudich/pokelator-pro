import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from review_sources import capture


class ReviewSourceTests(unittest.TestCase):
    def test_large_roster_keeps_complete_hash_and_parseable_identity_summary(self):
        data={'generatedAt':'2026-11-20T00:00:00Z','padding':'x'*13_000_000,'pokemon':[
            {'showdownName':'Gogoat','summary':{'forms':[{'showdown_name':'Gogoat'}]},'learnableMoveNames':['Body Slam'],
             'battleDataCsvs':[{'season':'Current','format':'Singles','path':'pokemon_champions_assets/battle_data/Singles/Gogoat.csv'}]}]}
        raw=json.dumps(data).encode();response=io.BytesIO(raw);response.status=200
        with tempfile.TemporaryDirectory() as temp,patch('review_sources.urllib.request.urlopen',return_value=response):
            record,_=capture(Path(temp),'roster','https://championsbattledata.com/data/pokemon-index.json')
            compact=json.loads((Path(temp)/'roster.txt').read_text())
            self.assertEqual(record['sha256'],hashlib.sha256(raw).hexdigest())
            self.assertFalse(record['truncated']);self.assertEqual(compact['formIds'],['Gogoat'])
            self.assertEqual(len(record['csvSources']),1)
