-- ScopeFlow Neon schema
-- Server-only database access. Safe to run repeatedly.

create extension if not exists pgcrypto;

create table if not exists public.sf_accounts (
  id text primary key default gen_random_uuid()::text,
  auth_user_id text unique,
  name text not null,
  business_name text not null default '',
  email text unique not null,
  active boolean not null default true,
  is_admin boolean not null default false,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
create index if not exists sf_proposals_token_idx on public.sf_proposals(public_token);
create index if not exists sf_proposals_invoice_tokens_idx on public.sf_proposals using gin(invoice_tokens);
create index if not exists sf_proposals_status_idx on public.sf_proposals(owner_id, status);

create table if not exists public.sf_migration_meta (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.sf_migration_meta(key,value)
values ('schema_version','{"source":"scopeflow","target":"neon","version":2,"auth":"neon"}'::jsonb)
on conflict (key) do update set value=excluded.value, updated_at=now();

update public.sf_accounts
set is_admin=true, active=true, updated_at=now()
where lower(email)='oyekunleolalekan3168@gmail.com';
