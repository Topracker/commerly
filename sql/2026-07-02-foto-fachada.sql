-- Foto da fachada do comércio.
--
-- Rode este SQL no SQL Editor do Supabase (produção) ANTES do deploy com o
-- upload da foto da fachada.
--
-- O que ele faz:
--   1. Adiciona `foto_fachada_url` (text) na tabela `lojas`.
--   2. Recria a view pública `lojas_publicas` para expor `foto_fachada_url`,
--      para as páginas públicas e a busca mostrarem a foto sem dar acesso à
--      tabela `lojas`.
--   3. Cria o bucket público de Storage "lojas" e as policies para o
--      comerciante logado subir/atualizar a foto (caminho "{loja_id}/fachada.jpg").
--
-- Tudo é idempotente — pode rodar mais de uma vez sem problema.

alter table public.lojas add column if not exists foto_fachada_url text;

-- View pública: recriada para incluir foto_fachada_url. security_invoker=false
-- (security definer) para que anon/authenticated enxerguem as lojas mesmo com
-- o RLS restritivo da tabela base.
drop view if exists public.lojas_publicas;
create view public.lojas_publicas
  with (security_invoker = false) as
  select id, nome, tipo, localizacao, telefone, instagram, horario,
         latitude, longitude, foto_fachada_url, created_at
  from public.lojas;

grant select on public.lojas_publicas to anon, authenticated;

-- Bucket público "lojas" para as fotos de fachada.
insert into storage.buckets (id, name, public)
values ('lojas', 'lojas', true)
on conflict (id) do update set public = true;

-- Policies de Storage: leitura pública, escrita para usuário autenticado.
drop policy if exists "lojas_public_read" on storage.objects;
create policy "lojas_public_read" on storage.objects
  for select to public
  using (bucket_id = 'lojas');

drop policy if exists "lojas_auth_insert" on storage.objects;
create policy "lojas_auth_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'lojas');

drop policy if exists "lojas_auth_update" on storage.objects;
create policy "lojas_auth_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'lojas');

drop policy if exists "lojas_auth_delete" on storage.objects;
create policy "lojas_auth_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'lojas');

-- Verificação:
-- select foto_fachada_url from public.lojas_publicas limit 1;
