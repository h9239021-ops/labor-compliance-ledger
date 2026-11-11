-- =====================================================================
-- 근로감독 대시보드 — schema, permissions (RLS), functions, storage
-- Run once in the Supabase SQL Editor of the dashboard project.
-- Permission levels: none < read < write < edit < manage
-- Menus: admin, manual, response, library, ledger_findings, ledger_rounds, ledger_selfcheck
-- =====================================================================

-- ---------- helpers ----------
create or replace function public.lvl_rank(l text) returns int
language sql immutable as $$
  select case coalesce(l,'none') when 'read' then 1 when 'write' then 2 when 'edit' then 3 when 'manage' then 4 else 0 end
$$;

create or replace function public.my_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt()->>'email','')) $$;

-- ---------- users & permissions ----------
create table if not exists public.user_permissions (
  email text primary key,
  name text,
  team text,
  perms jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_permissions enable row level security;

create or replace function public.perm_level(menu text) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(max(greatest(
           case when lvl_rank(u.perms->>'admin') >= 4 then 4 else 0 end,
           lvl_rank(u.perms->>menu))), 0)
  from user_permissions u where lower(u.email) = my_email()
$$;

create or replace function public.has_perm(menu text, need text) returns boolean
language sql stable security definer set search_path = public as $$
  select perm_level(menu) >= lvl_rank(need) and lvl_rank(need) > 0
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from user_permissions u where lower(u.email) = my_email())
$$;

drop policy if exists up_select on public.user_permissions;
create policy up_select on public.user_permissions for select to authenticated
  using (lower(email) = my_email() or has_perm('admin','manage') or has_perm('response','read'));
drop policy if exists up_write on public.user_permissions;
create policy up_write on public.user_permissions for all to authenticated
  using (has_perm('admin','manage')) with check (has_perm('admin','manage'));

-- ---------- audit log ----------
create table if not exists public.audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  email text not null default my_email(),
  menu text,
  action text,
  detail text
);
alter table public.audit_log enable row level security;
drop policy if exists al_insert on public.audit_log;
create policy al_insert on public.audit_log for insert to authenticated
  with check (is_member() and lower(email) = my_email());
drop policy if exists al_select on public.audit_log;
create policy al_select on public.audit_log for select to authenticated
  using (has_perm('admin','manage'));

