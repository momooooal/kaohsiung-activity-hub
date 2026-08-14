-- ============================================================
-- 高雄運動活動總入口：Supabase 資料庫與權限設定
-- 請在 Supabase Dashboard > SQL Editor 執行一次。
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.allowed_editors (
  email text primary key,
  display_name text,
  department_id uuid references public.departments(id),
  role text not null default 'department_editor' check (role in ('department_editor','chief_editor','planning_editor')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  department_id uuid references public.departments(id),
  role text not null check (role in ('department_editor','chief_editor','planning_editor')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id),
  title text not null,
  summary text not null,
  category text not null default '其他' check (category in ('課程','賽事','體驗','宣導','其他')),
  start_date date not null,
  end_date date,
  location text,
  registration_url text,
  info_url text,
  image_url text,
  featured boolean not null default false,
  published boolean not null default false,
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_date_range check (end_date is null or end_date >= start_date)
);

create table if not exists public.activity_audit_log (
  id bigint generated always as identity primary key,
  activity_id uuid,
  activity_title text,
  department_id uuid references public.departments(id),
  actor_id uuid references auth.users(id),
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activities_start_date_idx on public.activities(start_date);
create index if not exists activities_department_idx on public.activities(department_id);
create index if not exists activities_published_idx on public.activities(published);

-- ---------- 安全 helper functions（避免 RLS 自我遞迴） ----------
create or replace function public.current_app_role()
returns text language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() and active = true $$;

create or replace function public.current_department_id()
returns uuid language sql stable security definer set search_path = public
as $$ select department_id from public.profiles where id = auth.uid() and active = true $$;

create or replace function public.is_global_editor()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.current_app_role() in ('chief_editor','planning_editor'), false) $$;

revoke all on function public.current_app_role() from public;
revoke all on function public.current_department_id() from public;
revoke all on function public.is_global_editor() from public;
grant execute on function public.current_app_role() to anon, authenticated;
grant execute on function public.current_department_id() to anon, authenticated;
grant execute on function public.is_global_editor() to anon, authenticated;

-- ---------- 新 Auth 使用者自動套用允許名單 ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id,email,display_name,department_id,role,active)
  select new.id, lower(new.email), ae.display_name, ae.department_id, ae.role, ae.active
  from public.allowed_editors ae
  where lower(ae.email)=lower(new.email)
  on conflict (id) do update set
    email=excluded.email, display_name=excluded.display_name, department_id=excluded.department_id,
    role=excluded.role, active=excluded.active, updated_at=now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert or update of email on auth.users
for each row execute function public.handle_new_user();

-- 若 Auth 使用者已先建立，可執行這段同步：
insert into public.profiles(id,email,display_name,department_id,role,active)
select u.id, lower(u.email), ae.display_name, ae.department_id, ae.role, ae.active
from auth.users u join public.allowed_editors ae on lower(ae.email)=lower(u.email)
on conflict (id) do update set display_name=excluded.display_name, department_id=excluded.department_id, role=excluded.role, active=excluded.active, updated_at=now();

-- ---------- updated_at ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
drop trigger if exists activities_touch on public.activities;
create trigger activities_touch before update on public.activities for each row execute function public.touch_updated_at();
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

-- ---------- Audit ----------
create or replace function public.log_activity_change()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if tg_op='INSERT' then
    insert into public.activity_audit_log(activity_id,activity_title,department_id,actor_id,action,new_data)
    values(new.id,new.title,new.department_id,auth.uid(),'INSERT',to_jsonb(new)); return new;
  elsif tg_op='UPDATE' then
    insert into public.activity_audit_log(activity_id,activity_title,department_id,actor_id,action,old_data,new_data)
    values(new.id,new.title,new.department_id,auth.uid(),'UPDATE',to_jsonb(old),to_jsonb(new)); return new;
  else
    insert into public.activity_audit_log(activity_id,activity_title,department_id,actor_id,action,old_data)
    values(old.id,old.title,old.department_id,auth.uid(),'DELETE',to_jsonb(old)); return old;
  end if;
end;
$$;
drop trigger if exists activity_audit_trigger on public.activities;
create trigger activity_audit_trigger after insert or update or delete on public.activities
for each row execute function public.log_activity_change();

-- ---------- RLS ----------
alter table public.departments enable row level security;
alter table public.allowed_editors enable row level security;
alter table public.profiles enable row level security;
alter table public.activities enable row level security;
alter table public.activity_audit_log enable row level security;

