-- TEST ONLY. Execute in your own Supabase project's SQL Editor.
-- Requires Supabase Auth email accounts. Do not use real client data until security testing is complete.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'staff' check (role in ('admin','staff'))
);
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('7501','DO','ISF','装箱单')),
  assignee uuid references public.profiles(id),
  container_no text not null default '',
  bill_no text not null default '',
  mail_subject text not null default '',
  status text not null default '待分配' check(status in ('待分配','待处理','处理中','待补资料','待复核','已回复')),
  notes text not null default '',
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create or replace function public.register_profile() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles (id,display_name,role) values (new.id,coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),'staff');
  return new;
end;$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.register_profile();
-- Backfill existing Auth users as staff; admin elevation is performed only by SQL editor owner.
insert into public.profiles(id,display_name,role)
select id,split_part(email,'@',1),'staff' from auth.users on conflict (id) do nothing;
create or replace function public.is_task_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin');
$$;
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
revoke all on public.profiles from anon,authenticated;
revoke all on public.tasks from anon,authenticated;
grant select on public.profiles to authenticated;
grant select,insert,update,delete on public.tasks to authenticated;
drop policy if exists "profiles_self_or_admin_read" on public.profiles;
create policy "profiles_self_or_admin_read" on public.profiles for select to authenticated
 using (id=(select auth.uid()) or (select public.is_task_admin()));
drop policy if exists "task_read_admin_or_assignee" on public.tasks;
create policy "task_read_admin_or_assignee" on public.tasks for select to authenticated
 using ((select public.is_task_admin()) or assignee=(select auth.uid()));
drop policy if exists "task_admin_insert" on public.tasks;
create policy "task_admin_insert" on public.tasks for insert to authenticated
 with check ((select public.is_task_admin()));
drop policy if exists "task_admin_update" on public.tasks;
create policy "task_admin_update" on public.tasks for update to authenticated
 using ((select public.is_task_admin())) with check ((select public.is_task_admin()));
drop policy if exists "task_admin_delete" on public.tasks;
create policy "task_admin_delete" on public.tasks for delete to authenticated
 using ((select public.is_task_admin()));
-- Employee changes status exclusively through this server-side function.
create or replace function public.update_my_task_status(p_task_id uuid,p_status text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_status not in ('待分配','待处理','处理中','待补资料','待复核','已回复') then raise exception 'Invalid status'; end if;
 update public.tasks set status=p_status,completed_at=case when p_status='已回复' then now() else null end
 where id=p_task_id and assignee=auth.uid();
 if not found then raise exception 'Task not assigned to current user'; end if;
end;$$;
revoke all on function public.update_my_task_status(uuid,text) from public;
grant execute on function public.update_my_task_status(uuid,text) to authenticated;
-- IMPORTANT: only business owner / organization admin should execute following command, substituting the user's actual Auth UUID:
-- update public.profiles set role='admin' where id='YOUR-ADMIN-AUTH-USER-UUID';
-- This must NEVER be exposed in client JS or implemented as a client self-service action.
