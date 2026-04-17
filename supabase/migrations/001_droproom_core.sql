create extension if not exists pgcrypto;

create table if not exists public.drops (
  id text primary key,
  token_id text not null unique,
  title text not null,
  description text not null default '',
  image_url text not null,
  image_ipfs_uri text,
  metadata_uri text not null,
  media_type text,
  creator_address text not null,
  creator_label text,
  price_eth numeric not null default 0,
  price_wei text not null default '0',
  edition integer not null check (edition > 0 and edition <= 999),
  minted integer not null default 0 check (minted >= 0),
  status text not null default 'live' check (status in ('draft', 'live', 'sold-out', 'review-pending')),
  tx_hash text not null unique,
  basescan_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mints (
  id uuid primary key default gen_random_uuid(),
  token_id text not null references public.drops(token_id) on delete cascade,
  collector_address text not null,
  quantity integer not null default 1 check (quantity > 0),
  paid_wei text not null default '0',
  tx_hash text not null unique,
  basescan_url text,
  created_at timestamptz not null default now()
);

create index if not exists drops_creator_address_idx on public.drops (creator_address);
create index if not exists drops_created_at_idx on public.drops (created_at desc);
create index if not exists mints_collector_address_idx on public.mints (collector_address);
create index if not exists mints_token_id_idx on public.mints (token_id);

alter table public.drops enable row level security;
alter table public.mints enable row level security;

drop policy if exists "Drops are public" on public.drops;
create policy "Drops are public"
on public.drops
for select
using (true);

drop policy if exists "Mints are public" on public.mints;
create policy "Mints are public"
on public.mints
for select
using (true);

create or replace function public.update_drops_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists drops_updated_at on public.drops;
create trigger drops_updated_at
before update on public.drops
for each row
execute function public.update_drops_updated_at();

create or replace function public.apply_mint_to_drop()
returns trigger
language plpgsql
as $$
begin
  update public.drops
  set
    minted = least(edition, minted + new.quantity),
    status = case
      when least(edition, minted + new.quantity) >= edition then 'sold-out'
      else status
    end
  where token_id = new.token_id;

  return new;
end;
$$;

drop trigger if exists mints_apply_to_drop on public.mints;
create trigger mints_apply_to_drop
after insert on public.mints
for each row
execute function public.apply_mint_to_drop();
