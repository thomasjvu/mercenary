create table if not exists raids (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null,
  host text,
  language text not null,
  framework text,
  budget_usd numeric not null,
  num_experts int not null,
  first_valid_submission_id text,
  primary_submission_id text,
  task_json jsonb not null,
  sanitization_json jsonb not null
);

create table if not exists providers (
  id text primary key,
  display_name text not null,
  endpoint text not null,
  endpoint_type text not null,
  status text not null,
  model_family text,
  price_per_task_usd numeric not null,
  output_types_json jsonb,
  privacy_json jsonb,
  scores_json jsonb,
  specializations jsonb not null,
  supported_languages jsonb not null,
  supported_frameworks jsonb not null,
  auth_json jsonb,
  reputation_json jsonb not null
);

create table if not exists provider_assignments (
  id bigserial primary key,
  raid_id text not null references raids(id) on delete cascade,
  provider_id text not null references providers(id),
  status text not null,
  invited_at timestamptz,
  accepted_at timestamptz,
  first_heartbeat_at timestamptz,
  last_heartbeat_at timestamptz,
  submitted_at timestamptz,
  timeout_at timestamptz,
  latency_ms int,
  progress numeric,
  provider_run_id text,
  message text
);

create table if not exists submissions (
  id bigserial primary key,
  raid_id text not null references raids(id) on delete cascade,
  provider_id text not null references providers(id),
  patch_diff text not null,
  explanation text not null,
  confidence numeric not null,
  claimed_root_cause text,
  files_touched jsonb not null,
  submitted_at timestamptz not null,
  score_json jsonb not null,
  valid boolean not null,
  rank int not null
);

create table if not exists reputation_events (
  id bigserial primary key,
  provider_id text not null references providers(id),
  raid_id text,
  event_type text not null,
  delta_json jsonb not null,
  context_json jsonb,
  created_at timestamptz not null default now()
);
