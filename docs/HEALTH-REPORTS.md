# Pokelator health reports

Production setup completed November 19, 2026: Cloudflare D1 `pokelator-usage` is bound as `USAGE_DB` in production only, with the report credential stored as secrets in Cloudflare and GitHub. Resend uses its test sender while the custom domain is being connected. The audit still targets `https://pokelator-pro.pages.dev`. The setup sections below are retained for recovery or another deployment.

**Pokelator health report** runs on the **1st and 15th at 14:37 UTC** and supports manual runs in GitHub Actions. It checks production and emails a “Healthy” / “Attention needed” report. This is a deterministic automated auditor, with no paid AI model, autonomous code changes, or claim of AI visual inspection.

## The report

Emails lead with an embedded PNG dashboard: health status, refresh age, activity bars and (once history exists) period/coverage comparisons. The image is attached inline, so it needs no external image hosting. A full plain-text version and linked workflow evidence remain available. `scripts/health_figure.py` renders the figure using the existing Chromium dependency; `summary.png` and its HTML source are also retained with each report artifact. Missing counters are shown as unavailable, and zero counts get zero-length bars.

- Chromium loads the live Battle view and calculates damage. A Last Respects reference checks four fainted counts. All five builder panels must populate. JavaScript errors and mobile horizontal overflow are flagged. Desktop/mobile screenshots accompany the report for human review.
- The live engine bundles must match their published integrity manifest.
- A successful refresh older than 72 hours, source roster older than 14 days, missing usage categories, and old monthly usage are flagged. An independent upstream archive check looks for newer complete usage formats; monthly statistics are not expected to change nightly.
- Roster, learnset, move-effect and per-format usage coverage are compared with a retained report 25–50 days earlier, closest to 30 days. Losses above 10% are flagged. The first month explicitly has no historical baseline.
- Reports, snapshots and screenshots are retained as GitHub artifacts for 90 days. Warnings still produce email and mark the workflow unsuccessful.
- Activity totals count page loads, calculated Battle-view matchups, teams explicitly created/imported, Pokémon added, color edits (debounced), and palette saves. These are approximate browser actions, not unique people, real battles, existing local teams, or the default team created on first visit.

## One-time setup: email

1. Create a [Resend](https://resend.com/) account. Two reports per month fit its current free offering; check [pricing](https://resend.com/pricing).
2. Verify a sending domain, preferably `reports.pokelator.win`, by adding exactly the DNS records Resend supplies to Cloudflare. This can wait until the domain is active. The test sender `onboarding@resend.dev` can only send to your Resend account email before a domain is verified.
3. Create a **sending-access** API key. Add these repository **Actions secrets** under GitHub → arudich/pokelator-pro → Settings → Secrets and variables → Actions:

   | Secret | Value |
   | --- | --- |
   | `RESEND_API_KEY` | Your sending API key |
   | `HEALTH_EMAIL_TO` | Your report recipient address |
   | `HEALTH_EMAIL_FROM` | E.g. `Pokelator Health Reports <health@reports.pokelator.win>` after verifying that subdomain |
   | `USAGE_REPORT_TOKEN` | The random secret from the counter setup below |

   Keep keys and recipient addresses out of public source files and issues.
4. Optionally add the Actions **variable** `HEALTH_SITE_URL=https://pokelator.win` after the custom domain works. Until then the auditor uses `https://pokelator-pro.pages.dev`.
5. Run **Actions → Pokelator health report → Run workflow**. Check actual inbox delivery; provider acceptance alone is not an inbox guarantee. Missing email configuration causes a visible failure instead of silently discarding a report.

## One-time setup: counters

1. In Cloudflare, create a **D1** database called `pokelator-usage`.
2. In its SQL console, run [config/usage-schema.sql](../config/usage-schema.sql). The table is keyed by date and action; it has no visitor identifiers or team contents.
3. In **Workers & Pages → pokelator-pro → Settings → Bindings**, add a production **D1 database** binding named **`USAGE_DB`**, selecting that database. Leave previews unbound.
4. Generate a secret with your password manager or `python3 -c 'import secrets; print(secrets.token_urlsafe(32))'`. Add it as the production Cloudflare **secret** `USAGE_REPORT_TOKEN` and the identically named GitHub Actions secret. It authorizes reading totals and must never go into browser JavaScript.
5. Redeploy Pages so the bindings take effect. `/functions/api/usage.js` deploys through the existing Git integration; `/api/usage` is the only Function route.
6. Open `/api/usage` on production: it should say `{"enabled":true}`. Use the app, wait 30 seconds or switch tabs, then run the report. Automated health-check browsers do not add events.

Counters remain **off** until the database is bound. An unavailable counter is reported as unavailable, not zero. There is no backfill. The report compares the last 14 complete UTC days with the preceding 14; newly started tracking is labeled incomplete. This fixed window differs from the 1st/15th delivery schedule.

Only daily aggregate action totals are stored. Matchup contents are used locally to deduplicate redraws and never transmitted. Counters honor Do Not Track / Global Privacy Control and do not block the calculator. Same-origin checks, an event allowlist and bounded batches limit accidental pollution, but blocking, offline use, capped batches and public-endpoint abuse can skew totals. Both production hostnames share the database; previews and localhost are excluded. The [privacy page](../public/privacy.html) describes this to visitors. Aggregate totals may appear in public workflow artifacts.

The site remains static except for the counter API. D1/Functions have free-tier limits; viral traffic can exhaust counters while static assets and browser calculations continue working. Do not upgrade billing automatically. Check [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and [Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/).

## Limits and recovery

This is a scheduled audit, not continuous uptime monitoring. GitHub can delay schedules or disable them after prolonged inactivity; nightly bot commits are not a guarantee against suspension. Enable GitHub Actions failure notifications as a second channel. Failures before the email step (e.g. GitHub outage or dependency installation failure) cannot send this report. An independent uptime monitor would be needed for immediate outage alerts.

Health reports do not change live data; existing nightly validation governs publication. A game patch may need adapter changes despite passing checks. Investigate changed reference damage rather than automatically replacing expected values.

## Local preview

```sh
.venv/bin/python scripts/site_health.py --output /tmp/pokelator-health-report
```

This produces a report and screenshots without email. Add `--send` only with mail environment variables configured. Warnings return a nonzero status after writing the report and, when configured, sending it.

References: [Pages D1 bindings](https://developers.cloudflare.com/pages/functions/bindings/#d1-databases), [Resend API](https://resend.com/docs/api-reference/emails/send-email), [GitHub schedules](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
