-- v1.4: Kandidaten, Veto-Verfahren, Abwesenheiten
-- 1) Mitglieder: Status Kandidat / Mitglied, Götti
alter table public.members
  add column if not exists status text not null default 'mitglied' check (status in ('mitglied','kandidat')),
  add column if not exists goetti_id uuid references public.members(id) on delete set null,
  add column if not exists kandidat_seit date;

-- 2) Hilfsfunktionen
create or replace function public.is_member() returns boolean
  language sql stable security definer set search_path to 'public'
as $$ select exists(select 1 from public.members where auth_user_id = auth.uid() and aktiv and status = 'mitglied') $$;

create or replace function public.my_goetti_id() returns uuid
  language sql stable security definer set search_path to 'public'
as $$ select goetti_id from public.members where auth_user_id = auth.uid() and aktiv limit 1 $$;

-- Nicht-Admins dürfen Status/Götti nicht selbst ändern
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
  end if;
  new.updated_at := now();
  return new;
end $$;

-- 3) Abwesenheiten
create table if not exists public.absences (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  von date not null,
  bis date not null,
  grund text not null default 'Ferien',
  notiz text,
  created_at timestamptz not null default now(),
  check (bis >= von)
);
create index if not exists absences_member_idx on public.absences(member_id, bis);
alter table public.absences enable row level security;

-- 4) Veto-Verfahren
create table if not exists public.veto_rounds (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.members(id) on delete cascade,
  stufe int not null check (stufe in (1,2)),
  started_at timestamptz not null default now(),
  deadline timestamptz not null,
  status text not null default 'offen' check (status in ('offen','bestanden','abgelehnt','abgebrochen')),
  closed_at timestamptz,
  started_by uuid references public.members(id) on delete set null,
  note text
);
create index if not exists veto_rounds_cand_idx on public.veto_rounds(candidate_id);
alter table public.veto_rounds enable row level security;

create table if not exists public.veto_votes (
  round_id uuid not null references public.veto_rounds(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key (round_id, member_id)
);
alter table public.veto_votes enable row level security;

-- Veto 2 braucht eine Begründung, Abgabe nur solange die Runde offen ist
create or replace function public.tg_veto_vote_check() returns trigger
  language plpgsql security definer set search_path to 'public'
as $$
declare r public.veto_rounds;
begin
  select * into r from public.veto_rounds where id = new.round_id;
  if r.status <> 'offen' or r.deadline < now() then raise exception 'Das Veto-Verfahren ist abgeschlossen.'; end if;
  if r.candidate_id = new.member_id then raise exception 'nicht erlaubt'; end if;
  if r.stufe = 2 and coalesce(trim(new.reason), '') = '' then raise exception 'Bei Veto 2 ist eine Begründung nötig.'; end if;
  return new;
end $$;
drop trigger if exists veto_vote_check on public.veto_votes;
create trigger veto_vote_check before insert or update on public.veto_votes for each row execute function public.tg_veto_vote_check();

-- 5) Versandprotokoll: Betreff
alter table public.mail_log add column if not exists subject text;

-- 6) RLS: Kandidaten sehen nur sich selbst, ihren Götti und das Programm
drop policy if exists members_read on public.members;
create policy members_read on public.members for select to authenticated
  using (public.is_member() or id = public.my_member_id() or id = public.my_goetti_id());

drop policy if exists admins_read on public.admins;
create policy admins_read on public.admins for select to authenticated using (public.is_member());
drop policy if exists roles_read on public.board_roles;
create policy roles_read on public.board_roles for select to authenticated using (public.is_member());
drop policy if exists terms_read on public.board_terms;
create policy terms_read on public.board_terms for select to authenticated using (public.is_member());

drop policy if exists reg_read on public.registrations;
create policy reg_read on public.registrations for select to authenticated
  using (public.is_member() or member_id = public.my_member_id());
drop policy if exists reg_own_ins on public.registrations;
create policy reg_own_ins on public.registrations for insert to authenticated
  with check (public.is_admin() or (member_id = public.my_member_id() and (public.is_member()
    or exists (select 1 from public.events e where e.id = event_id and e.title !~* '^(Regio|National|International):'))));

create policy abs_read on public.absences for select to authenticated using (public.is_member() or member_id = public.my_member_id());
create policy abs_write on public.absences for all to authenticated
  using (member_id = public.my_member_id() or public.is_admin())
  with check (member_id = public.my_member_id() or public.is_admin());

create policy vr_read on public.veto_rounds for select to authenticated using (public.is_member());
create policy vr_admin on public.veto_rounds for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy vv_read on public.veto_votes for select to authenticated using (member_id = public.my_member_id() or public.is_admin());
create policy vv_ins on public.veto_votes for insert to authenticated with check (member_id = public.my_member_id() and public.is_member());
create policy vv_upd on public.veto_votes for update to authenticated using (member_id = public.my_member_id()) with check (member_id = public.my_member_id());
create policy vv_del on public.veto_votes for delete to authenticated using (public.is_admin() or (member_id = public.my_member_id()
  and exists (select 1 from public.veto_rounds r where r.id = round_id and r.status = 'offen' and r.deadline > now())));
create policy vv_admin on public.veto_votes for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 7) Rechte: Hilfsfunktionen nicht für anonyme Aufrufe
revoke execute on function public.is_member() from anon, public;
revoke execute on function public.my_goetti_id() from anon, public;
revoke execute on function public.tg_veto_vote_check() from anon, authenticated, public;
grant execute on function public.is_member() to authenticated;
grant execute on function public.my_goetti_id() to authenticated;
