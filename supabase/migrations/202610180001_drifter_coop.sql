-- Drifter co-op preview: private, invite-code rooms and per-player checkpoints.
-- Run this once in the Supabase SQL Editor after enabling Anonymous Sign-Ins and Realtime.
begin;

create table if not exists public.drifter_rooms (
  room_id uuid primary key default gen_random_uuid(),
  room_code text not null unique check (room_code ~ '^[0-9A-F]{10}$'),
  host_uid uuid not null,
  room_status text not null default 'waiting' check (room_status in ('waiting','playing','closed')),
  world_seed bigint not null check (world_seed > 0),
  protocol_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);

create table if not exists public.drifter_room_members (
  room_id uuid not null references public.drifter_rooms(room_id) on delete cascade,
  user_id uuid not null,
  nickname text not null check (char_length(nickname) between 1 and 20),
  member_role text not null check (member_role in ('host','guest')),
  joined_at timestamptz not null default now(),
  primary key (room_id,user_id)
);

create table if not exists public.drifter_room_saves (
  room_id uuid not null references public.drifter_rooms(room_id) on delete cascade,
  user_id uuid not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (room_id,user_id)
);
create index if not exists drifter_room_members_user_room_idx on public.drifter_room_members(user_id,room_id);

alter table public.drifter_rooms enable row level security;
alter table public.drifter_room_members enable row level security;
alter table public.drifter_room_saves enable row level security;
revoke all on public.drifter_rooms,public.drifter_room_members,public.drifter_room_saves from public,anon,authenticated;

