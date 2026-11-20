import datetime as dt
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from site_health import inspect_snapshot,usage_report,render_report,send_email


class SiteHealthTests(unittest.TestCase):
    def setUp(self):
        self.now=dt.datetime(2026,11,20,tzinfo=dt.timezone.utc)
        self.current={'auditedAt':self.now.isoformat(),'url':'https://example.test',
            'checkedAt':'2026-11-19T01:00:00Z','rosterGeneratedAt':'2026-11-19T01:00:00Z',
            'coverage':{'species':347,'Singles spreads':2500},
            'formats':{f:{'month':'2026-10','species':200} for f in ['Singles','Doubles']}}

    def test_monthly_data_is_not_stale_just_because_it_is_not_daily(self):
        self.assertEqual(inspect_snapshot(self.current,now=self.now),[])

    def test_stale_missing_and_monthly_coverage_loss_are_flagged(self):
        self.current['checkedAt']='bad date';self.current['coverage']['Singles spreads']=0
        baseline={'coverage':{'species':400,'Singles spreads':2500}}
        warnings=inspect_snapshot(self.current,baseline,self.now)
        self.assertTrue(any('72 hours' in x for x in warnings))
        self.assertTrue(any('400' in x and '347' in x for x in warnings))
        self.assertTrue(any('Missing data' in x for x in warnings))

    def test_usage_windows_do_not_overlap_and_new_tracking_has_no_false_trend(self):
        with patch('site_health.request_json',return_value={'firstRecordedDay':'2026-11-01','rows':[
            {'day':'2026-11-05','event':'matchup','total':3},
            {'day':'2026-11-06','event':'matchup','total':7}]}):
            usage=usage_report('https://example.test','secret',self.now)
        self.assertEqual(usage['totals']['matchup'],7)
        self.assertEqual(usage['previous']['matchup'],3)
        self.assertFalse(usage['previousPeriodComplete'])
        report=render_report(self.current,[],[],usage,None,'https://example.test/run')
        self.assertIn('Tracking is new',report);self.assertNotIn('vs. previous',report)

    def test_unconfigured_tracking_is_unavailable_not_zero(self):
        usage=usage_report('https://example.test',None,self.now)
        self.assertFalse(usage['available'])
        report=render_report(self.current,[],[],usage,None,'https://example.test/run')
        self.assertIn('Usage unavailable',report);self.assertNotIn('0 calculated matchups',report)

    def test_email_uses_private_environment_and_escapes_report(self):
        with patch.dict('os.environ',{'RESEND_API_KEY':'private','HEALTH_EMAIL_TO':'recipient@example.test',
                                     'HEALTH_EMAIL_FROM':'sender@example.test'}),patch('site_health.request_json',return_value={'id':'accepted'}) as send:
            send_email('<script>hello</script>',[], '123')
        url,headers,payload=send.call_args.args
        self.assertEqual(url,'https://api.resend.com/emails')
        self.assertEqual(payload['to'],['recipient@example.test'])
        self.assertIn('&lt;script&gt;',payload['html'])
        self.assertEqual(headers['Idempotency-Key'],'pokelator-health-123')


class UsageBrowserTests(unittest.TestCase):
    def test_usage_batches_deduplicates_and_does_not_upload_matchup_contents(self):
        from playwright.sync_api import sync_playwright
        source=(Path(__file__).resolve().parents[1]/'analytics.js').read_text()
        with sync_playwright() as p:
            browser=p.chromium.launch();page=browser.new_page()
            page.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>false})")
            page.route('https://pokelator.win/',lambda route:route.fulfill(body='<html></html>',content_type='text/html'))
            requests=[]
            def endpoint(route):
                if route.request.method=='POST':requests.append(json.loads(route.request.post_data))
                route.fulfill(json={'enabled':True})
            page.route('**/api/usage',endpoint)
            page.goto('https://pokelator.win/');page.add_script_tag(content=source)
            page.wait_for_timeout(50)
            page.evaluate("SiteUsage.count('matchup','secret team contents');SiteUsage.count('matchup','secret team contents');SiteUsage.count('team_created');SiteUsage.flush()")
            page.wait_for_timeout(50)
            self.assertEqual(requests,[{'counts':{'visit':1,'matchup':1,'team_created':1}}])
            browser.close()

    def test_do_not_track_prevents_any_counter_request(self):
        from playwright.sync_api import sync_playwright
        source=(Path(__file__).resolve().parents[1]/'analytics.js').read_text()
        with sync_playwright() as p:
            browser=p.chromium.launch();page=browser.new_page()
            page.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>false});Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'})")
            page.route('https://pokelator.win/',lambda route:route.fulfill(body='<html></html>',content_type='text/html'))
            requests=[];page.route('**/api/usage',lambda route:requests.append(route.request.url))
            page.goto('https://pokelator.win/');page.add_script_tag(content=source)
            page.evaluate("SiteUsage.count('team_created');SiteUsage.flush()")
            page.wait_for_timeout(50);self.assertEqual(requests,[]);browser.close()