-- ---------- ledger data (one row per section) ----------
create table if not exists public.app_state (
  id text primary key,          -- findings | rounds | selfcheck | settings
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.app_state enable row level security;

create or replace function public.ledger_menu(sec text) returns text
language sql immutable as $$
  select case sec when 'findings' then 'ledger_findings' when 'rounds' then 'ledger_rounds'
                  when 'selfcheck' then 'ledger_selfcheck' else 'admin' end
$$;

drop policy if exists as_select on public.app_state;
create policy as_select on public.app_state for select to authenticated
  using (case when id = 'settings' then is_member() else has_perm(ledger_menu(id),'read') end);
drop policy if exists as_insert on public.app_state;
create policy as_insert on public.app_state for insert to authenticated
  with check (has_perm(ledger_menu(id),'write'));
drop policy if exists as_update on public.app_state;
create policy as_update on public.app_state for update to authenticated
  using (has_perm(ledger_menu(id),'write')) with check (has_perm(ledger_menu(id),'write'));

insert into public.app_state(id, data) values
  ('findings',  '{"inspections":[]}'),
  ('rounds',    '{"inspectionRounds":[],"materials":[]}'),
  ('selfcheck', '{"selfCheckRounds":[],"selfCheckTemplate":{},"legalAlerts":[],"legalWatchlist":[],"lawReview":{"reviewedDate":"","reviewedBy":""}}'),
  ('settings',  '{"meta":{"title":"근로감독 대시보드","orgName":"","defaultRepeatWindowYears":3,"selfCheckIntervalMonths":6},"categories":[],"guideChecklistChecked":{}}')
on conflict (id) do nothing;

-- ---------- manual ----------
create table if not exists public.manual_pages (
  id text primary key,
  grp text not null,
  grp_sort int not null default 0,
  sort int not null default 0,
  title text not null,
  lead text,
  body_html text,
  refs text[] not null default '{}',
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.manual_pages enable row level security;
drop policy if exists mp_select on public.manual_pages;
create policy mp_select on public.manual_pages for select to authenticated using (has_perm('manual','read'));
drop policy if exists mp_update on public.manual_pages;
create policy mp_update on public.manual_pages for update to authenticated
  using (has_perm('manual','edit')) with check (has_perm('manual','edit'));
drop policy if exists mp_insert on public.manual_pages;
create policy mp_insert on public.manual_pages for insert to authenticated with check (has_perm('manual','manage'));
drop policy if exists mp_delete on public.manual_pages;
create policy mp_delete on public.manual_pages for delete to authenticated using (has_perm('manual','manage'));

-- ---------- library (참고자료) ----------
create table if not exists public.library_items (
  id uuid primary key default gen_random_uuid(),
  no text,
  title text not null,
  file_name text,
  storage_path text,
  url text,
  size bigint,
  min_level text not null default 'read',
  sort int not null default 0,
  note text,
  uploaded_by text default my_email(),
  uploaded_at timestamptz not null default now()
);
alter table public.library_items enable row level security;
drop policy if exists li_select on public.library_items;
create policy li_select on public.library_items for select to authenticated
  using (perm_level('library') >= greatest(1, lvl_rank(min_level)));
drop policy if exists li_insert on public.library_items;
create policy li_insert on public.library_items for insert to authenticated with check (has_perm('library','write'));
drop policy if exists li_update on public.library_items;
create policy li_update on public.library_items for update to authenticated
  using (has_perm('library','edit')) with check (has_perm('library','edit'));
drop policy if exists li_delete on public.library_items;
create policy li_delete on public.library_items for delete to authenticated using (has_perm('library','edit'));

-- ---------- response (감독 대응: 자료 취합) ----------
create table if not exists public.collect_templates (
  id serial primary key,
  sort int not null,
  no text,
  category text,
  title text not null,
  period text,
  form text,
  owner_team text,
  ledger_kind text not null default '제출자료'
);
alter table public.collect_templates enable row level security;
drop policy if exists ct_select on public.collect_templates;
create policy ct_select on public.collect_templates for select to authenticated using (has_perm('response','read'));
drop policy if exists ct_write on public.collect_templates;
create policy ct_write on public.collect_templates for all to authenticated
  using (has_perm('response','manage')) with check (has_perm('response','manage'));

create table if not exists public.inspections_live (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  title text not null,
  type text,
  notice_date date,
  visit_date date,
  agency text,
  status text not null default '준비중',
  ledger_round_id text,
  checklist jsonb not null default '{}'::jsonb,
  note text,
  created_by text default my_email(),
  created_at timestamptz not null default now()
);
alter table public.inspections_live enable row level security;
drop policy if exists il_select on public.inspections_live;
create policy il_select on public.inspections_live for select to authenticated using (has_perm('response','read'));
drop policy if exists il_update on public.inspections_live;
create policy il_update on public.inspections_live for update to authenticated
  using (has_perm('response','edit')) with check (has_perm('response','edit'));
drop policy if exists il_delete on public.inspections_live;
create policy il_delete on public.inspections_live for delete to authenticated using (has_perm('response','manage'));

create table if not exists public.collect_items (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections_live(id) on delete cascade,
  sort int not null default 0,
  no text,
  category text,
  title text not null,
  period text,
  form text,
  owner_team text,
  assignee_email text,
  due_date date,
  status text not null default '요청',     -- 요청 | 제출 | 반려 | 최종확정
  ledger_kind text not null default '제출자료',
  note text,
  reject_reason text,
  updated_at timestamptz not null default now()
);
alter table public.collect_items enable row level security;
drop policy if exists ci_select on public.collect_items;
create policy ci_select on public.collect_items for select to authenticated using (has_perm('response','read'));
drop policy if exists ci_write on public.collect_items;
create policy ci_write on public.collect_items for all to authenticated
  using (has_perm('response','edit')) with check (has_perm('response','edit'));

create table if not exists public.collect_files (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.collect_items(id) on delete cascade,
  version int not null default 1,
  storage_path text not null,
  file_name text not null,
  size bigint,
  content_type text,
  comment text,
  is_final boolean not null default false,
  uploaded_by text not null default my_email(),
  uploaded_at timestamptz not null default now()
);
alter table public.collect_files enable row level security;
drop policy if exists cf_select on public.collect_files;
create policy cf_select on public.collect_files for select to authenticated using (has_perm('response','read'));
drop policy if exists cf_delete on public.collect_files;
create policy cf_delete on public.collect_files for delete to authenticated using (has_perm('response','edit'));

-- create an inspection: items from templates + auto ledger round ("OO년 근로감독")
create or replace function public.create_inspection(p_year int, p_type text, p_notice date, p_visit date, p_agency text, p_title text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_title text; v_round_id text; v_round jsonb;
begin
  if not has_perm('response','manage') then raise exception '권한이 없습니다 (감독 대응: 관리 권한 필요)'; end if;
  v_title := coalesce(nullif(p_title,''), p_year::text || '년 근로감독');
  insert into inspections_live(year, title, type, notice_date, visit_date, agency)
    values (p_year, v_title, p_type, p_notice, p_visit, p_agency) returning id into v_id;
  insert into collect_items(inspection_id, sort, no, category, title, period, form, owner_team, ledger_kind, due_date)
    select v_id, t.sort, t.no, t.category, t.title, t.period, t.form, t.owner_team, t.ledger_kind,
           case when p_visit is not null and t.ledger_kind = '제출자료' then p_visit - 2 else null end
    from collect_templates t order by t.sort;
  v_round_id := 'live_' || replace(v_id::text,'-','');
  v_round := jsonb_build_object(
    'id', v_round_id, 'label', v_title, 'date', coalesce(p_visit, p_notice, current_date)::text,
    'type', coalesce(p_type,''), 'agency', coalesce(p_agency,''), 'target', '', 'department', 'HRM팀 노무관리파트',
    'notes', '감독 대응(자료 취합)에서 자동 생성된 감독 시기입니다.', 'materials', '[]'::jsonb, 'attachments', '[]'::jsonb,
    'liveInspectionId', v_id::text, 'createdAt', now());
  insert into app_state(id, data) values ('rounds', jsonb_build_object('inspectionRounds', jsonb_build_array(v_round)))
  on conflict (id) do update set
    data = jsonb_set(app_state.data, '{inspectionRounds}', coalesce(app_state.data->'inspectionRounds','[]'::jsonb) || jsonb_build_array(v_round)),
    updated_at = now(), updated_by = my_email();
  update inspections_live set ledger_round_id = v_round_id where id = v_id;
  insert into audit_log(menu, action, detail) values ('response','create_inspection', v_title);
  return v_id;
end $$;

-- submit a file version for an item (assignee with write, or edit+)
create or replace function public.submit_file(p_item uuid, p_path text, p_name text, p_size bigint, p_type text, p_comment text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_item collect_items; v_ver int; v_id uuid;
begin
  select * into v_item from collect_items where id = p_item;
  if not found then raise exception '항목이 없습니다'; end if;
  if not (has_perm('response','edit') or (has_perm('response','write') and lower(coalesce(v_item.assignee_email,'')) = my_email())) then
    raise exception '이 항목에 업로드할 권한이 없습니다 (담당자로 배정되어야 합니다)';
  end if;
  select coalesce(max(version),0)+1 into v_ver from collect_files where item_id = p_item;
  insert into collect_files(item_id, version, storage_path, file_name, size, content_type, comment)
    values (p_item, v_ver, p_path, p_name, p_size, p_type, p_comment) returning id into v_id;
  update collect_items set status = case when status = '최종확정' then '최종확정' else '제출' end, reject_reason = null, updated_at = now() where id = p_item;
  return v_id;
end $$;

create or replace function public.finalize_file(p_file uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_item uuid; v_name text;
begin
  if not has_perm('response','manage') then raise exception '최종본 확정은 관리 권한이 필요합니다'; end if;
  select item_id, file_name into v_item, v_name from collect_files where id = p_file;
  if v_item is null then raise exception '파일이 없습니다'; end if;
  update collect_files set is_final = (id = p_file) where item_id = v_item;
  update collect_items set status = '최종확정', reject_reason = null, updated_at = now() where id = v_item;
  insert into audit_log(menu, action, detail) values ('response','finalize', v_name);
end $$;

create or replace function public.reject_item(p_item uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_perm('response','manage') then raise exception '반려는 관리 권한이 필요합니다'; end if;
  update collect_files set is_final = false where item_id = p_item;
  update collect_items set status = '반려', reject_reason = p_reason, updated_at = now() where id = p_item;
  insert into audit_log(menu, action, detail) values ('response','reject', p_reason);
end $$;

create or replace function public.set_check(p_insp uuid, p_key text, p_val boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_perm('response','write') then raise exception '체크 권한이 없습니다'; end if;
  update inspections_live set checklist = jsonb_set(checklist, array[p_key], to_jsonb(p_val)) where id = p_insp;
end $$;

-- assignees may update only the comment/note of their own item via this function
create or replace function public.set_item_note(p_item uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_item collect_items;
begin
  select * into v_item from collect_items where id = p_item;
  if not (has_perm('response','edit') or (has_perm('response','write') and lower(coalesce(v_item.assignee_email,'')) = my_email())) then
    raise exception '권한이 없습니다'; end if;
  update collect_items set note = p_note, updated_at = now() where id = p_item;
end $$;

revoke all on function public.create_inspection(int,text,date,date,text,text) from anon;
revoke all on function public.submit_file(uuid,text,text,bigint,text,text) from anon;
revoke all on function public.finalize_file(uuid) from anon;
revoke all on function public.reject_item(uuid,text) from anon;
revoke all on function public.set_check(uuid,text,boolean) from anon;
revoke all on function public.set_item_note(uuid,text) from anon;

-- ---------- default collection template (공식 요청서류 + 추가 요청 예상 + 감독 후 문서) ----------
insert into public.collect_templates(sort, no, category, title, period, form, owner_team, ledger_kind)
select * from (values
 (1,'1','공식 요청서류','조직도 (부서별 인원 명기)','현행','파일','HRBP팀','제출자료'),
 (2,'2','공식 요청서류','직원현황 (성별, 정규·계약·파견 구분)','현행','출력+파일','HRBP팀','제출자료'),
 (3,'3','공식 요청서류','임금대장','최근 1년','파일','HRM팀','제출자료'),
 (4,'4','공식 요청서류','근로(연봉)계약서 (고용형태·직급·성별 표본)','현행','출력','HRBP팀','제출자료'),
 (5,'5','공식 요청서류','임금명세서 및 교부내역 (계산방법 기재 확인)','표본','파일','HRM팀','제출자료'),
 (6,'6','공식 요청서류','성희롱 예방교육 자료·참석자 명단','최근 3년','출력+파일','HRM팀 노무관리파트','제출자료'),
 (7,'7','공식 요청서류','개인별 연차 부여·사용 내역, 연차수당 지급내역, 부여 기준','최근 3년','출력+파일','HRM팀','제출자료'),
 (8,'8','공식 요청서류','연장·야간·휴일근로 내역 (근태대장)','최근 1년','파일','HRM팀','제출자료'),
 (9,'9','공식 요청서류','연장·야간·휴일근로수당 산정·지급내역','최근 1년','파일','HRM팀','제출자료'),
 (10,'10','공식 요청서류','퇴직자 명단 및 퇴직금 산정내역','안내문 기준','출력+파일','HRM팀','제출자료'),
 (11,'11','공식 요청서류','육아휴직·출산(유·사산)휴가자 명단','안내문 기준','출력','HRM팀','제출자료'),
 (12,'12','공식 요청서류','취업규칙 및 내부규정 (인사·급여·복리·유연근무 지침)','현행','출력','HRM팀 노무관리파트','제출자료'),
 (13,'13','공식 요청서류','고충처리(사내 신고) 내역','안내문 기준','출력','HRM팀 노무관리파트','제출자료'),
 (14,'14','공식 요청서류','단체협약·임금협약','해당 시','-','HRM팀 노무관리파트','제출자료'),
 (21,'A-1','추가 요청 예상','임신근로자·임신기·육아기 단축자(단축 전후 근로시간)·배우자출산휴가자 명단','최근 1년','파일','HRM팀','제출자료'),
 (22,'A-2','추가 요청 예상','파견근로자 명단(입·퇴사), 기간제·단시간·일용직 명단, 파견계약서·허가증','최근 1년','파일','HRBP팀','제출자료'),
 (23,'A-3','추가 요청 예상','일별·월별 근태 원데이터','최근 1년','파일','HRM팀','제출자료'),
 (24,'A-4','추가 요청 예상','보상휴가 부여·사용 내역','최근 1년','파일','HRM팀','제출자료'),
 (25,'A-5','추가 요청 예상','근무형태별 근무시간 (선택근로·고정·단시간)','현행','파일','HRBP팀','제출자료'),
 (26,'A-6','추가 요청 예상','서면합의서 원본 (보상휴가·선택적근로시간제·간주근로시간제)','현행','출력(원본)','HRM팀 노무관리파트','제출자료'),
 (27,'A-7','추가 요청 예상','노사협의회 규정·근로자위원 선출·회의록, 고충처리위원 선임','최근 1년','출력+파일','HRM팀 노무관리파트','제출자료'),
 (28,'A-8','추가 요청 예상','복리후생 제도와 고용형태별 적용 범위','현행','파일','HRM팀','제출자료'),
 (29,'A-9','추가 요청 예상','채용공고, 채용서류 반환·파기 절차','현행','파일','채용팀','제출자료'),
 (41,'P-1','감독 후 문서','현장조사 지령서','수령 즉시','파일','HRM팀 노무관리파트','기타'),
 (42,'P-2','감독 후 문서','확인서','감독 당일','파일','HRM팀 노무관리파트','기타'),
 (43,'P-3','감독 후 문서','시정지시서 / 시정명령서','수령 즉시','파일','HRM팀 노무관리파트','시정지시서/명령서'),
 (44,'P-4','감독 후 문서','시정 이행보고서·증빙 (지급 명세, 게시 사진)','시정기한 내','파일','HRM팀 노무관리파트','보고자료(노동부)'),
 (45,'P-5','감독 후 문서','경영진 사전보고·결과보고','보고 직후','파일','HRM팀 노무관리파트','보고자료(내부용)')
) v(sort,no,category,title,period,form,owner_team,ledger_kind)
where not exists (select 1 from public.collect_templates);

-- ---------- storage ----------
insert into storage.buckets(id, name, public) values ('dashboard-files','dashboard-files', false)
on conflict (id) do nothing;

drop policy if exists df_select on storage.objects;
create policy df_select on storage.objects for select to authenticated using (
  bucket_id = 'dashboard-files' and (
    (split_part(name,'/',1) in ('attachments','ledger') and (has_perm('ledger_findings','read') or has_perm('ledger_rounds','read') or has_perm('ledger_selfcheck','read')))
    or (split_part(name,'/',1) = 'response' and has_perm('response','read'))
    or (split_part(name,'/',1) = 'manual' and has_perm('manual','read'))
    or (split_part(name,'/',1) = 'library' and exists (
          select 1 from public.library_items li where li.storage_path = storage.objects.name
            and public.perm_level('library') >= greatest(1, public.lvl_rank(li.min_level))))
  ));
drop policy if exists df_insert on storage.objects;
create policy df_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'dashboard-files' and (
    (split_part(name,'/',1) in ('attachments','ledger') and (has_perm('ledger_findings','write') or has_perm('ledger_rounds','write') or has_perm('ledger_selfcheck','write')))
    or (split_part(name,'/',1) = 'response' and has_perm('response','write'))
    or (split_part(name,'/',1) = 'manual' and has_perm('manual','edit'))
    or (split_part(name,'/',1) = 'library' and has_perm('library','write'))
  ));
drop policy if exists df_delete on storage.objects;
create policy df_delete on storage.objects for delete to authenticated using (
  bucket_id = 'dashboard-files' and (
    (split_part(name,'/',1) in ('attachments','ledger') and (has_perm('ledger_findings','edit') or has_perm('ledger_rounds','edit') or has_perm('ledger_selfcheck','edit')))
    or (split_part(name,'/',1) = 'response' and has_perm('response','edit'))
    or (split_part(name,'/',1) = 'manual' and has_perm('manual','edit'))
    or (split_part(name,'/',1) = 'library' and has_perm('library','edit'))
  ));

-- ---------- realtime ----------
do $$ begin
  begin alter publication supabase_realtime add table public.app_state; exception when others then null; end;
  begin alter publication supabase_realtime add table public.collect_items; exception when others then null; end;
  begin alter publication supabase_realtime add table public.collect_files; exception when others then null; end;
  begin alter publication supabase_realtime add table public.inspections_live; exception when others then null; end;
end $$;

-- ---------- first administrator (replace the email with your own before running) ----------
insert into public.user_permissions(email, name, team, perms) values
 ('admin@example.com', '관리자', 'HRM팀 노무관리파트',
  '{"admin":"manage","manual":"manage","response":"manage","library":"manage","ledger_findings":"manage","ledger_rounds":"manage","ledger_selfcheck":"manage"}')
on conflict (email) do nothing;