create or replace function public.drifter_create_room(p_nickname text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := left(trim(regexp_replace(coalesce(p_nickname,''),'[^[:alnum:] _.-]','','g')),20);
  v_code text;
  v_room public.drifter_rooms%rowtype;
  v_try integer;
begin
  if v_uid is null then raise exception 'Sign in before creating a room.' using errcode='28000'; end if;
  if v_name='' then v_name:='Drifter'; end if;
  select r.* into v_room from public.drifter_room_members m
    join public.drifter_rooms r using(room_id)
    where m.user_id=v_uid and r.room_status in ('waiting','playing') and r.expires_at>now()
    order by m.joined_at desc limit 1 for update of r;
  if found then
    update public.drifter_room_members set nickname=v_name where room_id=v_room.room_id and user_id=v_uid;
    return jsonb_build_object('room_id',v_room.room_id,'room_code',v_room.room_code,'room_status',v_room.room_status,
      'world_seed',v_room.world_seed,'protocol_version',v_room.protocol_version,'is_host',(v_room.host_uid=v_uid),'resumed',true);
  end if;
  for v_try in 1..8 loop
    v_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
    begin
      insert into public.drifter_rooms(room_code,host_uid,world_seed)
      values(v_code,v_uid,(floor(random()*999999998)::bigint+1)) returning * into v_room;
      exit;
    exception when unique_violation then
      v_room := null;
    end;
  end loop;
  if v_room.room_id is null then raise exception 'Could not allocate a room code. Try again.'; end if;
  insert into public.drifter_room_members(room_id,user_id,nickname,member_role)
  values(v_room.room_id,v_uid,v_name,'host');
  return jsonb_build_object('room_id',v_room.room_id,'room_code',v_room.room_code,'room_status',v_room.room_status,
    'world_seed',v_room.world_seed,'protocol_version',v_room.protocol_version,'is_host',true);
end;
$$;

create or replace function public.drifter_join_room(p_code text,p_nickname text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := left(trim(regexp_replace(coalesce(p_nickname,''),'[^[:alnum:] _.-]','','g')),20);
  v_room public.drifter_rooms%rowtype;
  v_existing boolean;
begin
  if v_uid is null then raise exception 'Sign in before joining a room.' using errcode='28000'; end if;
  if v_name='' then v_name:='Drifter'; end if;
  select * into v_room from public.drifter_rooms
   where room_code=upper(regexp_replace(coalesce(p_code,''),'[^0-9A-Fa-f]','','g'))
     and room_status in ('waiting','playing') and expires_at>now()
   for update;
  if v_room.room_id is null then raise exception 'Room code not found or expired.' using errcode='P0001'; end if;
  select exists(select 1 from public.drifter_room_members where room_id=v_room.room_id and user_id=v_uid) into v_existing;
  if not v_existing and exists (select 1 from public.drifter_room_members m join public.drifter_rooms r using(room_id)
             where m.user_id=v_uid and r.room_status in ('waiting','playing') and r.expires_at>now()) then
    raise exception 'Leave your current room before joining another.' using errcode='P0001';
  end if;
  if not v_existing and (select count(*) from public.drifter_room_members where room_id=v_room.room_id)>=2 then
    raise exception 'This room already has two players.' using errcode='P0001';
  end if;
  if v_existing then
    update public.drifter_room_members set nickname=v_name where room_id=v_room.room_id and user_id=v_uid;
  else
    insert into public.drifter_room_members(room_id,user_id,nickname,member_role)
    values(v_room.room_id,v_uid,v_name,'guest');
  end if;
  return jsonb_build_object('room_id',v_room.room_id,'room_code',v_room.room_code,'room_status',v_room.room_status,
    'world_seed',v_room.world_seed,'protocol_version',v_room.protocol_version,'is_host',(v_room.host_uid=v_uid));
end;
$$;

create or replace function public.drifter_start_room(p_room_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_room public.drifter_rooms%rowtype; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sign in before starting a room.' using errcode='28000'; end if;
  select * into v_room from public.drifter_rooms where room_id=p_room_id for update;
  if v_room.room_id is null or v_room.host_uid<>v_uid then raise exception 'Only the room host can start it.' using errcode='42501'; end if;
  if v_room.room_status<>'waiting' or v_room.expires_at<=now() then raise exception 'Room is no longer waiting.'; end if;
  update public.drifter_rooms set room_status='playing',updated_at=now() where room_id=v_room.room_id returning * into v_room;
  return jsonb_build_object('room_id',v_room.room_id,'room_code',v_room.room_code,'room_status',v_room.room_status,
    'world_seed',v_room.world_seed,'protocol_version',v_room.protocol_version,'is_host',true);
end;
$$;

create or replace function public.drifter_save_checkpoint(p_room_id uuid,p_payload jsonb)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_uid uuid := auth.uid(); v_seed bigint;
begin
  if v_uid is null then raise exception 'Sign in before saving.' using errcode='28000'; end if;
  if p_payload is null or octet_length(p_payload::text)>900000 then raise exception 'Checkpoint is missing or too large.'; end if;
  select world_seed into v_seed from public.drifter_rooms r
   join public.drifter_room_members m using(room_id)
   where r.room_id=p_room_id and m.user_id=v_uid and r.room_status='playing' and r.expires_at>now();
  if v_seed is null then raise exception 'Active room membership required.' using errcode='42501'; end if;
  if coalesce(p_payload->>'seed','') !~ '^[0-9]{1,10}$' then raise exception 'Checkpoint seed is invalid.'; end if;
  if (p_payload->>'seed')::bigint<>v_seed then raise exception 'Checkpoint world does not match this room.'; end if;
  insert into public.drifter_room_saves(room_id,user_id,payload,updated_at)
  values(p_room_id,v_uid,p_payload,now())
  on conflict(room_id,user_id) do update set payload=excluded.payload,updated_at=excluded.updated_at;
  return true;
end;
$$;

create or replace function public.drifter_load_checkpoint(p_room_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_uid uuid := auth.uid(); v_payload jsonb;
begin
  if v_uid is null then raise exception 'Sign in before loading.' using errcode='28000'; end if;
  if not exists(select 1 from public.drifter_room_members m join public.drifter_rooms r using(room_id)
                where m.room_id=p_room_id and m.user_id=v_uid and r.expires_at>now()) then
    raise exception 'Room membership required.' using errcode='42501';
  end if;
  select payload into v_payload from public.drifter_room_saves where room_id=p_room_id and user_id=v_uid;
  return v_payload;
end;
$$;

create or replace function public.drifter_leave_room(p_room_id uuid)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_uid uuid := auth.uid(); v_host uuid;
begin
  if v_uid is null then raise exception 'Sign in before leaving a room.' using errcode='28000'; end if;
  select host_uid into v_host from public.drifter_rooms where room_id=p_room_id for update;
  if v_host is null or not exists(select 1 from public.drifter_room_members where room_id=p_room_id and user_id=v_uid) then return false; end if;
  if v_host=v_uid then
    update public.drifter_rooms set room_status='closed',updated_at=now() where room_id=p_room_id;
    delete from public.drifter_room_members where room_id=p_room_id;
  else
    delete from public.drifter_room_members where room_id=p_room_id and user_id=v_uid;
  end if;
  return true;
end;
$$;

create or replace function public.drifter_can_access_topic(p_topic text)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select case when p_topic ~ '^drifter:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then exists(
    select 1 from public.drifter_rooms r join public.drifter_room_members m using(room_id)
     where r.room_id=split_part(p_topic,':',2)::uuid and m.user_id=auth.uid()
       and r.room_status in ('waiting','playing') and r.expires_at>now()) else false end;
$$;

revoke all on function public.drifter_create_room(text) from public,anon;
revoke all on function public.drifter_join_room(text,text) from public,anon;
revoke all on function public.drifter_start_room(uuid) from public,anon;
revoke all on function public.drifter_save_checkpoint(uuid,jsonb) from public,anon;
revoke all on function public.drifter_load_checkpoint(uuid) from public,anon;
revoke all on function public.drifter_leave_room(uuid) from public,anon;
revoke all on function public.drifter_can_access_topic(text) from public,anon;
grant execute on function public.drifter_create_room(text) to authenticated;
grant execute on function public.drifter_join_room(text,text) to authenticated;
grant execute on function public.drifter_start_room(uuid) to authenticated;
grant execute on function public.drifter_save_checkpoint(uuid,jsonb) to authenticated;
grant execute on function public.drifter_load_checkpoint(uuid) to authenticated;
grant execute on function public.drifter_leave_room(uuid) to authenticated;
grant execute on function public.drifter_can_access_topic(text) to authenticated;

drop policy if exists "drifter members can receive room broadcasts" on realtime.messages;
create policy "drifter members can receive room broadcasts"
on realtime.messages for select to authenticated
using (extension in ('broadcast','presence') and public.drifter_can_access_topic(realtime.topic()));

drop policy if exists "drifter members can send room broadcasts" on realtime.messages;
create policy "drifter members can send room broadcasts"
on realtime.messages for insert to authenticated
with check (extension in ('broadcast','presence') and public.drifter_can_access_topic(realtime.topic()));

commit;
