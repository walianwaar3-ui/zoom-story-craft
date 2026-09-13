-- Meta (Facebook/Instagram) ad account connection.
--
-- This app is single-user, so there is at most one connection row. Unlike every
-- other table here, this one carries a real access token that spends real money
-- if misused — so it gets NO row-level-security policies at all. With RLS
-- enabled and zero policies, PostgREST (anon/authenticated) can neither read nor
-- write this table under any circumstance; only the service role key (used by
-- the meta-connect and meta-ads-agent edge functions) can touch it. The
-- frontend never queries this table directly — it only ever sees the safe
-- status summary that meta-connect returns, which never includes the token.
CREATE TABLE public.meta_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  access_token TEXT NOT NULL,
  ad_account_id TEXT NOT NULL,
  ad_account_name TEXT,
  business_name TEXT,
  page_id TEXT,
  page_name TEXT,
  currency TEXT,
  connected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_checked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_check_error TEXT
);

ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;

-- A log of ads the assistant has pushed to Meta. Every row is a real campaign
-- that exists (paused) in the connected ad account, so only the edge function
-- (service role) writes rows — the browser can read the list to render the
-- "Ads created here" panel, but never inserts, updates, or deletes directly.
CREATE TABLE public.meta_ad_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  objective TEXT NOT NULL,
  daily_budget NUMERIC NOT NULL,
  currency TEXT,
  status TEXT NOT NULL DEFAULT 'PAUSED',
  campaign_id TEXT,
  adset_id TEXT,
  ad_id TEXT,
  ad_account_id TEXT NOT NULL,
  review_url TEXT,
  failure_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_meta_ad_drafts_created_at ON public.meta_ad_drafts (created_at DESC);

ALTER TABLE public.meta_ad_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read ad drafts" ON public.meta_ad_drafts FOR SELECT USING (true);
