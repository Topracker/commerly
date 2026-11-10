-- 2026-11-10 — Maquininha PagBank automática (API do Extrato EDI).
--
-- ESTADO: NÃO APLICADO. Aplicar ANTES do deploy do código.
--
-- Separado da integração PagBank por token/OAuth (que segue "Em breve" e
-- bloqueada por sql/2026-11-06-pagbank-indisponivel.sql). Nada aqui religa ela.
--
-- Três tabelas:
--   pagbank_edi_conexoes      — estabelecimento, final do token e estado da
--                               sincronização. O dono LÊ a sua; só o servidor
--                               (service role) grava.
--   pagbank_edi_segredos      — o token CIFRADO (AES-256-GCM, chave na env
--                               PAGBANK_EDI_CHAVE, que nunca vai ao banco).
--                               Zero policy e sem GRANT: nem o dono lê.
--   pagbank_edi_sincronizacoes — registro de cada dia buscado (contagens e
--                               valores, nunca credencial). O dono lê o seu.
--
-- As vendas entram em `vendas` com origem 'maquininha_pagbank', adquirente
-- 'pagbank' e id_externo = codigo_transacao do EDI — a MESMA chave da
-- importação por arquivo, então a UNIQUE (loja_id, adquirente, id_externo) de
-- sql/2026-11-06-vendas-maquininha.sql impede duplicar entre os dois caminhos.

-- Maquininha física ou venda online (link/checkout) do PagBank. Nulo = não deu
-- para saber (importação por arquivo, vendas antigas).
alter table public.vendas
  add column if not exists captura text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.vendas'::regclass and conname = 'vendas_captura_check'
  ) then
    alter table public.vendas
      add constraint vendas_captura_check check (captura is null or captura in ('maquininha', 'online'));
  end if;
end $$;

create table if not exists public.pagbank_edi_conexoes (
  loja_id              uuid primary key references public.lojas(id) on delete cascade,
  estabelecimento      text not null check (estabelecimento ~ '^[0-9]{3,20}$'),
  -- Só os 4 últimos caracteres, para a tela mostrar "••••7741".
  token_final          text not null check (char_length(token_final) between 1 and 4),
  status               text not null default 'nova'
                       check (status in ('nova', 'ok', 'aguardando', 'credencial_invalida', 'erro')),
  -- Último dia (fuso de São Paulo) gravado com VALIDADO = TRUE. A próxima
  -- passada começa no dia seguinte.
  ultimo_dia_validado  date,
  ultima_sincronizacao timestamptz,
  ultimo_erro          text check (ultimo_erro is null or char_length(ultimo_erro) <= 300),
  -- Limite do botão "Sincronizar agora" (o rate limit em memória não vale
  -- entre instâncias da Vercel).
  sync_manual_em       timestamptz,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now()
);

create table if not exists public.pagbank_edi_segredos (
  loja_id       uuid primary key references public.pagbank_edi_conexoes(loja_id) on delete cascade,
  token_cifrado text not null,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.pagbank_edi_sincronizacoes (
  id           bigserial primary key,
  loja_id      uuid not null references public.lojas(id) on delete cascade,
  dia          date not null,
  origem       text not null check (origem in ('cron', 'manual', 'teste')),
  http_status  int,
  validado     boolean,
  linhas       int not null default 0,
  vendas_novas int not null default 0,
  ja_existiam  int not null default 0,
  canceladas   int not null default 0,
  ajustadas    int not null default 0,
  online       int not null default 0,
  bruto_novas  numeric(12,2) not null default 0,
  erro         text check (erro is null or char_length(erro) <= 300),
  criado_em    timestamptz not null default now()
);

create index if not exists pagbank_edi_sinc_loja_idx
  on public.pagbank_edi_sincronizacoes (loja_id, criado_em desc);

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.pagbank_edi_conexoes       enable row level security;
alter table public.pagbank_edi_segredos       enable row level security;
alter table public.pagbank_edi_sincronizacoes enable row level security;

-- Segredo: nenhum papel do navegador encosta. Sem policy E sem grant.
revoke all on public.pagbank_edi_segredos from anon, authenticated;
-- Escrita só pelo servidor: o token precisa ser cifrado antes de gravar.
revoke insert, update, delete on public.pagbank_edi_conexoes       from anon, authenticated;
revoke insert, update, delete on public.pagbank_edi_sincronizacoes from anon, authenticated;
revoke all on public.pagbank_edi_conexoes       from anon;
revoke all on public.pagbank_edi_sincronizacoes from anon;
grant select on public.pagbank_edi_conexoes       to authenticated;
grant select on public.pagbank_edi_sincronizacoes to authenticated;

drop policy if exists "dono le conexao edi" on public.pagbank_edi_conexoes;
create policy "dono le conexao edi" on public.pagbank_edi_conexoes
  for select to authenticated
  using (loja_id in (select id from public.lojas where user_id = auth.uid()));

drop policy if exists "dono le sincronizacoes edi" on public.pagbank_edi_sincronizacoes;
create policy "dono le sincronizacoes edi" on public.pagbank_edi_sincronizacoes
  for select to authenticated
  using (loja_id in (select id from public.lojas where user_id = auth.uid()));

-- Conferência depois de aplicar (migrações parciais já aconteceram):
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='vendas' and column_name='captura';  -- 1 linha
--   select relname, relrowsecurity from pg_class
--    where relname like 'pagbank_edi_%' and relkind='r';                              -- 3 linhas, todas true
--   select tablename, policyname from pg_policies where tablename like 'pagbank_edi_%'; -- 2 policies
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_name='pagbank_edi_segredos' and grantee in ('anon','authenticated'); -- 0 linhas
