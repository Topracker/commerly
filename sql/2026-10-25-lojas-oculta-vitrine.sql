-- Lojas de TESTE fora da vitrine pública: coluna lojas.oculta.
--
-- Semântica: "não listada". A loja some de tudo que LISTA lojas para o público
-- (busca do cliente, sitemap, ranking, feed, fundadores, Vision, lista do
-- entregador), mas o link direto (/loja/[id], /cliente/loja/[id], /cardapio/[id])
-- continua abrindo — é o que permite seguir testando o fluxo em produção com
-- cliente@teste.com. Esconder também o link direto = dobrar `oculta` dentro de
-- `disponivel` (alternativa B no fim do arquivo).
--
-- Quem liga: só service role (painel admin) ou SQL direto. O dono da loja fala
-- com o banco pela chave anon/authenticated e o trigger abaixo congela a coluna
-- para esses papéis — mesmo molde do trg_lojas_bloqueia_cobranca (plano).
--
-- Pré-condições conferidas em 2026-10-25:
--   md5(pg_get_viewdef('lojas_publicas', true)) = 199cca3c17316c12b8eee7c5b8d5615d
--   nenhuma view depende de lojas_publicas; reloptions = null (security definer)
--
-- O SQL sozinho NÃO esconde nada: as telas precisam filtrar `oculta = false`
-- (ver o commit que acompanha). A coluna nasce false para todas as lojas.
--
-- STATUS: APLICADO em produção em 2026-10-25 (passos 1-3, via MCP). Conferido:
--   lojas_publicas com 22 colunas (`oculta` por último), trigger ativo, 0 lojas
--   ocultas; dono via REST não consegue ligar `oculta`. Passo 4 (marcar Burger
--   House/testeEDI) NÃO aplicado.

begin;

-- 1. Coluna (ADD COLUMN, nunca create table if not exists — regra 3).
alter table public.lojas add column if not exists oculta boolean not null default false;
comment on column public.lojas.oculta is
  'Loja de teste/interna: fora das listagens públicas (vitrine, sitemap, ranking). Só service role altera.';

-- 2. Só service role (ou conexão direta ao banco) muda `oculta`.
create or replace function public.lojas_oculta_so_admin()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if auth.role() in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.oculta := false;
    else
      new.oculta := old.oculta;
    end if;
  end if;
  return new;
end $function$;

drop trigger if exists trg_lojas_oculta_so_admin on public.lojas;
create trigger trg_lojas_oculta_so_admin
  before insert or update on public.lojas
  for each row execute function public.lojas_oculta_so_admin();

-- 3. View: corpo VIVO + `oculta` no fim (CREATE OR REPLACE só aceita coluna nova no
--    final; mantém grants e todas as colunas — regra 4).
do $$
declare
  v_def  text := pg_get_viewdef('public.lojas_publicas'::regclass, true);
  v_novo text;
begin
  if md5(v_def) <> '199cca3c17316c12b8eee7c5b8d5615d' then
    raise exception 'lojas_publicas mudou desde a revisão (md5 %) — revise antes de aplicar', md5(v_def);
  end if;
  v_novo := replace(v_def, E'    aceita_cupom\n   FROM lojas', E'    aceita_cupom,\n    oculta\n   FROM lojas');
  if v_novo = v_def then
    raise exception 'replace() não casou — nada foi alterado';
  end if;
  execute 'create or replace view public.lojas_publicas as ' || rtrim(v_novo, E'; \n');
end $$;

commit;

-- Conferência:
--   select column_name from information_schema.columns
--    where table_name = 'lojas_publicas' order by ordinal_position;   -- 22 colunas, `oculta` por último
--   select count(*) from public.lojas where oculta;                    -- 0 até marcar
--
-- 4. Marcar as lojas de teste (DEPOIS do deploy das telas; ids confirmados um a um):
--   update public.lojas set oculta = true
--    where id in ('36d99f1f-07c7-4dae-ad97-15765bb62533' /* Burger House */,
--                 '5cfb28c2-4279-4c02-a11a-7b65f2d83928' /* testeEDI */)
--    returning id, nome, oculta;
--
-- REVERTER:
--   drop trigger if exists trg_lojas_oculta_so_admin on public.lojas;
--   drop function if exists public.lojas_oculta_so_admin();
--   (a view precisa ser recriada sem `oculta` ANTES do drop column)
--
-- ALTERNATIVA B (esconde até o link direto, zero mudança nas telas):
--   no passo 3, trocar `... AND exclusao_solicitada_em IS NULL AS disponivel`
--   por `... AND exclusao_solicitada_em IS NULL AND NOT oculta AS disponivel`.
--   Custo: a loja de teste vira "indisponível" também para cliente@teste.com,
--   e o E2E de delivery em produção deixa de funcionar com ela.
