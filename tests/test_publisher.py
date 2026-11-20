import sys
from pathlib import Path
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from publish_verified import verify_paths


class PublisherTests(unittest.TestCase):
    def test_publisher_accepts_only_data_and_engine_paths(self):
        verify_paths(['data/refresh-status.json','vendor/smogon-calc.min.js'])
        for paths in [[],['app.js'],['data/../../.github/workflows/checks.yml'],['data/not-code.json','.github/workflows/checks.yml']]:
            with self.assertRaises(ValueError):verify_paths(paths)
