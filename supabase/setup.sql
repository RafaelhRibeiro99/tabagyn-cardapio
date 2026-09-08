-- Execute no SQL Editor do seu projeto Supabase.
-- Não contém senhas. Pode ser executado novamente sem substituir o catálogo.
begin;
create table if not exists public.store_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.store_admins enable row level security;
revoke all on public.store_admins from anon, authenticated;
grant select on public.store_admins to authenticated;
grant select, insert on public.store_admins to service_role;
drop policy if exists "Read own admin membership" on public.store_admins;
create policy "Read own admin membership" on public.store_admins
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.is_store_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.store_admins where user_id = (select auth.uid())); $$;
revoke all on function public.is_store_admin() from public;
grant execute on function public.is_store_admin() to anon, authenticated;

create table if not exists public.store_catalog (
  id integer primary key check (id = 1),
  revision bigint not null default 1,
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and payload ?& array['whatsapp','demonstracao','categorias','produtos','essencias']
    and jsonb_typeof(payload->'categorias') = 'array'
    and jsonb_typeof(payload->'produtos') = 'array'
    and jsonb_typeof(payload->'essencias') = 'array'
  )
);
alter table public.store_catalog enable row level security;
revoke all on public.store_catalog from anon, authenticated;
grant select on public.store_catalog to anon, authenticated;
grant update (payload, revision) on public.store_catalog to authenticated;
drop policy if exists "Public catalog read" on public.store_catalog;
create policy "Public catalog read" on public.store_catalog for select to anon, authenticated using (true);
drop policy if exists "Admin catalog update" on public.store_catalog;
create policy "Admin catalog update" on public.store_catalog for update to authenticated
  using ((select public.is_store_admin())) with check ((select public.is_store_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalog-images', 'catalog-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Admin upload catalog images" on storage.objects;
create policy "Admin upload catalog images" on storage.objects for insert to authenticated
with check (bucket_id = 'catalog-images' and (select public.is_store_admin()));
drop policy if exists "Admin read catalog images" on storage.objects;
create policy "Admin read catalog images" on storage.objects for select to authenticated
using (bucket_id = 'catalog-images' and (select public.is_store_admin()));
drop policy if exists "Admin delete catalog images" on storage.objects;
create policy "Admin delete catalog images" on storage.objects for delete to authenticated
using (bucket_id = 'catalog-images' and (select public.is_store_admin()));
commit;

-- Importa o catalogo atual apenas se ainda nao existir.
insert into public.store_catalog (id,payload) values (1,'{"whatsapp":"5562992114211","demonstracao":false,"categorias":[{"id":"0","nome":"Sessões","descricao":""},{"id":"1","nome":"Bebidas","descricao":""},{"id":"2","nome":"Drinks","descricao":""},{"id":"3","nome":"Esquine","descricao":""},{"id":"4","nome":"Doces","descricao":""}],"produtos":[{"id":"refrigerante","categoria":"1","nome":"Refrigerante","descricao":"Lata de 350 ml. Informe sua preferência nas observações.","preco":800,"disponivel":true,"sessao":false,"imagem":null},{"id":"suco","categoria":"1","nome":"Suco natural","descricao":"Copo de 300 ml. Consulte os sabores pelo WhatsApp.","preco":1200,"disponivel":true,"sessao":false,"imagem":null},{"id":"agua","categoria":"1","nome":"Água mineral","descricao":"Garrafa de 500 ml, sem gás.","preco":600,"disponivel":true,"sessao":false,"imagem":null},{"id":"56c0175a4aff42ab99064fa97ce285b8","categoria":"0","nome":"Sessão Premium","descricao":"Escolha seus sabores e monte uma mistura de 100%.","preco":2500,"disponivel":true,"sessao":true,"imagem":null}],"essencias":[{"id":"6ed8a461c98e40f688bcc8154be65f2b","marca":"Onix","sabor":"Mint","disponivel":true,"imagem":null,"sessoes":["56c0175a4aff42ab99064fa97ce285b8"]},{"id":"f61c5f69c37549e582c6d6bd5293caf1","marca":"Onix","sabor":"Orange","disponivel":true,"imagem":null,"sessoes":["56c0175a4aff42ab99064fa97ce285b8"]}]}'::jsonb) on conflict (id) do nothing;
