create table if not exists public.ai_usage (
  client_key text not null,
  usage_day date not null default current_date,
  count integer not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (client_key, usage_day)
);

alter table public.ai_usage enable row level security;

create or replace function public.update_ai_usage_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ai_usage_updated_at on public.ai_usage;
create trigger ai_usage_updated_at
before update on public.ai_usage
for each row
execute function public.update_ai_usage_updated_at();
