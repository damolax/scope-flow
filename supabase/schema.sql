-- ScopeFlow production schema
-- Independent businesses, Supabase Auth, secure owner-only server routes and a protected platform admin.
-- Safe to run repeatedly.
create extension if not exists pgcrypto;

create table if not exists public.sf_accounts (
  id text primary key default gen_random_uuid()::text,
  auth_user_id uuid unique,
  name text not null,
  business_name text not null default '',
  email text unique not null,
  password_hash text,
  active boolean not null default true,
  is_admin boolean not null default false,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sf_accounts add column if not exists auth_user_id uuid;
alter table public.sf_accounts add column if not exists business_name text not null default '';
alter table public.sf_accounts add column if not exists is_admin boolean not null default false;
alter table public.sf_accounts add column if not exists last_sign_in_at timestamptz;
alter table public.sf_accounts add column if not exists password_hash text;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sf_accounts' and column_name = 'password_hash'
  ) then
    alter table public.sf_accounts alter column password_hash drop not null;
  end if;
end $$;

create unique index if not exists sf_accounts_email_idx on public.sf_accounts(lower(email));
create unique index if not exists sf_accounts_auth_user_idx on public.sf_accounts(auth_user_id) where auth_user_id is not null;

create table if not exists public.sf_workspaces (
  owner_id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.sf_proposals (
  id text primary key,
  owner_id text not null,
  public_token text unique not null,
  invoice_tokens text[] not null default '{}'::text[],
  status text not null default 'draft',
  client_email text,
  updated_at timestamptz not null default now(),
  data jsonb not null
);

create index if not exists sf_proposals_owner_idx on public.sf_proposals(owner_id, updated_at desc);
alter table public.sf_proposals add column if not exists invoice_tokens text[] not null default '{}'::text[];
create index if not exists sf_proposals_token_idx on public.sf_proposals(public_token);
create index if not exists sf_proposals_invoice_tokens_idx on public.sf_proposals using gin(invoice_tokens);

-- Backfill invoice lookup tokens for records created before multiple invoices were introduced.
update public.sf_proposals p
set invoice_tokens = coalesce(
  array(
    select distinct token
    from (
      select nullif(invoice_item ->> 'publicToken', '') as token
      from jsonb_array_elements(coalesce(p.data -> 'invoices', '[]'::jsonb)) invoice_item
      union all
      select case
        when p.data ? 'invoice' then coalesce(nullif(p.data -> 'invoice' ->> 'publicToken', ''), p.public_token)
        else null
      end
    ) candidates
    where token is not null
  ),
  '{}'::text[]
)
where cardinality(p.invoice_tokens) = 0
  and ((p.data ? 'invoices') or (p.data ? 'invoice'));
create index if not exists sf_proposals_status_idx on public.sf_proposals(owner_id, status);

-- Keep the requested platform administrator protected.
update public.sf_accounts
set is_admin = true, active = true, updated_at = now()
where lower(email) = 'oyekunleolalekan3168@gmail.com';

-- Create or connect an app account whenever Supabase Auth creates a user.
create or replace function public.sf_handle_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_name text;
  resolved_business text;
begin
  resolved_name := coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1));
  resolved_business := coalesce(nullif(new.raw_user_meta_data ->> 'business_name', ''), nullif(new.raw_user_meta_data ->> 'businessName', ''), resolved_name || '''s business');

  insert into public.sf_accounts (
    id, auth_user_id, name, business_name, email, active, is_admin, last_sign_in_at, updated_at
  ) values (
    new.id::text,
    new.id,
    resolved_name,
    resolved_business,
    lower(new.email),
    true,
    lower(new.email) = 'oyekunleolalekan3168@gmail.com',
    new.last_sign_in_at,
    now()
  )
  on conflict (email) do update set
    auth_user_id = excluded.auth_user_id,
    name = excluded.name,
    business_name = case when public.sf_accounts.business_name = '' then excluded.business_name else public.sf_accounts.business_name end,
    is_admin = public.sf_accounts.is_admin or excluded.is_admin,
    active = case when excluded.is_admin then true else public.sf_accounts.active end,
    last_sign_in_at = excluded.last_sign_in_at,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists sf_on_auth_user_change on auth.users;
create trigger sf_on_auth_user_change
after insert on auth.users
for each row execute function public.sf_handle_auth_user();

-- Backfill accounts for Auth users that already exist.
insert into public.sf_accounts (id, auth_user_id, name, business_name, email, active, is_admin, last_sign_in_at)
select
  u.id::text,
  u.id,
  coalesce(nullif(u.raw_user_meta_data ->> 'name', ''), nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1)),
  coalesce(nullif(u.raw_user_meta_data ->> 'business_name', ''), nullif(u.raw_user_meta_data ->> 'businessName', ''), split_part(u.email, '@', 1) || '''s business'),
  lower(u.email),
  true,
  lower(u.email) = 'oyekunleolalekan3168@gmail.com',
  u.last_sign_in_at
from auth.users u
where u.email is not null
on conflict (email) do update set
  auth_user_id = excluded.auth_user_id,
  is_admin = public.sf_accounts.is_admin or excluded.is_admin,
  active = case when excluded.is_admin then true else public.sf_accounts.active end,
  last_sign_in_at = excluded.last_sign_in_at,
  updated_at = now();

alter table public.sf_accounts enable row level security;
alter table public.sf_workspaces enable row level security;
alter table public.sf_proposals enable row level security;

-- No browser policies are created. The browser receives only the anon key for Supabase Auth.
-- Application data remains behind service-role server routes that filter every owner request by owner_id.
notify pgrst, 'reload schema';
