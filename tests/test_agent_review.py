import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from agent_review import unavailable_reason,validated_review,deliver


class AgentReviewTests(unittest.TestCase):
    def test_credit_failures_are_distinct_from_rate_limits_and_permissions(self):
        self.assertIn('credit or spending limit exhausted',unavailable_reason('HTTP 429 insufficient_quota'))
        self.assertIn('rate limit',unavailable_reason('HTTP 429 rate_limit_exceeded'))
        self.assertNotIn('exhausted',unavailable_reason('HTTP 429 rate_limit_exceeded'))
        self.assertIn('permissions',unavailable_reason('HTTP 403'))

    def test_invalid_or_incomplete_assessment_is_not_treated_as_success(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'assessment.json';path.write_text('{"status":"healthy","summary":"Everything fine"}')
            with self.assertRaises(ValueError):validated_review(path)

    def test_email_still_runs_when_agent_has_no_credit(self):
        with tempfile.TemporaryDirectory() as temp:
            directory=Path(temp);report=directory/'health-report';report.mkdir()
            (directory/'source.json').write_text(json.dumps({'url':'https://example.test/run','name':'Pokelator health report'}))
            (report/'snapshot.json').write_text('{"warnings":[]}')
            (report/'report.md').write_text('Automated checks passed.')
            jobs={'jobs':[{'name':'investigate / agent','status':'completed','id':123}]}
            with patch.dict('os.environ',{'GITHUB_RUN_ID':'456','GITHUB_TOKEN':'private','GITHUB_REPOSITORY':'owner/repo'}),\
                 patch('agent_review.github',return_value=jobs),\
                 patch('agent_review.download',return_value=b'HTTP 429 credit_balance_exhausted'),\
                 patch('agent_review.send_email') as send:
                deliver(directory,directory/'missing.json','failure')
            args=send.call_args.args
            self.assertIn('Automated checks passed.',args[0])
            self.assertIn('credit or spending limit exhausted',args[0])
            self.assertTrue(args[1]);self.assertEqual(args[2],'agent-456')

    def test_successful_reasoning_is_combined_with_existing_report(self):
        with tempfile.TemporaryDirectory() as temp:
            directory=Path(temp);report=directory/'health-report';report.mkdir()
            (directory/'source.json').write_text(json.dumps({'url':'https://example.test/run','name':'Pokelator health report'}))
            (report/'snapshot.json').write_text('{"warnings":[]}')
            (report/'report.md').write_text('Checks passed.')
            result=directory/'assessment.json';result.write_text(json.dumps({'status':'uncertain','summary':'Cannot verify the announced patch.',
                'findings':[],'sources':['https://example.test/patch'],'limitations':['Publisher unavailable.']}))
            with patch.dict('os.environ',{'GITHUB_RUN_ID':'789'}),patch('agent_review.send_email') as send:
                deliver(directory,result,'success')
            self.assertIn('Publisher unavailable.',send.call_args.kwargs['review'])
            self.assertTrue(send.call_args.args[1])
