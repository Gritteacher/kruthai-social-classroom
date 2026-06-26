create extension if not exists pgcrypto with schema extensions;

create or replace function public.create_student_account(
  p_student_record_id uuid,
  p_student_code text,
  p_full_name text,
  p_class_name text default null,
  p_classroom_id uuid default null,
  p_password text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_caller_role text;
  v_email text;
  v_password text;
  v_user_id uuid;
  v_existing_user_id uuid;
  v_now timestamptz := now();
  v_instance_id uuid := coalesce((select instance_id from auth.users limit 1), '00000000-0000-0000-0000-000000000000'::uuid);
begin
  select role into v_caller_role
  from public.profiles
  where id = auth.uid();

  if coalesce(v_caller_role, '') <> 'teacher' then
    raise exception 'เฉพาะบัญชีครูเท่านั้นที่สร้างบัญชีนักเรียนได้';
  end if;

  if coalesce(trim(p_student_code), '') = '' or coalesce(trim(p_full_name), '') = '' then
    raise exception 'ต้องมีรหัสนักเรียนและชื่อ-นามสกุล';
  end if;

  v_email := lower(trim(p_student_code)) || '@students.kruthai.local';
  v_password := coalesce(nullif(trim(p_password), ''), trim(p_student_code) || '@2569');

  if char_length(v_password) < 6 then
    raise exception 'รหัสผ่านเริ่มต้นต้องมีอย่างน้อย 6 ตัวอักษร';
  end if;

  select id
  into v_existing_user_id
  from auth.users
  where lower(email) = v_email
  limit 1;

  if v_existing_user_id is null then
    v_user_id := extensions.gen_random_uuid();

    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) values (
      v_instance_id,
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      extensions.crypt(v_password, extensions.gen_salt('bf')),
      v_now,
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object(
        'role', 'student',
        'full_name', trim(p_full_name),
        'student_code', trim(p_student_code),
        'class_name', coalesce(nullif(trim(p_class_name), ''), 'ยังไม่ได้เลือกห้องเรียน'),
        'school_name', 'โรงเรียนเทพศิรินทร์ นนทบุรี'
      ),
      v_now,
      v_now,
      '',
      '',
      '',
      ''
    );
  else
    v_user_id := v_existing_user_id;

    update auth.users
    set
      email = v_email,
      encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, v_now),
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
        'role', 'student',
        'full_name', trim(p_full_name),
        'student_code', trim(p_student_code),
        'class_name', coalesce(nullif(trim(p_class_name), ''), 'ยังไม่ได้เลือกห้องเรียน'),
        'school_name', 'โรงเรียนเทพศิรินทร์ นนทบุรี'
      ),
      updated_at = v_now
    where id = v_user_id;
  end if;

  if exists (
    select 1
    from auth.identities
    where user_id = v_user_id and provider = 'email'
  ) then
    update auth.identities
    set
      identity_data = jsonb_build_object('sub', v_user_id::text, 'email', v_email),
      provider_id = v_email,
      last_sign_in_at = coalesce(last_sign_in_at, v_now),
      updated_at = v_now
    where user_id = v_user_id and provider = 'email';
  else
    insert into auth.identities (
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at,
      id
    ) values (
      v_email,
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email),
      'email',
      v_now,
      v_now,
      v_now,
      extensions.gen_random_uuid()
    );
  end if;

  insert into public.profiles (
    id,
    full_name,
    role,
    student_code,
    class_name,
    school_name
  ) values (
    v_user_id,
    trim(p_full_name),
    'student',
    trim(p_student_code),
    coalesce(nullif(trim(p_class_name), ''), 'ยังไม่ได้เลือกห้องเรียน'),
    'โรงเรียนเทพศิรินทร์ นนทบุรี'
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    role = excluded.role,
    student_code = excluded.student_code,
    class_name = excluded.class_name,
    school_name = excluded.school_name;

  if p_student_record_id is not null then
    update public.students
    set
      auth_email = v_email,
      account_created_at = v_now
    where id = p_student_record_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'email', v_email,
    'mode', case when v_existing_user_id is null then 'created' else 'updated' end,
    'message', case when v_existing_user_id is null then 'สร้างบัญชีนักเรียนแล้ว' else 'รีเซ็ตรหัสบัญชีนักเรียนแล้ว' end
  );
end;
$$;

revoke all on function public.create_student_account(uuid, text, text, text, uuid, text) from public;
grant execute on function public.create_student_account(uuid, text, text, text, uuid, text) to authenticated;
