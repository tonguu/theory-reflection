-- V2 增量升级：在你原有三个数据表基础上运行；不要重新执行旧 database.sql。
create extension if not exists pgcrypto;
alter table public.activities add column if not exists study_month integer;
alter table public.activities add column if not exists notice_text text not null default '';
alter table public.activities add column if not exists material_title text not null default '';
alter table public.activities add column if not exists material_url text not null default '';
alter table public.activities add column if not exists deadline timestamptz;
alter table public.activities add column if not exists meeting_format text not null default '线上';
alter table public.submissions add column if not exists edit_token_hash text;
alter table public.submissions add column if not exists updated_at timestamptz not null default now();

create or replace function public.get_active_activity()
returns table(id uuid,topic text,college text,study_month integer,notice_text text,material_title text,material_url text,deadline timestamptz)
language sql stable security definer set search_path = '' as $$
select a.id,a.topic,a.college,a.study_month,a.notice_text,a.material_title,a.material_url,a.deadline
from public.activities a where a.is_active = true limit 1;
$$;
revoke all on function public.get_active_activity() from public;
grant execute on function public.get_active_activity() to anon,authenticated;

-- V2 提交，返回随机的私密恢复码（原有 submission_reflection 仍可用，但不会自动取得历史修改权限）
create or replace function public.submit_reflection_v2(p_activity_id uuid,p_name text,p_grade text,p_college text,p_content text)
returns table(submission_id uuid,edit_token text)
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_token text;
begin
 if not exists(select 1 from public.activities a where a.id=p_activity_id and a.is_active and (a.deadline is null or now() < a.deadline)) then
   raise exception '本次活动未开放或已过截止时间';
 end if;
 p_name:=trim(p_name);p_grade:=trim(p_grade);p_college:=trim(p_college);p_content:=trim(p_content);
 if char_length(p_name) not between 1 and 40 or p_grade !~ '^20[0-9]{2}$'
    or char_length(p_college) not between 1 and 80 or char_length(p_content) not between 100 and 3000 then
   raise exception '姓名、年级、学院或正文不符合要求';
 end if;
 v_token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.submissions(activity_id,name,grade,college,content,edit_token_hash)
 values(p_activity_id,p_name,p_grade,p_college,p_content,encode(extensions.digest(v_token,'sha256'),'hex')) returning id into v_id;
 return query select v_id,v_token;
exception when unique_violation then raise exception '该姓名和年级在本次活动已有投稿，请使用原恢复码修改或联系管理员';
end $$;
revoke all on function public.submit_reflection_v2(uuid,text,text,text,text) from public;
grant execute on function public.submit_reflection_v2(uuid,text,text,text,text) to anon,authenticated;

create or replace function public.get_my_reflection(p_token text)
returns table(id uuid,activity_id uuid,topic text,study_month integer,name text,grade text,college text,content text,approved boolean,created_at timestamptz,updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
 select s.id,s.activity_id,a.topic,a.study_month,s.name,s.grade,s.college,s.content,s.approved,s.created_at,s.updated_at
 from public.submissions s join public.activities a on a.id=s.activity_id
 where length(p_token)=64 and s.edit_token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
$$;
revoke all on function public.get_my_reflection(text) from public;
grant execute on function public.get_my_reflection(text) to anon,authenticated;

create or replace function public.update_my_reflection(p_token text,p_content text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_num integer;
begin
 p_content:=trim(p_content);
 if length(p_token)<>64 or char_length(p_content) not between 100 and 3000 then
  raise exception '恢复码无效或正文长度不符合要求';
 end if;
 update public.submissions s set content=p_content,approved=false,updated_at=now()
 from public.activities a
 where s.activity_id=a.id and s.edit_token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
 and a.is_active=true and (a.deadline is null or now()<a.deadline);
 get diagnostics v_num=row_count;
 if v_num<>1 then raise exception '恢复码无效、活动已关闭或已截止';end if;
 return true;
end $$;
revoke all on function public.update_my_reflection(text,text) from public;
grant execute on function public.update_my_reflection(text,text) to anon,authenticated;

-- 防止绕过 V2: 旧公开 RPC 不会提供可编辑历史，保留既有投稿。若确认新网页已生效，撤销旧提交接口权限。
revoke execute on function public.submit_reflection(uuid,text,text,text,text) from anon,authenticated;
-- 校验开启了 RLS
alter table public.activities enable row level security;
alter table public.submissions enable row level security;
