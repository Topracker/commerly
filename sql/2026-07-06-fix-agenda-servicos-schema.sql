-- Hotfix (2026-07-06): schema de `agendamentos` e `servicos` divergente do codigo.
--
-- Sintoma (CONFIRMADO em prod 2026-07-07): TODO insert de agendamento falha com
-- 23502 'null value in column "data_hora" ... violates not-null constraint'. A
-- coluna legada `data_hora` continua NOT NULL e o codigo nao a preenche mais, entao
-- a feature de agenda esta 100% quebrada em producao. O app (app/lib/nicheStore.ts)
-- escreve/le colunas que NAO existem nas tabelas de producao, porque a DDL da
-- agenda foi feita manualmente no painel com um schema ANTIGO, enquanto o codigo
-- evoluiu para outro.
--
--   agendamentos: codigo usa  cliente, data, hora, telefone, obs, status, servico
--                 producao tem cliente_nome (NOT NULL), data_hora, status, servico
--   servicos:     codigo usa  nome, preco, duracao
--                 producao tem nome, preco, duracao_minutos
--
-- As tabelas estao VAZIAS, entao o alinhamento e puramente aditivo e sem risco:
-- acrescenta as colunas que o codigo espera e solta o NOT NULL da coluna legada
-- `cliente_nome` (que o codigo nao preenche mais). As colunas legadas
-- (cliente_nome, data_hora, duracao_minutos) ficam para nao quebrar nada; podem
-- ser removidas depois com seguranca. Idempotente.

-- ===========================================================================
-- agendamentos
-- ===========================================================================
alter table public.agendamentos
  add column if not exists cliente  text,
  add column if not exists data     date,
  add column if not exists hora     text,
  add column if not exists telefone text,
  add column if not exists obs      text;

-- O codigo insere sem as colunas legadas (cliente_nome, data_hora). Se qualquer
-- uma seguir NOT NULL, todo insert de agendamento falha em producao com
-- "null value in column ... violates not-null constraint". Solta o NOT NULL de
-- TODAS as colunas legadas de forma idempotente e defensiva (so mexe se a coluna
-- ainda existir), para nao depender da ordem/estado de migracoes anteriores.
do $$
declare
  col text;
begin
  foreach col in array array['cliente_nome', 'data_hora'] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'agendamentos' and column_name = col
    ) then
      execute format('alter table public.agendamentos alter column %I drop not null', col);
    end if;
  end loop;
end $$;

-- ===========================================================================
-- servicos
-- ===========================================================================
alter table public.servicos
  add column if not exists duracao integer;

-- Verificacao (rode manualmente apos aplicar):
--   select column_name from information_schema.columns
--     where table_schema='public' and table_name='agendamentos' order by ordinal_position;
--   -- deve conter: cliente, data, hora, telefone, obs
--   select column_name from information_schema.columns
--     where table_schema='public' and table_name='servicos' order by ordinal_position;
--   -- deve conter: duracao
