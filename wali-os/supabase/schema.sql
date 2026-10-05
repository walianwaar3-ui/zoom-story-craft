-- Wali OS database schema for Supabase.
-- Run once in Supabase → SQL Editor → New query → paste → Run. Safe to re-run.
--
-- Access model:
--   * Wali OS (browser) signs in with Supabase Auth and uses the anon key.
--     Row Level Security lets any signed-in user of this project read/write.
--     Turn OFF public sign-ups so only users you create can sign in.
--   * Hermes (server) uses the service_role key, which bypasses RLS.
--     Never put the service_role key in the browser.

create extension if not exists pgcrypto;

-- ── Workspace settings (single row) ─────────────────────────────────────────
create table if not exists public.workspace_settings (
  id smallint primary key default 1 check (id = 1),
  business_name text not null default '',
  owner_name text not null default '',
  owner_email text not null default '',
  currency text not null default 'USD',
  clocks jsonb not null default '[]'::jsonb
);
insert into public.workspace_settings (id) values (1) on conflict (id) do nothing;

-- ── People ──────────────────────────────────────────────────────────────────
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null default '',
  role text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null default '',
  instructions text not null default '',
  scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'paused')),
  requires_approval boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Clients ─────────────────────────────────────────────────────────────────
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text not null default '',
  email text not null default '',
  phone text not null default '',
  country text not null default '',
  status text not null default 'lead' check (status in ('lead', 'onboarding', 'active', 'paused', 'churned')),
  health text not null default 'good' check (health in ('good', 'watch', 'at-risk')),
  program text not null default '',
  mrr numeric not null default 0,
  owner text not null default '',
  next_action text not null default '',
  notes text not null default '',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  last_contact timestamptz
);
create index if not exists clients_email_idx on public.clients (lower(email));

-- ── Email ───────────────────────────────────────────────────────────────────
create table if not exists public.email_threads (
  id uuid primary key default gen_random_uuid(),
  contact_name text not null default '',
  contact_email text not null,
  subject text not null default '',
  client_id uuid references public.clients (id) on delete set null,
  status text not null default 'needs-reply'
    check (status in ('needs-reply', 'awaiting-approval', 'ready-to-send', 'replied', 'closed')),
  draft text not null default '',
  -- The approval holding the reply in review/approved. Not a foreign key so the
  -- thread and its approval can be written in either order.
  approval_id uuid,
  updated_at timestamptz not null default now()
);
create index if not exists email_threads_status_idx on public.email_threads (status);

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.email_threads (id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  body text not null default '',
  at timestamptz not null default now()
);
create index if not exists email_messages_thread_idx on public.email_messages (thread_id, at);

-- ── Delivery & growth ───────────────────────────────────────────────────────
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  status text not null default 'todo' check (status in ('todo', 'in-progress', 'review', 'done')),
  priority text not null default 'medium' check (priority in ('urgent', 'high', 'medium', 'low')),
  assignee text not null default '',
  client_id uuid references public.clients (id) on delete set null,
  due date,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text not null default 'Other'
    check (channel in ('Email', 'LinkedIn', 'Meta Ads', 'Google Ads', 'Referral', 'Event', 'Content', 'Other')),
  status text not null default 'planned' check (status in ('planned', 'live', 'paused', 'completed')),
  objective text not null default '',
  market text not null default '',
  budget numeric not null default 0,
  spend numeric not null default 0,
  leads integer not null default 0,
  booked integer not null default 0,
  revenue numeric not null default 0,
  start_date date,
  end_date date,
  notes text not null default '',
  created_at timestamptz not null default now()
);

-- ── Approvals: the contract between you and your agents ─────────────────────
create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'Other'
    check (type in ('Email reply', 'Proposal', 'Discount', 'Refund', 'Content', 'Campaign', 'Other')),
  title text not null,
  summary text not null default '',
  content text not null default '',
  requested_by text not null default '',
  client_id uuid references public.clients (id) on delete set null,
  thread_id uuid references public.email_threads (id) on delete set null,
  value numeric,
  risk text not null default 'medium' check (risk in ('low', 'medium', 'high')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decision_note text,
  -- Set by the agent after it has carried out an approved request.
  executed_at timestamptz
);
create index if not exists approvals_status_idx on public.approvals (status);

-- ── Row Level Security: signed-in users only ────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['workspace_settings', 'team_members', 'agents', 'clients', 'email_threads',
                           'email_messages', 'tasks', 'campaigns', 'approvals']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "signed-in users have full access" on public.%I', t);
    execute format(
      'create policy "signed-in users have full access" on public.%I for all to authenticated using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ── Realtime: push changes (including Hermes's) to the open app instantly ──
do $$
declare t text;
begin
  foreach t in array array['workspace_settings', 'team_members', 'agents', 'clients', 'email_threads',
                           'email_messages', 'tasks', 'campaigns', 'approvals']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
