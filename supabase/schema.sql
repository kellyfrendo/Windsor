-- Windsor tables in the same Supabase project as Leftovers.
-- Run once in the SQL editor. Does not change kitchen_sync.

create table if not exists public.windsor_state (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at bigint not null default 0
);

alter table public.windsor_state enable row level security;

insert into storage.buckets (id, name, public, file_size_limit)
values ('windsor-files', 'windsor-files', false, 26214400)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;
