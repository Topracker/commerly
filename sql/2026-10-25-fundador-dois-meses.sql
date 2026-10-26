-- =============================================================================
-- Programa Fundadores: R$ 29,90 só nos 2 primeiros meses de assinatura
-- =============================================================================
-- STATUS: APLICADO em produção em 2026-10-25 (via MCP, apply_migration
--   `fundador_dois_meses`). Conferido: md5 auto_set_fundador 40777273… e
--   lojas_bloqueia_cobranca_cliente 34d73a3d… (= esperados abaixo); 7 vagas =
--   7 lojas fundador; 0 com fundador_promo_em; RLS ligado, 0 policies, anon e
--   authenticated sem SELECT. FALTA: teste REST com JWT real (regra 12).
-- Antes de aplicar: testado em 2026-10-25 em prod dentro de um único DO
--   com raise no fim (rollback garantido; conferido depois: nada persistiu):
--   backfill=7 vagas; cadastro com fundador=false enviado → true + vaga;
--   loja apagada → vaga continua (8); cadastro nº 101 com fundador=true
--   enviado → false; service role grava fundador_promo_em; PATCH do dono
--   (authenticated, 1 linha) → fundador e fundador_promo_em inalterados.
--   md5 esperados depois de aplicar: auto_set_fundador 40777273a43acf80bec65f742d294cee,
--   lojas_bloqueia_cobranca_cliente 34d73a3d5ae1da1fade1a91659a353a1.
--   Compatível com o código que está em produção (nada nele escreve
--   lojas.fundador nem lê a coluna nova), então pode ir antes do deploy.
-- Aplicar ANTES do deploy do código que lê
--   `lojas.fundador_promo_em` (a /planos seleciona a coluna; sem ela o select
--   da loja falha e a tela fica sem loja).
--
-- Regra (panfleto): R$ 29,90/mês só para os 100 primeiros comerciantes
-- cadastrados, e só nos 2 primeiros meses de assinatura; depois R$ 54,90.
-- O prazo é cobrado na Stripe por cupom `repeating` de 2 meses
-- (app/lib/stripeMensalidade.ts); aqui ficam as três peças de banco:
--
--   1. `fundador_vagas` — registro das vagas que NÃO some com a exclusão da
--      loja (sem FK de propósito). Loja apagada não libera vaga. Antes a regra
--      era `count(*) from lojas < 100`: cada loja apagada abria uma vaga nova.
--   2. `lojas.fundador_promo_em` — marca PERMANENTE de que a loja já usou os
--      2 meses. Gravada pelo webhook (service role) na 1ª assinatura com o
--      preço fundador; cancelar e assinar de novo não repete o benefício.
--   3. Furo fechado: `lojas.fundador` não era protegido — o dono podia mandar
--      `fundador=true` no INSERT (passada a vaga 100) ou num PATCH a qualquer
--      momento e assinar a R$ 29,90. Agora o trigger decide no INSERT
--      (ignorando o que o cliente mandou) e o UPDATE de anon/authenticated
--      congela `fundador` e `fundador_promo_em`.
--
-- Funções recriadas a partir do corpo VIVO (conferido por md5 abaixo — se o
-- banco mudou desde a leitura, o script aborta em vez de sobrescrever):
--   auto_set_fundador()                 11a05a8319de07a1ef40b7537f4041d6
--   lojas_bloqueia_cobranca_cliente()   4bea142e17da1c8fa9b45ea59ac4ca29
-- Ordem dos BEFORE INSERT em lojas (alfabética): trg_auto_fundador roda antes
-- de trg_lojas_bloqueia_cobranca.
-- =============================================================================

begin;

do $$
begin
  if md5(pg_get_functiondef('public.auto_set_fundador'::regproc)) <> '11a05a8319de07a1ef40b7537f4041d6' then
    raise exception 'auto_set_fundador mudou desde a leitura — puxe o corpo vivo de novo';
  end if;
  if md5(pg_get_functiondef('public.lojas_bloqueia_cobranca_cliente'::regproc)) <> '4bea142e17da1c8fa9b45ea59ac4ca29' then
    raise exception 'lojas_bloqueia_cobranca_cliente mudou desde a leitura — puxe o corpo vivo de novo';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Registro de vagas