-- 科室清單可公開讀取（只有名稱等非敏感資訊）
drop policy if exists "departments public read" on public.departments;
create policy "departments public read" on public.departments for select using (active=true);

-- profiles：登入者只能讀自己；全域編輯者可讀全部（異動紀錄顯示名稱用）
drop policy if exists "profiles self or global read" on public.profiles;
create policy "profiles self or global read" on public.profiles for select to authenticated
using (id=auth.uid() or public.is_global_editor() or department_id=public.current_department_id());

-- allowed_editors：只讓全域編輯者查看（實務上可直接由 Supabase Dashboard 維護）
drop policy if exists "allowed editors global read" on public.allowed_editors;
create policy "allowed editors global read" on public.allowed_editors for select to authenticated
using (public.is_global_editor());

-- activities：未登入者只能看已發布；登入者可看已發布 + 自己科室草稿；全域可看全部
drop policy if exists "activities public and editor read" on public.activities;
create policy "activities public and editor read" on public.activities for select
using (
  published=true
  or (auth.uid() is not null and (public.is_global_editor() or department_id=public.current_department_id()))
);

-- 新增：科室小編只能新增自己的科室；總編／綜企可新增任何科室
drop policy if exists "activities editor insert" on public.activities;
create policy "activities editor insert" on public.activities for insert to authenticated
with check (
  public.current_app_role() is not null
  and (public.is_global_editor() or department_id=public.current_department_id())
  and created_by=auth.uid()
);

-- 修改／刪除：同樣以活動所屬科室判斷
drop policy if exists "activities editor update" on public.activities;
create policy "activities editor update" on public.activities for update to authenticated
using (public.is_global_editor() or department_id=public.current_department_id())
with check (public.is_global_editor() or department_id=public.current_department_id());

drop policy if exists "activities editor delete" on public.activities;
create policy "activities editor delete" on public.activities for delete to authenticated
using (public.is_global_editor() or department_id=public.current_department_id());

-- Audit：科室小編看自己科室；全域看全部
drop policy if exists "audit editor read" on public.activity_audit_log;
create policy "audit editor read" on public.activity_audit_log for select to authenticated
using (public.is_global_editor() or department_id=public.current_department_id());

-- ---------- 圖片 Storage ----------
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('activity-images','activity-images',true,10485760,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=10485760,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

-- 公開讀取活動圖片
drop policy if exists "activity images public read" on storage.objects;
create policy "activity images public read" on storage.objects for select using (bucket_id='activity-images');

-- 登入小編可在自己的 uid 資料夾上傳、修改、刪除圖片
-- 注意：活動資料本身仍由 activities RLS 嚴格限制科室權限。
drop policy if exists "activity images authenticated insert" on storage.objects;
create policy "activity images authenticated insert" on storage.objects for insert to authenticated
with check (bucket_id='activity-images' and (storage.foldername(name))[1]=auth.uid()::text and public.current_app_role() is not null);

drop policy if exists "activity images owner update" on storage.objects;
create policy "activity images owner update" on storage.objects for update to authenticated
using (bucket_id='activity-images' and owner_id=auth.uid()::text)
with check (bucket_id='activity-images' and owner_id=auth.uid()::text);

drop policy if exists "activity images owner delete" on storage.objects;
create policy "activity images owner delete" on storage.objects for delete to authenticated
using (bucket_id='activity-images' and owner_id=auth.uid()::text);

-- ---------- 範例科室（可自行改名／增刪） ----------
insert into public.departments(name,sort_order) values
('綜合企劃科',10),('全民運動科',20),('競技運動科',30)
on conflict (name) do nothing;

-- ============================================================
-- 允許小編帳號範例（請改成實際信箱，再執行）
-- 重要：先把信箱加入 allowed_editors，再到 Authentication > Users 建立使用者。
-- ============================================================
-- insert into public.allowed_editors(email,display_name,department_id,role)
-- select 'editor1@example.gov.tw','全民運動科小編',id,'department_editor' from public.departments where name='全民運動科';
--
-- insert into public.allowed_editors(email,display_name,department_id,role)
-- select 'chief@example.gov.tw','總編',id,'chief_editor' from public.departments where name='綜合企劃科';
--
-- insert into public.allowed_editors(email,display_name,department_id,role)
-- select 'planning@example.gov.tw','綜企科小編',id,'planning_editor' from public.departments where name='綜合企劃科';
