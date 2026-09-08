-- Primeiro crie sua conta em Authentication > Users > Add user > Create new user.
-- Troque o e-mail abaixo pelo e-mail EXATO dessa conta. Não coloque sua senha aqui.
do $$
declare target_user uuid;
begin
  select id into target_user from auth.users where lower(email) = lower('TROQUE_PELO_SEU_EMAIL');
  if target_user is null then
    raise exception 'Conta não encontrada. Crie o usuário em Authentication > Users e confira o e-mail neste script.';
  end if;
  insert into public.store_admins (user_id) values (target_user) on conflict do nothing;
end $$;
