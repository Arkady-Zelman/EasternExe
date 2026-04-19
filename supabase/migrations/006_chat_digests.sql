-- 006_chat_digests.sql
-- Compacting chat-memory layer. Purpose:
--   Agent context shouldn't be "last 20 messages + full corpus chunks."
--   A digest is a rolling summary of what happened in a time window —
--   topics discussed, places mentioned, decisions noted, questions raised —
--   so the agent can see the flow of weeks of planning chat without paying
--   for the raw tokens.
--
-- Two write triggers:
--   - Daily (cron or scheduled function): one digest per (trip, yesterday).
--   - Inactivity: when live chat has been silent for 30+ min, digest pending
--     messages since the last digest.
--
-- Deterministic generation works without the LLM (keyword topic inference +
-- substring place matching + phrase heuristics). LLM refinement upgrades the
-- `summary` text when available.
--
-- Source distinguishes `chat_messages` (live in-app chat) from `upload_chunks`
-- (historical uploaded chat like a WhatsApp export). A trip can have both.

create table if not exists chat_digests (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  window_start timestamptz not null,
  window_end timestamptz not null,
  period text not null check (period in ('day','inactivity','manual')),
  source text not null default 'chat_messages'
    check (source in ('chat_messages','upload_chunks')),
  message_count int not null default 0,
  -- [{id, display_name, count}] — who talked and how much
  participants_active jsonb default '[]',
  -- [{id, label, count, sample}] — which topics came up, from our topic vocab
  topics_active jsonb default '[]',
  -- [{id, name, count}] — place names mentioned (id if matched to places table)
  places_mentioned jsonb default '[]',
  -- [{text, message_id}] — lines detected as decisions ("booked", "confirmed")
  decisions_noted jsonb default '[]',
  -- [{text, message_id}] — lines ending with ? or starting with "should we"
  questions_raised jsonb default '[]',
  -- LLM-generated prose. Nullable; deterministic runs leave this empty.
  summary text,
  generator text not null default 'deterministic'
    check (generator in ('deterministic','llm','hybrid')),
  created_at timestamptz default now(),
  -- One digest per (trip, window, source). Rebuilding overwrites via upsert.
  unique (trip_id, window_start, window_end, source)
);

create index if not exists chat_digests_trip_time
  on chat_digests (trip_id, window_start desc);

-- RLS: off (matches the rest of the public.* tables for MVP).
alter table chat_digests disable row level security;

-- PostgREST needs an explicit grant after 003_grant_anon pattern.
grant select, insert, update, delete on chat_digests to anon, authenticated;
