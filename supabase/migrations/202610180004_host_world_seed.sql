-- Let an in-game host bind the party to the exact world seed they are playing.
-- A null seed keeps title-screen party creation behavior (server-generated seed).
begin;

create or replace function public.drifter_create_room(p_nickname text,p_world_seed bigint)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := left(trim(regexp_replace(coalesce(p_nickname,''),'[^[:alnum:] _.-]','','g')),20);
  v_code text;
  v_room public.drifter_rooms%rowtype;
  v_seed bigint;
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

  if p_world_seed is not null and (p_world_seed<1 or p_world_seed>9999999999) then
    raise exception 'World seed is outside the supported range.' using errcode='22023';
  end if;
  v_seed := coalesce(p_world_seed,(floor(random()*999999998)::bigint+1));

  for v_try in 1..8 loop
    v_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
    begin
      insert into public.drifter_rooms(room_code,host_uid,world_seed)
      values(v_code,v_uid,v_seed) returning * into v_room;
      exit;
    exception when unique_violation then
      v_room := null;
    end;
  end loop;
  if v_room.room_id is null then raise exception 'Could not allocate a room code. Try again.'; end if;
  insert into public.drifter_room_members(room_id,user_id,nickname,member_role)
  values(v_room.room_id,v_uid,v_name,'host');
  return jsonb_build_object('room_id',v_room.room_id,'room_code',v_room.room_code,'room_status',v_room.room_status,
    'world_seed',v_room.world_seed,'protocol_version',v_room.protocol_version,'is_host',true,'resumed',false);
end;
$$;

-- Keep the original signature available to older uploaded builds. They still
-- create rooms with a server-generated seed until the updated game is uploaded.
create or replace function public.drifter_create_room(p_nickname text)
returns jsonb language sql security definer
set search_path = pg_catalog, public
as $$
  select public.drifter_create_room(p_nickname,null::bigint);
$$;

revoke all on function public.drifter_create_room(text,bigint) from public,anon;
grant execute on function public.drifter_create_room(text,bigint) to authenticated;
revoke all on function public.drifter_create_room(text) from public,anon;
grant execute on function public.drifter_create_room(text) to authenticated;

commit;
