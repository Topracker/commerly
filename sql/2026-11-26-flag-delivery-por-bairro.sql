-- ============================================================================
-- Feature flag `delivery` por BAIRRO (só Goiânia por enquanto) — 2026-11-26
-- APLICADO em produção em 2026-11-26 (via MCP do Supabase).
-- ----------------------------------------------------------------------------
-- DECISÕES DE DESENHO
--
-- 1. Recorte A MAIS dentro da cidade. `feature_flags.bairro` (slug, nullable):
--    null = vale para a cidade toda, exatamente como antes. Precedência:
--        bairro da loja  →  cidade da loja  →  __global__  →  padrão (ligado)
--    Para lançar 2 bairros: Goiânia (cidade) fica OFF e cada bairro ganha uma
--    linha ON. Nenhuma outra cidade é afetada.
--
-- 2. O bairro que conta é o da LOJA (`lojas.bairro_slug`), não o do cliente.
--    Motivo: é o único endereço estruturado e confiável que temos (vem do
--    autocomplete/geocode e passa por /api/loja/cidade). O endereço do cliente
--    é texto livre no pedido e o raio de entrega da loja já limita até onde
--    ela vai. "Lançar o bairro X" = as lojas do bairro X passam a vender.
--
-- 3. Só Goiânia e só a flag `delivery` aceitam bairro (CHECK abaixo). Para
--    abrir outra cidade por bairro, relaxe o CHECK e nada mais muda.
--
-- 4. `lojas.bairro`/`bairro_slug` só o service role escreve (mesmo espírito de
--    `oculta`): se o dono pudesse gravar o bairro, se "mudava" para um bairro
--    liberado. Trocar o endereço pelo app ZERA o bairro (falha fechada) até
--    /api/loja/cidade resolver de novo.
--
-- 5. A unicidade passou de (cidade_slug, flag) para (cidade_slug, flag, bairro)
--    com NULLS NOT DISTINCT — senão duas linhas "cidade toda" seriam aceitas.
--    O upsert do admin usa onConflict 'cidade_slug,flag,bairro'.
--
-- Espelho em TS: app/lib/featureFlags.ts (deliveryAtivoEm / getFlags). Mexeu
-- em um, mexa no outro.
-- ============================================================================

alter table public.feature_flags add column if not exists bairro text;

alter table public.feature_flags drop constraint if exists feature_flags_cidade_slug_flag_key;
create unique index if not exists feature_flags_escopo_key
  on public.feature_flags (cidade_slug, flag, bairro) nulls not distinct;

alter table public.feature_flags drop constraint if exists feature_flags_bairro_so_goiania;
alter table public.feature_flags add constraint feature_flags_bairro_so_goiania
  check (bairro is null or (cidade_slug = 'goiania' and flag = 'delivery' and bairro ~ '^[a-z0-9-]+$'));

-- Bairro da loja (nome bonito + slug que casa com feature_flags.bairro).
alter table public.lojas add column if not exists bairro text;
alter table public.lojas add column if not exists bairro_slug text;
create index if not exists lojas_cidade_bairro_idx on public.lojas (cidade_slug, bairro_slug);

create or replace function public.lojas_bairro_so_servidor()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if auth.role() in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.bairro := null; new.bairro_slug := null;
    elsif new.localizacao is distinct from old.localizacao then
      -- Endereço mudou pelo app: o bairro antigo não vale mais.
      new.bairro := null; new.bairro_slug := null;
    else
      new.bairro := old.bairro; new.bairro_slug := old.bairro_slug;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_lojas_bairro_so_servidor on public.lojas;
create trigger trg_lojas_bairro_so_servidor
  before insert or update on public.lojas
  for each row execute function public.lojas_bairro_so_servidor();

-- Delivery ligado neste (cidade, bairro)? Fonte única no SQL.
create or replace function public.delivery_ativo_em(p_cidade text, p_bairro text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (select ativo from public.feature_flags
      where flag = 'delivery' and p_cidade is not null and p_bairro is not null
        and cidade_slug = p_cidade and bairro = p_bairro),
    (select ativo from public.feature_flags
      where flag = 'delivery' and p_cidade is not null
        and cidade_slug = p_cidade and bairro is null),
    (select ativo from public.feature_flags
      where flag = 'delivery' and cidade_slug = '__global__' and bairro is null),
    true)
$$;

-- Trigger de bloqueio do pedido: corpo VIVO puxado em 2026-11-26, só a leitura
-- da flag trocou para delivery_ativo_em() (antes, com linhas de bairro, o
-- subselect da cidade devolveria várias linhas e o INSERT quebraria).
create or replace function public.bloquear_pedido_delivery_desligado()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_slug text; v_bairro text; v_loja_ativa boolean; v_nome text;
begin
  -- Pedido pago online nasce no webhook da Stripe, DEPOIS da cobranca:
  -- recusar aqui deixa o cliente cobrado e sem pedido. Exige as duas
  -- condicoes (stripe_session_id vem do corpo; auth.role() vem do JWT).
  if nullif(new.stripe_session_id, '') is not null
     and auth.role() = 'service_role' then
    return new;
  end if;

  select cidade_slug, bairro_slug, coalesce(delivery_ativo, true), nome
    into v_slug, v_bairro, v_loja_ativa, v_nome
    from public.lojas where id = new.loja_id;

  if not coalesce(v_loja_ativa, true) then
    raise exception 'A loja % nao esta aceitando pedidos no momento.', coalesce(v_nome, '')
      using errcode = 'check_violation';
  end if;

  -- Bairro > cidade > global (lib/featureFlags.ts deliveryAtivoEm).
  if not public.delivery_ativo_em(v_slug, v_bairro) then
    raise exception 'Delivery indisponivel nesta cidade no momento.' using errcode = 'check_violation';
  end if;
  return new;
end $function$;

-- Conferência pós-aplicação:
--   select public.delivery_ativo_em('goiania', null);          -- false (hoje)
--   select public.delivery_ativo_em('sao-goncalo', 'x');       -- false (global OFF)
