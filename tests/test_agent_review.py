import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from agent_review import unavailable_reason,validated_review,deliver,email_review,notify_failure,source_evidence


class AgentReviewTests(unittest.TestCase):
    def test_nightly_failure_email_does_not_collect_upstream_or_request_ai(self):
        run={'head_branch':'main','head_repository':{'full_name':'owner/repo'},'conclusion':'failure',
             'name':'Nightly data and engine refresh','html_url':'https://example.test/run'}
        jobs={'jobs':[{'name':'refresh','steps':[{'name':'Browser tests','conclusion':'failure'}]}]}
        with patch.dict('os.environ',{'GITHUB_REPOSITORY':'owner/repo'}),\
             patch('agent_review.github',side_effect=[run,jobs]) as github,\
             patch('agent_review.download') as download,patch('review_sources.collect') as collect,\
             patch('agent_review.send_email') as send:
            notify_failure(123)
        self.assertEqual(github.call_count,2)
        download.assert_not_called();collect.assert_not_called()
        body=send.call_args.args[0]
        self.assertIn('refresh: Browser tests',body)
        self.assertIn('not published',body)
        self.assertIn('No paid AI review',body)
        self.assertIn(run['html_url'],body)

    def test_failure_notification_rejects_untrusted_or_successful_source_runs(self):
        valid={'head_branch':'main','head_repository':{'full_name':'owner/repo'},'conclusion':'failure'}
        for change in [{'head_branch':'contributor'},{'head_repository':{'full_name':'fork/repo'}},{'conclusion':'success'}]:
            with self.subTest(change=change),patch.dict('os.environ',{'GITHUB_REPOSITORY':'owner/repo'}),\
                 patch('agent_review.github',return_value={**valid,**change}),patch('agent_review.send_email') as send:
                with self.assertRaises(ValueError):notify_failure(123)
                send.assert_not_called()

    def test_paid_review_evidence_omits_known_failure_logs(self):
        run={'head_branch':'main','head_repository':{'full_name':'owner/repo'},'html_url':'https://example.test/run','name':'Health'}
        jobs={'jobs':[{'name':'audit','conclusion':'failure','steps':[{'name':'Browser tests','conclusion':'failure'}]}]}
        with tempfile.TemporaryDirectory() as temp,patch.dict('os.environ',{'GITHUB_REPOSITORY':'owner/repo','GITHUB_TOKEN':'private'}),\
             patch('agent_review.github',side_effect=[run,jobs,{'artifacts':[]}]),\
             patch('agent_review.download') as download,patch('review_sources.collect',return_value=[]),\
             patch('agent_review.subprocess.run') as history:
            history.return_value.stdout='Recent data changes'
            source_evidence(123,Path(temp))
            evidence=(Path(temp)/'evidence.md').read_text()
        download.assert_not_called()
        self.assertIn('Browser tests',evidence)
        self.assertIn('Do not diagnose them',evidence)

    def test_only_health_schedule_opts_in_to_paid_review(self):
        workflows=Path(__file__).resolve().parents[1]/'.github/workflows'
        failure=(workflows/'refresh-investigation.yml').read_text()
        self.assertIn('notify-failure',failure)
        for marker in ['agent-review.yml','OPENAI_API_KEY','codex-action']:
            self.assertNotIn(marker,failure)
        health=(workflows/'site-health.yml').read_text()
        self.assertIn("cron: '37 14 1,15 * *'",health)
        self.assertIn('paid_review: true',health)
        review=(workflows/'agent-review.yml').read_text()
        self.assertIn('default: false',review)
        self.assertEqual(review.count('if: inputs.paid_review'),2)

    def test_email_is_concise_without_discarding_full_artifact_evidence(self):
        data={'status':'attention','summary':'A refresh was blocked.',
              'findings':[{'severity':'high','finding':'The CSV species differs.',
                           'evidence':'Very detailed evidence. '*300,'recommendation':'Reject the mismatched source.'},
                          {'severity':'info','finding':'December maintenance is upcoming.',
                           'evidence':'Routine watch detail. '*300,'recommendation':'Check after maintenance.'}],
              'sources':['https://example.test/source'],'limitations':[]}
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'assessment.json';path.write_text(json.dumps(data))
            parsed,full=validated_review(path);brief=email_review(parsed)
        self.assertIn('Very detailed evidence.',full)
        self.assertIn('Reject the mismatched source.',brief)
        self.assertNotIn('Very detailed evidence.',brief)
        self.assertNotIn('December maintenance',brief)
        self.assertIn('1 background/watch observations',brief)
        self.assertLess(len(brief),600)

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
