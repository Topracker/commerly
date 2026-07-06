-- Features 2026-07-05: ETA dinamico, Gamificacao do entregador, Avaliacao com
-- foto e Comprovante de entrega. Tudo idempotente. Rode no SQL Editor do
-- Supabase (producao).
--
-- Resumo do que muda no banco:
--   1. avaliacoes_lojas.foto_url       -> foto que o cliente anexa a avaliacao
--   2. pedidos_clientes.comprovante_entrega_url -> foto de comprovante do entregador
--   3. bucket "avaliacoes" (publico)   -> fotos das avaliacoes/comprovantes
--   4. view ranking_entregadores_semana -> ranking semanal de entregadores
--
-- ETA dinamico e as badges/metas sao 100% client-side (calculados a partir de
-- dados que ja existem: entregas_localizacao, entrega_lat/lng e o historico de
-- pedidos). Nao exigem DDL.

-- ===========================================================================
-- 1. AVALIACAO COM FOTO (cliente -> loja)
-- ===========================================================================
alter table public.avaliacoes_lojas
  add column if not exists foto_url text;

-- ===========================================================================
-- 2. COMPROVANTE DE ENTREGA (entregador -> pedido)
-- ===========================================================================
-- O guard de pedidos_clientes preserva um conjunto fixo de colunas e deixa as
-- demais passarem livres no UPDATE; comprovante_entrega_url nao esta na lista de
-- preservacao, entao o valor gravado no confirmar-entrega passa sem problema.
alter table public.pedidos_clientes
  add column if not exists comprovante_entrega_url text;

-- ===========================================================================
-- 3. BUCKET DE FOTOS DAS AVALIACOES/COMPROVANTES
-- ===========================================================================
insert into storage.buckets (id, name, public)
values ('avaliacoes', 'avaliacoes', true)
on conflict (id) do update set public = true;

drop policy if exists "avaliacoes_public_read" on storage.objects;
create policy "avaliacoes_public_read" on storage.objects
  for select to public using (bucket_id = 'avaliacoes');
drop policy if exists "avaliacoes_auth_insert" on storage.objects;
create policy "avaliacoes_auth_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'avaliacoes');
drop policy if exists "avaliacoes_auth_update" on storage.objects;
create policy "avaliacoes_auth_update" on storage.objects
  for update to authenticated using (bucket_id = 'avaliacoes');
drop policy if exists "avaliacoes_auth_delete" on storage.objects;
create policy "avaliacoes_auth_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'avaliacoes');

-- ===========================================================================
-- 4. RANKING SEMANAL DE ENTREGADORES
-- ===========================================================================
-- Agrega as entregas concluidas nos ultimos 7 dias por entregador. A view usa
-- security_invoker=false (roda como owner) para atravessar o RLS de
-- pedidos_clientes: assim qualquer entregador autenticado ve o ranking sem
-- enxergar o conteudo dos pedidos alheios (a view so expoe nome/foto/contagem).
--
-- IMPORTANTE: as entregas e a media de nota sao pre-agregadas em subconsultas
-- separadas ANTES do join com entregadores. Se juntassemos pedidos_clientes e
-- avaliacoes_entregadores direto na mesma query, o produto cartesiano entre as
-- duas inflaria count(entregas) e sum(ganhos) pelo numero de avaliacoes.
drop view if exists public.ranking_entregadores_semana;
create view public.ranking_entregadores_semana
  with (security_invoker = false) as
  select
    e.id                                    as entregador_id,
    e.nome                                  as nome,
    e.foto_url                              as foto_url,
    coalesce(p.entregas, 0)                 as entregas,
    coalesce(p.ganhos, 0)::numeric(12,2)    as ganhos,
    coalesce(av.media_nota, 0)::numeric(3,2) as media_nota
  from public.entregadores e
  left join (
    select entregador_id,
           count(*)            as entregas,
           sum(valor_corrida)  as ganhos
    from public.pedidos_clientes
    where status = 'entregue'
      and updated_at >= (now() - interval '7 days')
    group by entregador_id
  ) p on p.entregador_id = e.id
  left join (
    select entregador_id, avg(nota) as media_nota
    from public.avaliacoes_entregadores
    group by entregador_id
  ) av on av.entregador_id = e.id;

grant select on public.ranking_entregadores_semana to authenticated;

-- ===========================================================================
-- 5. Verificacao (rode manualmente apos aplicar):
--   select column_name from information_schema.columns
--     where table_name='avaliacoes_lojas' and column_name='foto_url';
--   select column_name from information_schema.columns
--     where table_name='pedidos_clientes' and column_name='comprovante_entrega_url';
--   select * from public.ranking_entregadores_semana order by entregas desc;
--   select id, public from storage.buckets where id='avaliacoes';
-- ===========================================================================
