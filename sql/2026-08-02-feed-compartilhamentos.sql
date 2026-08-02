-- ===========================================================================
-- FEED (Reels): contador de COMPARTILHAMENTOS.
-- ---------------------------------------------------------------------------
-- O feed em tela cheia mostra três contadores na coluna lateral: curtidas,
-- comentários e compartilhamentos. Os dois primeiros já saem de tabelas com
-- `select` público (`post_likes`, `post_comentarios`). O terceiro não existia.
--
-- Duas armadilhas resolvidas aqui:
--
--   1. `post_eventos.tipo` tem um CHECK que só aceita ('view','pedir'). Sem
--      relaxar, todo compartilhamento estouraria 23514 no INSERT.
--
--   2. `post_eventos` é PRIVADO por RLS — o cliente só enxerga as PRÓPRIAS
--      linhas. Contar compartilhamentos direto de lá devolveria no máximo 1
--      para qualquer post. Por isso o total vive numa coluna de `posts`
--      (que tem `select` público) mantida por trigger.
--
-- O índice único `post_eventos_uniq (post_id, cliente_id, tipo)` continua
-- valendo: um compartilhamento por cliente/post. O contador é honesto — mede
-- quantas PESSOAS compartilharam, não quantos toques no botão.
--
-- Rode no SQL Editor do Supabase (produção). Seguro para rodar mais de uma vez.
-- ===========================================================================

-- ===========================================================================
-- 1. O CHECK precisa aceitar o novo tipo de evento.
-- ===========================================================================
alter table public.post_eventos drop constraint if exists post_eventos_tipo_check;
alter table public.post_eventos add constraint post_eventos_tipo_check
  check (tipo = any (array['view', 'pedir', 'compartilhar']));

-- ===========================================================================
-- 2. Coluna do total em `posts`.
--    ATENÇÃO: `add column if not exists` numa tabela QUE JÁ EXISTE é o caminho
--    certo. `create table if not exists` com a coluna nova seria no-op e a
--    coluna nunca entraria — ver a armadilha registrada em migrações passadas.
-- ===========================================================================
alter table public.posts
  add column if not exists compartilhamentos integer not null default 0;

-- ===========================================================================
-- 3. Trigger que mantém o total.
--    SECURITY DEFINER porque quem compartilha é o CLIENTE, e a policy de
--    escrita de `posts` só deixa o dono da loja mexer. Sem isto o UPDATE seria
--    silenciosamente descartado pela RLS e o contador ficaria em zero.
-- ===========================================================================
create or replace function public.post_conta_compartilhamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tipo = 'compartilhar' then
    update public.posts
       set compartilhamentos = compartilhamentos + 1
     where id = new.post_id;
  end if;
  return new;
end;
$$;

drop trigger if exists post_eventos_compartilhamento on public.post_eventos;
create trigger post_eventos_compartilhamento
  after insert on public.post_eventos
  for each row execute function public.post_conta_compartilhamento();

-- ===========================================================================
-- 4. Backfill — se algum evento 'compartilhar' entrou antes da trigger.
--    (Hoje são zero, mas deixa a migração idempotente de verdade.)
-- ===========================================================================
update public.posts p
   set compartilhamentos = e.total
  from (
    select post_id, count(*) as total
      from public.post_eventos
     where tipo = 'compartilhar'
     group by post_id
  ) e
 where e.post_id = p.id
   and p.compartilhamentos is distinct from e.total;

-- ===========================================================================
-- 5. A visão de métricas do comerciante ganha a coluna.
--    A view é recriada por inteiro — repetir TODAS as colunas antigas é
--    obrigatório, senão a tela de posts da loja perde métrica (a mesma
--    armadilha que já derrubou `lojas_publicas`).
-- ===========================================================================
create or replace view public.posts_metricas as
  select
    p.id as post_id,
    p.loja_id,
    (select count(*) from public.post_likes pl where pl.post_id = p.id) as likes,
    (select count(*) from public.post_comentarios pc where pc.post_id = p.id) as comentarios,
    (select count(*) from public.post_eventos pe
      where pe.post_id = p.id and pe.tipo = 'view') as visualizacoes,
    (select count(*) from public.post_eventos pe
      where pe.post_id = p.id and pe.tipo = 'pedir') as cliques_pedir,
    p.compartilhamentos
  from public.posts p;
