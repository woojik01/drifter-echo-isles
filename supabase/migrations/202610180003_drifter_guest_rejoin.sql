-- Allow a returning guest to reclaim the same room slot if their anonymous
-- Supabase user changed between launches. The client token is never broadcast;
-- only its hash is stored. A legacy guest row can be claimed once by the same
-- nickname while the caller has the room invite code.
begin;

alter table public.drifter_room_members
  add column if not exists rejoin_token_hash text;

create or replace function public.drifter_join_room(p_code text,p_nickname text,p_rejoin_token text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := left(trim(regexp_replace(coalesce(p_nickname,''),'[^[:alnum:] _.-]','','g')),20);
  v_token text := lower(trim(coalesce(p_rejoin_token,'')));
  v_room public.drifter_rooms%rowtype;
  v_existing boolean;
  v_previous_uid uuid;
begin
  if v_uid is null then raise exception 'Sign in before joining a room.' using errcode='28000'; end if;
  if v_token !~ '^[a-f0-9]{64}$' then raise exception 'Invalid room rejoin token.' using errcode='22023'; end if;
  if v_name='' then v_name:='Drifter'; end if;
  select * into v_room from public.drifter_rooms
   where room_code=upper(regexp_replace(coalesce(p_code,''),'[^0-9A-Fa-f]','','g'))
     and room_status in ('waiting','playing') and expires_at>now()
   for update;
  if v_room.room_id is null then raise exception 'Room code not found or expired.' using errcode='P0001'; end if;

  select exists(select 1 from public.drifter_room_members where room_id=v_room.room_id and user_id=v_uid) into v_existing;
  if v_existing then
    update public.drifter_room_members set nickname=v_name,rejoin_token_hash=md5(v_token)
      where room_id=v_room.room_id and user_id=v_uid;
  else
    if exists (select 1 from public.drifter_room_members m join public.drifter_rooms r using(room_id)
               where m.user_id=v_uid and r.room_id<>v_room.room_id
                 and r.room_status in ('waiting','playing') and r.expires_at>now()) then
      raise exception 'Leave your current room before joining another.' using errcode='P0001';
    end if;

    -- Prefer a token match. This survives an anonymous auth session being
    -- replaced while local browser storage still retains the invite token.
    -- The nickname path lets existing rows from pre-token builds recover once.
    select user_id into v_previous_uid from public.drifter_room_members
     where room_id=v_room.room_id and member_role='guest' and user_id<>v_uid
       and (rejoin_token_hash=md5(v_token) or (rejoin_token_hash is null and nickname=v_name))
     order by joined_at desc limit 1 for update;

    if v_previous_uid is not null then
      insert into public.drifter_room_saves(room_id,user_id,payload,updated_at)
      select room_id,v_uid,payload,now() from public.drifter_room_saves
       where room_id=v_room.room_id and user_id=v_previous_uid
      on conflict(room_id,user_id) do update
       set payload=excluded.payload,updated_at=excluded.updated_at;
      delete from public.drifter_room_saves where room_id=v_room.room_id and user_id=v_previous_uid;
      update public.drifter_room_members set user_id=v_uid,nickname=v_name,
        rejoin_token_hash=md5(v_token),joined_at=now()
       where room_id=v_room.room_id and user_id=v_previous_uid;
    else
      if (select count(*) from public.drifter_room_members where room_id=v_room.room_id)>=2 then
        raise exception 'This room already has two players.' using errcode='P0001';
      end if;
      insert into public.drifter_room_members(room_id,user_id,nickname,member_role,rejoin_token_hash)
      values(v_room.room_id,v_uid,v_name,'guest',md5(v_token));
    end if;
  end if;

  return jsonb_build_object('room_id',v_room.room_id,'room_code',v_room.room_code,'room_status',v_room.room_status,
    'world_seed',v_room.world_seed,'protocol_version',v_room.protocol_version,'is_host',(v_room.host_uid=v_uid));
end;
$$;

revoke all on function public.drifter_join_room(text,text,text) from public,anon;
grant execute on function public.drifter_join_room(text,text,text) to authenticated;

commit;
