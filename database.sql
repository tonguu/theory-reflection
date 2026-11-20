-- 在 Supabase SQL Editor 一次执行。只有授权管理员能读取投稿与导出所需数据。
create extension if not exists pgcrypto;
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.admin_users where user_id = (select auth.uid()));
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.limit_admins() returns trigger language plpgsql set search_path = '' as $$
begin
 if (select count(*) from public.admin_users) >= 6 then
   raise exception '最多只能设置6位管理员';
 end if;
 return new;
end $$;
drop trigger if exists admin_limit on public.admin_users;
create trigger admin_limit before insert on public.admin_users for each row execute function public.limit_admins();

create table if not exists public.activities (
 id uuid primary key default gen_random_uuid(),
 topic text not null check (char_length(topic) between 1 and 120),
 college text not null default '电子与信息学院',
 activity_date text not null default '',
 location text not null default '',
 organizer text not null default '',
 overview text not null default '',
 attendees integer not null default 0 check(attendees >= 0),
 tweet text not null default '否',
 tweet_url text not null default '',
 is_active boolean not null default false,
 created_at timestamptz not null default now()
);
create unique index if not exists only_one_active_activity on public.activities(is_active) where is_active;
create table if not exists public.submissions (
 id uuid primary key default gen_random_uuid(),
 activity_id uuid not null references public.activities(id) on delete cascade,
 name text not null check(char_length(name) between 1 and 40),
 grade text not null check(char_length(grade) between 2 and 10),
 college text not null check(char_length(college) between 1 and 80),
 content text not null check(char_length(content) between 100 and 3000),
 approved boolean not null default false,
 created_at timestamptz not null default now(),
 unique(activity_id, name, grade)
);
create index if not exists submissions_activity_idx on public.submissions(activity_id, created_at);

alter table public.admin_users enable row level security;
alter table public.activities enable row level security;
alter table public.submissions enable row level security;
-- 不给普通访客 SELECT 权限，也不给普通已注册用户投稿读取权限。
revoke all on public.admin_users, public.activities, public.submissions from anon, authenticated;
grant select on public.admin_users to authenticated;
grant select, insert, update, delete on public.activities, public.submissions to authenticated;

drop policy if exists admin_identity on public.admin_users;
create policy admin_identity on public.admin_users for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists activities_admin on public.activities;
create policy activities_admin on public.activities for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists submissions_admin on public.submissions;
create policy submissions_admin on public.submissions for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- 无需登录的公开表单：只能看到当前活动的标题和学院，不会暴露姓名和心得。
create or replace function public.get_active_activity()
returns table (id uuid, topic text, college text)
language sql stable security definer set search_path = '' as $$
 select a.id, a.topic, a.college from public.activities a where a.is_active = true limit 1;
$$;
revoke all on function public.get_active_activity() from public;
grant execute on function public.get_active_activity() to anon, authenticated;

-- 公开投稿写入专用 RPC（不能自行设置 approved / 查看全部投稿）
create or replace function public.submit_reflection(p_activity_id uuid, p_name text, p_grade text, p_college text, p_content text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
 if not exists(select 1 from public.activities a where a.id = p_activity_id and a.is_active = true) then
   raise exception '该活动未开放投稿';
 end if;
 p_name := trim(p_name); p_grade := trim(p_grade); p_college := trim(p_college); p_content := trim(p_content);
 if char_length(p_name) not between 1 and 40 or char_length(p_grade) not between 2 and 10
 or char_length(p_college) not between 1 and 80 or char_length(p_content) not between 100 and 3000 then
   raise exception '请检查姓名、年级、学院和心得字数';
 end if;
 insert into public.submissions(activity_id,name,grade,college,content)
 values(p_activity_id,p_name,p_grade,p_college,p_content)
 returning id into new_id;
 return new_id;
exception when unique_violation then
 raise exception '该活动已存在相同姓名和年级的投稿，请联系管理员修改';
end $$;
revoke all on function public.submit_reflection(uuid,text,text,text,text) from public;
grant execute on function public.submit_reflection(uuid,text,text,text,text) to anon, authenticated;

-- 创建第一场活动（此 SQL 执行一次；之后管理员可从网页新增活动）
insert into public.activities (topic, college, is_active, organizer)
select '本月理论学习', '电子与信息学院', true, '华南理工大学电子与信息学院研究生会'
where not exists(select 1 from public.activities);

-- 账号创建步骤：Supabase → Authentication → Users → Add user，创建 6 个邮箱密码账号。
-- 分别复制 6 个用户 UUID 后执行以下语句（把占位 UUID 替换为真实 UUID）：
-- insert into public.admin_users(user_id) values
-- ('第1位管理员UUID'),('第2位管理员UUID'),('第3位管理员UUID'),
-- ('第4位管理员UUID'),('第5位管理员UUID'),('第6位管理员UUID');
-- 请勿把管理员密码、service_role 密钥或 JWT secret 上传 GitHub。
