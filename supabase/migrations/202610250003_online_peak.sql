begin;

create table if not exists public.eleicoes2026_presence_stats (
  site_id text primary key check (site_id = 'eleicoes2026'),
  peak_online bigint not null default 0 check (peak_online >= 0),
  peak_at timestamptz,
  tracking_since timestamptz not null default now()
);
alter table public.eleicoes2026_presence_stats enable row level security;
revoke all on table public.eleicoes2026_presence_stats from public, anon, authenticated;
grant select, insert, update on table public.eleicoes2026_presence_stats to service_role;

insert into public.eleicoes2026_presence_stats (site_id)
values ('eleicoes2026') on conflict (site_id) do nothing;

create or replace function public.eleicoes2026_online_heartbeat(p_visitor_id uuid)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare active_count bigint;
begin
  if p_visitor_id is null then raise exception 'visitor_id is required'; end if;
  insert into public.eleicoes2026_online_visitors (visitor_id, last_seen)
  values (p_visitor_id, now())
  on conflict (visitor_id) do update set last_seen = excluded.last_seen;
  delete from public.eleicoes2026_online_visitors
  where last_seen < now() - interval '2 minutes';
  select count(*) into active_count from public.eleicoes2026_online_visitors
  where last_seen >= now() - interval '2 minutes';
  -- Atualiza somente para um pico maior, inclusive em consultas concorrentes.
  insert into public.eleicoes2026_presence_stats (site_id, peak_online, peak_at)
  values ('eleicoes2026', active_count, now())
  on conflict (site_id) do update
  set peak_online = excluded.peak_online, peak_at = excluded.peak_at
  where public.eleicoes2026_presence_stats.peak_online < excluded.peak_online;
  return active_count;
end;
$$;
revoke all on function public.eleicoes2026_online_heartbeat(uuid) from public, anon, authenticated;
grant execute on function public.eleicoes2026_online_heartbeat(uuid) to service_role;

create or replace function public.eleicoes2026_online_stats()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'online', (select count(*) from public.eleicoes2026_online_visitors where last_seen >= now() - interval '2 minutes'),
    'peak_online', peak_online,
    'peak_at', peak_at,
    'tracking_since', tracking_since
  ) from public.eleicoes2026_presence_stats where site_id = 'eleicoes2026';
$$;
revoke all on function public.eleicoes2026_online_stats() from public, anon, authenticated;
grant execute on function public.eleicoes2026_online_stats() to service_role;

notify pgrst, 'reload schema';
commit;
