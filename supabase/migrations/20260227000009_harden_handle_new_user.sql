-- Corrective migration: harden handle_new_user() against missing role.
--
-- Problem: if supabase.auth.signUp() is called without a role in
-- raw_user_meta_data, the cast `(raw_user_meta_data ->> 'role')::user_role`
-- yields NULL. Because profiles.role is NOT NULL, the INSERT fails with a
-- Postgres constraint violation AFTER auth.users has already been created,
-- leaving an orphaned auth user with no profile row.
--
-- Fix: add an explicit guard at the top of handle_new_user(). If role is
-- absent or empty, raise an exception with a clear message. Because the
-- trigger runs AFTER INSERT on auth.users, the exception will propagate
-- to the supabase.auth.signUp() call as a 500 error. The auth.users row
-- is NOT rolled back by Supabase Auth's internal transaction model in all
-- versions, so application code in D3 must validate role presence on the
-- client before calling signUp() to avoid orphaned rows. The guard here
-- is a belt-and-suspenders server-side check.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.raw_user_meta_data ->> 'role') is null
      or (new.raw_user_meta_data ->> 'role') = '' then
    raise exception 'role is required in user metadata (must be ''trainer'' or ''athlete'')';
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    (new.raw_user_meta_data ->> 'role')::public.user_role
  );
  return new;
end;
$$;
