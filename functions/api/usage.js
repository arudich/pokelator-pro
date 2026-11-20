const EVENTS=new Set(['visit','matchup','team_created','team_imported','pokemon_added','color_change','color_saved']);
const headers={'Cache-Control':'no-store','Content-Type':'application/json','X-Content-Type-Options':'nosniff'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});

export async function onRequest({request,env}) {
  const url=new URL(request.url);
  if(request.method==='GET' && !url.searchParams.has('report')) return json({enabled:!!env.USAGE_DB});
  if(request.method==='GET') {
    if(!env.USAGE_REPORT_TOKEN || request.headers.get('Authorization')!==`Bearer ${env.USAGE_REPORT_TOKEN}`) return json({error:'Unauthorized'},401);
    if(!env.USAGE_DB) return json({error:'Usage counters not configured'},503);
    const since=url.searchParams.get('since'),until=url.searchParams.get('until');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(since || '') || !/^\d{4}-\d{2}-\d{2}$/.test(until || '') || since>=until) return json({error:'Invalid date range'},400);
    const rows=await env.USAGE_DB.prepare('SELECT day,event,total FROM daily_usage WHERE day >= ? AND day < ? ORDER BY day,event').bind(since,until).all();
    const first=await env.USAGE_DB.prepare('SELECT MIN(day) AS day FROM daily_usage').first();
    return json({since,until,firstRecordedDay:first?.day || null,rows:rows.results});
  }
  if(request.method!=='POST') return json({error:'Method not allowed'},405);
  // No CORS permission; only the real site's browser actions are accepted.
  if(request.headers.get('Origin')!==url.origin || !['pokelator.win','www.pokelator.win','pokelator-pro.pages.dev'].includes(url.hostname)) return json({error:'Forbidden'},403);
  if(!env.USAGE_DB) return json({error:'Usage counters not configured'},503);
  if(!request.headers.get('Content-Type')?.startsWith('application/json')) return json({error:'JSON required'},415);
  const body=await request.text();if(body.length>1024) return json({error:'Too large'},413);
  let counts;try {counts=JSON.parse(body).counts;} catch {return json({error:'Invalid JSON'},400);}
  if(!counts || typeof counts!=='object' || Array.isArray(counts) || !Object.keys(counts).length || Object.keys(counts).length>EVENTS.size) return json({error:'Invalid counts'},400);
  for(const [event,count] of Object.entries(counts)) if(!EVENTS.has(event) || !Number.isInteger(count) || count<1 || count>20) return json({error:'Invalid event'},400);
  const day=new Date().toISOString().slice(0,10);
  await env.USAGE_DB.batch(Object.entries(counts).map(([event,count])=>env.USAGE_DB.prepare(
    'INSERT INTO daily_usage(day,event,total) VALUES(?,?,?) ON CONFLICT(day,event) DO UPDATE SET total=total+excluded.total'
  ).bind(day,event,count)));
  return json({ok:true});
}
