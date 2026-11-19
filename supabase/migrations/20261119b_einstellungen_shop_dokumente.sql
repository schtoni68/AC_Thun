-- v1.5: Einstellungen, Lebenslauf, Dokumente, Shop
-- 1) Einstellungen (Schlüssel/Wert)
create table if not exists public.settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);
alter table public.settings enable row level security;
create policy settings_read on public.settings for select to authenticated using (public.my_member_id() is not null);
create policy settings_admin on public.settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
insert into public.settings(key, value) values
  ('veto2_min_teilnahmen', '5'),
  ('veto_frist_tage', '14'),
  ('mail_reply_to', '"Andreas Popp <Andreas.Popp@martiag.ch>"'),
  ('shop_email', 'null'),
  ('qr_iban', 'null'), ('qr_name', '"Ambassador Club Thun"'), ('qr_strasse', 'null'), ('qr_plz', 'null'), ('qr_ort', '"Thun"')
on conflict (key) do nothing;

-- 2) Kandidaten: manuelle Teilnahmen, Lebenslauf
alter table public.members
  add column if not exists teilnahmen_extra int not null default 0,
  add column if not exists lebenslauf_path text;

create or replace function public.tg_members_guard() returns trigger
  language plpgsql security definer set search_path to 'public'
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.auth_user_id := old.auth_user_id;
    new.member_no := old.member_no;
    new.aktiv := old.aktiv;
    new.ehrenmitglied := old.ehrenmitglied;
    new.eintritt := old.eintritt;
    new.status := old.status;
    new.goetti_id := old.goetti_id;
    new.kandidat_seit := old.kandidat_seit;
    new.teilnahmen_extra := old.teilnahmen_extra;
    new.lebenslauf_path := old.lebenslauf_path;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- 3) Dokumente
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kategorie text not null default 'Diverses',
  path text not null unique,
  file_name text,
  mime text,
  size bigint,
  fuer_kandidaten boolean not null default false,
  uploaded_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.documents enable row level security;
create policy docs_read on public.documents for select to authenticated
  using (public.is_member() or (fuer_kandidaten and public.my_member_id() is not null));
create policy docs_admin on public.documents for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 4) Shop
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  beschreibung text,
  preis numeric(10,2) not null default 0,
  varianten text,
  bild_path text,
  aktiv boolean not null default true,
  sort int not null default 100,
  created_at timestamptz not null default now()
);
alter table public.products enable row level security;
create policy products_read on public.products for select to authenticated using (public.is_member());
create policy products_admin on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.orders (
  id bigint generated always as identity primary key,
  member_id uuid references public.members(id) on delete set null,
  items jsonb not null,
  total numeric(10,2) not null,
  status text not null default 'neu' check (status in ('neu','bezahlt','geliefert','storniert')),
  bemerkung text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.orders enable row level security;
create policy orders_read on public.orders for select to authenticated using (member_id = public.my_member_id() or public.is_admin());
create policy orders_admin on public.orders for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- Bestellungen entstehen nur über die Edge Function shop-order (Preise werden dort geprüft)

-- 5) Speicher (Storage)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('lebenslauf', 'lebenslauf', false, 10485760, array['application/pdf']),
  ('dokumente', 'dokumente', false, 26214400, null),
  ('shop', 'shop', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;

create policy "lebenslauf lesen" on storage.objects for select to authenticated using (bucket_id = 'lebenslauf' and (public.is_member() or public.is_admin()));
create policy "lebenslauf admin" on storage.objects for all to authenticated using (bucket_id = 'lebenslauf' and public.is_admin()) with check (bucket_id = 'lebenslauf' and public.is_admin());
create policy "dokumente lesen" on storage.objects for select to authenticated using (bucket_id = 'dokumente' and (public.is_admin()
  or exists (select 1 from public.documents d where d.path = storage.objects.name and (public.is_member() or (d.fuer_kandidaten and public.my_member_id() is not null)))));
create policy "dokumente admin" on storage.objects for all to authenticated using (bucket_id = 'dokumente' and public.is_admin()) with check (bucket_id = 'dokumente' and public.is_admin());
create policy "shop admin" on storage.objects for all to authenticated using (bucket_id = 'shop' and public.is_admin()) with check (bucket_id = 'shop' and public.is_admin());