-- ---------------------------------------------------------------------------
create table if not exists public.fundador_vagas (
  ordem     bigint generated always as identity primary key,
  -- Sem FK para lojas: a linha fica quando a loja é apagada (a vaga não volta).
  loja_id   uuid not null unique,
  criada_em timestamptz not null default now()
);

alter table public.fundador_vagas enable row level security;
-- Nenhuma policy: só service role (/api/planos/vagas, /fundadores, admin) lê.
revoke all on public.fundador_vagas from anon, authenticated;

-- Backfill: as lojas fundadoras que existem hoje, na ordem de cadastro.
-- (As que já foram apagadas antes deste script não têm como ser recuperadas.)
insert into public.fundador_vagas (loja_id, criada_em)
select id, created_at from public.lojas
where fundador
order by created_at
on conflict (loja_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Marca permanente dos 2 meses
-- ---------------------------------------------------------------------------
alter table public.lojas add column if not exists fundador_promo_em timestamptz;
comment on column public.lojas.fundador_promo_em is
  'Quando a loja começou a assinatura com o preço fundador (R$ 29,90 por 2 meses). Não nulo = benefício já usado, para sempre. Só service role escreve.';

-- ---------------------------------------------------------------------------
-- 3a. Quem é fundador: decide pelo registro de vagas, nunca pelo cliente
-- ---------------------------------------------------------------------------
create or replace function public.auto_set_fundador()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare cnt integer;
begin
  -- Fila única: dois cadastros simultâneos não ocupam a vaga 100 juntos.
  perform pg_advisory_xact_lock(hashtext('fundador_vagas'));
  select count(*) into cnt from fundador_vagas;
  if cnt < 100 then
    new.fundador := true;
    -- Some junto se o INSERT da loja falhar (mesma transação).
    insert into fundador_vagas (loja_id) values (new.id) on conflict (loja_id) do nothing;
  else
    new.fundador := false;
  end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3b. Dono não escreve fundador / fundador_promo_em
-- ---------------------------------------------------------------------------
create or replace function public.lojas_bloqueia_cobranca_cliente()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if tg_op = 'INSERT' then
    new.plano := 'inativo';
    new.stripe_subscription_id := null;
    new.mp_assinatura_id := null;
    new.assinatura_ciclos := 0;
    new.fundador_promo_em := null;
    -- Trial é de fábrica: 3 dias a partir de agora, mande o cliente o que mandar.
    -- Exceto para documento de conta excluída há menos de 2 anos: apagar e
    -- recriar não zera o teste (exclusoes_conta.hash_documento).
    if public.documento_em_quarentena(new.documento) then
      new.trial_expira_em := now();
    else
      new.trial_expira_em := now() + interval '3 days';
    end if;
  elsif tg_op = 'UPDATE' then
    new.plano := old.plano;
    new.stripe_subscription_id := old.stripe_subscription_id;
    new.mp_assinatura_id := old.mp_assinatura_id;
    new.assinatura_ciclos := old.assinatura_ciclos;
    -- Só service role estende ou encerra o teste.
    new.trial_expira_em := old.trial_expira_em;
    -- Preço fundador: a vaga é decidida no cadastro e o uso dos 2 meses é
    -- marcado pelo webhook. O dono não liga nem rearma nenhum dos dois.
    new.fundador := old.fundador;
    new.fundador_promo_em := old.fundador_promo_em;
  end if;
  return new;
end; $function$;

commit;

-- ---------------------------------------------------------------------------
-- Conferência pós-aplicação (rodar e anotar no STATUS):
--   select count(*) from fundador_vagas;                       -- = lojas fundador hoje (7)
--   select count(*) from lojas where fundador_promo_em is not null; -- 0
--   select md5(pg_get_functiondef('public.auto_set_fundador'::regproc));
--   select md5(pg_get_functiondef('public.lojas_bloqueia_cobranca_cliente'::regproc));
-- E via REST com JWT do dono (regra 12): PATCH lojas fundador=false→true e
-- fundador_promo_em=null não mudam nada (.select() devolve os valores antigos).
-- ---------------------------------------------------------------------------
