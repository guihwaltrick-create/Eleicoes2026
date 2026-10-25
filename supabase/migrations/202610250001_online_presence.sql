begin;

-- Tabela exclusiva deste site, sem alterar dados dos outros projetos.
create table if not exists public.eleicoes2026_online_visitors (
  visitor_id uuid primary key,
  last_seen timestamptz not null default now()
);
create index if not exists eleicoes2026_online_visitors_last_seen_idx
  on public.eleicoes2026_online_visitors (last_seen);

alter table public.eleicoes2026_online_visitors enable row level security;
revoke all on table public.eleicoes2026_online_visitors from public, anon, authenticated;
grant select, insert, update, delete on table public.eleicoes2026_online_visitors to service_role;

create or replace function public.eleicoes2026_online_heartbeat(p_visitor_id uuid)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  active_count bigint;
begin
  if p_visitor_id is null then
    raise exception 'visitor_id is required';
  end if;

  insert into public.eleicoes2026_online_visitors (visitor_id, last_seen)
  values (p_visitor_id, now())
  on conflict (visitor_id) do update set last_seen = excluded.last_seen;

  delete from public.eleicoes2026_online_visitors
  where last_seen < now() - interval '2 minutes';

  select count(*) into active_count
  from public.eleicoes2026_online_visitors
  where last_seen >= now() - interval '2 minutes';

  return active_count;
end;
$$;

revoke all on function public.eleicoes2026_online_heartbeat(uuid) from public, anon, authenticated;
grant execute on function public.eleicoes2026_online_heartbeat(uuid) to service_role;
notify pgrst, 'reload schema';

commit;
