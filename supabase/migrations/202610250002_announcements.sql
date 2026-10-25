begin;

create table if not exists public.eleicoes2026_announcements (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('info', 'ad')),
  message text not null check (char_length(trim(message)) between 1 and 240),
  url text,
  active boolean not null default true,
  sort_order integer not null default 0 check (sort_order between 0 and 9999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint eleicoes2026_announcement_link check (
    (kind = 'info' and url is null) or
    (kind = 'ad' and url is not null and url ~* '^https?://')
  )
);

create index if not exists eleicoes2026_announcements_active_order_idx
  on public.eleicoes2026_announcements (active, sort_order, created_at);

alter table public.eleicoes2026_announcements enable row level security;
revoke all on table public.eleicoes2026_announcements from public, anon, authenticated;
grant select, insert, update, delete on table public.eleicoes2026_announcements to service_role;

notify pgrst, 'reload schema';
commit;
