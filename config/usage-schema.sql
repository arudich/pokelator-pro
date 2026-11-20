-- Daily aggregate counters; intentionally no visitors, IPs, cookies, or team data.
CREATE TABLE IF NOT EXISTS daily_usage (
  day TEXT NOT NULL,
  event TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0 CHECK(total >= 0),
  PRIMARY KEY(day,event)
) WITHOUT ROWID;
