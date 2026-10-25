begin;

create table if not exists public.eleicoes2026_chat_messages (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null,
  request_id uuid not null,
  ip_hash text not null,
  author text not null check (char_length(trim(author)) between 1 and 30),
  message text not null check (char_length(trim(message)) between 1 and 280),
  created_at timestamptz not null default clock_timestamp(),
  unique (visitor_id, request_id)
);
create index if not exists eleicoes2026_chat_recent_idx on public.eleicoes2026_chat_messages (created_at desc, id);
create index if not exists eleicoes2026_chat_visitor_idx on public.eleicoes2026_chat_messages (visitor_id, created_at desc);
create index if not exists eleicoes2026_chat_ip_idx on public.eleicoes2026_chat_messages (ip_hash, created_at desc);
alter table public.eleicoes2026_chat_messages enable row level security;
revoke all on public.eleicoes2026_chat_messages from public, anon, authenticated;
grant select, insert, delete on public.eleicoes2026_chat_messages to service_role;

create or replace function public.eleicoes2026_chat_send(p_visitor_id uuid, p_request_id uuid, p_ip_hash text, p_author text, p_message text)
returns setof public.eleicoes2026_chat_messages
language plpgsql security definer set search_path = public
as $$
declare previous public.eleicoes2026_chat_messages;
begin
  if p_visitor_id is null or p_request_id is null or p_ip_hash is null or length(p_ip_hash) <> 64
    or p_author is null or char_length(trim(p_author)) not between 1 and 30
    or p_message is null or char_length(trim(p_message)) not between 1 and 280 then
    raise exception 'invalid_message' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('eleicoes2026-chat-ip:' || p_ip_hash, 0));
  perform pg_advisory_xact_lock(hashtextextended('eleicoes2026-chat-visitor:' || p_visitor_id::text, 0));
  select * into previous from public.eleicoes2026_chat_messages where visitor_id = p_visitor_id and request_id = p_request_id;
  if found then return next previous; return; end if;
  if exists (select 1 from public.eleicoes2026_chat_messages where visitor_id = p_visitor_id and created_at > clock_timestamp() - interval '3 seconds')
    or (select count(*) from public.eleicoes2026_chat_messages where ip_hash = p_ip_hash and created_at > clock_timestamp() - interval '1 minute') >= 15 then
    raise exception 'chat_rate_limit' using errcode = 'P0001';
  end if;
  return query insert into public.eleicoes2026_chat_messages (visitor_id, request_id, ip_hash, author, message)
    values (p_visitor_id, p_request_id, p_ip_hash, trim(p_author), trim(p_message)) returning *;
end;
$$;
revoke all on function public.eleicoes2026_chat_send(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.eleicoes2026_chat_send(uuid, uuid, text, text, text) to service_role;
notify pgrst, 'reload schema';
commit;
