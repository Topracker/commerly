-- ============================================================================
-- Separa o que o CLIENTE paga do que o ENTREGADOR recebe — 2026-11-26
-- APLICADO em produção em 2026-11-26 (via MCP do Supabase).
-- Substitui a decisão de sql/2026-11-26-corrida-nova-formula.sql (lá as duas
-- coisas ainda eram o mesmo número).
-- ----------------------------------------------------------------------------
--   taxa_entrega  (cliente paga)     = calcular_taxa_entrega(d)
--                                    = R$4 + R$1,50/km, mínimo R$4, teto R$25
--   valor_corrida (entregador recebe) = calcular_valor_corrida(d)
--                                    = R$9 até 2,5 km + R$3/km depois, teto R$45
--   Pico (sex/sáb/dom 18-22h): ×1,3 nos DOIS (o entregador sempre ganhou o surge).
--   valor_corrida nunca fica abaixo da taxa (greatest).
--   A DIFERENÇA é da Commerly:
--     - online:  a plataforma retém taxa + gorjeta (destination charge) e o
--                transfer paga valor_corrida + gorjeta → sai do saldo Stripe
--                da plataforma (lib/repasse.ts; balance_insufficient vira
--                "repasse travado" e o cron diário tenta de novo).
--     - dinheiro: o entregador fica com a taxa na porta e o ledger
--                acertos_dinheiro registra commerly → entregador
--                'complemento_corrida' (antes o mesmo caminho só existia como
--                'bonus_festa').
--     - vale:    a loja paga a taxa (repasse_entregador) e a Commerly o
--                complemento (novo — antes não existia no vale).
--   O admin quita em Acertos (de_papel = 'commerly', igual ao bônus da festa).
--
-- Teto do cliente: R$25 (o mesmo de antes). A instrução foi "R$4 + R$1,50/km,
-- não mudar isso"; o teto antigo foi mantido para o cliente não pagar mais em
-- corrida longa do que pagava.
--
-- Pico do pedido ONLINE: o guard não recalcula a taxa paga (V2); detecta se o
-- surge foi cobrado comparando a taxa paga com a do horário normal (> 1,15×).
--
-- Guard e acertos: replace() sobre o corpo VIVO, âncoras conferidas únicas.
-- Espelho TS: TAXA_ENTREGA / CORRIDA_ENTREGADOR em app/lib/geo.ts.
-- ============================================================================

create or replace function public.calcular_taxa_entrega(dist_km numeric)
returns numeric language plpgsql immutable set search_path to 'public' as $function$
begin
  -- Preço de mercado para o CLIENTE (iFood/99): R$4 + R$1,50/km, teto R$25.
  return round(least(25, greatest(4, 4 + 1.5 * coalesce(dist_km, 0))), 2);
end; $function$;

create or replace function public.calcular_valor_corrida(dist_km numeric)
returns numeric language plpgsql immutable set search_path to 'public' as $function$
begin
  -- O que o ENTREGADOR recebe: R$9 até 2,5 km + R$3/km acima, teto R$45.
  return round(least(45, 9 + 3 * greatest(0, coalesce(dist_km, 0) - 2.5)), 2);
end; $function$;

alter table public.acertos_dinheiro drop constraint if exists acertos_dinheiro_tipo_check;
alter table public.acertos_dinheiro add constraint acertos_dinheiro_tipo_check check (tipo = any (array[
  'cobranca', 'repasse_loja', 'repasse_entregador', 'bonus_festa', 'complemento_corrida', 'cupom_garantia', 'estorno']));

-- Guard: valor_corrida deixa de ser cópia da taxa (só no ramo não-festa).
do $$
declare
  v_def text := pg_get_functiondef('public.pedidos_clientes_guard'::regproc);
  a text := 'new.valor_corrida := new.taxa_entrega;';
  b text := 'new.valor_corrida := greatest(new.taxa_entrega, round(public.calcular_valor_corrida(dist) * '
         || '(case when new.taxa_entrega > public.calcular_taxa_entrega(dist) * 1.15 then 1.3 else 1 end), 2));';
  n int;
begin
  if position('calcular_valor_corrida' in v_def) > 0 then raise notice 'guard já separado'; return; end if;
  n := (length(v_def) - length(replace(v_def, a, ''))) / length(a);
  if n <> 1 then raise exception 'âncora do guard não é única (%)', n; end if;
  execute replace(v_def, a, b);
end $$;

-- Acertos: complemento da Commerly no dinheiro (rótulo próprio) e no vale (novo).
do $$
declare
  v_def text := pg_get_functiondef('public.acertos_gerar_na_entrega'::regproc);
  a1 text := '''commerly'', ''entregador'', ''bonus_festa'', v_bonus';
  b1 text := '''commerly'', ''entregador'', case when new.festa_id is not null then ''bonus_festa'' else ''complemento_corrida'' end, v_bonus';
  a2 text := 'v_repasse := round(coalesce(new.taxa_entrega, 0), 2);';
  b2 text := a2 || '
      -- Complemento da Commerly (2026-11-26): corrida do entregador > taxa do cliente.
      v_bonus := round(coalesce(new.valor_corrida, 0) - coalesce(new.taxa_entrega, 0), 2);
      if v_bonus > 0 then
        insert into public.acertos_dinheiro (pedido_id, festa_id, loja_id, entregador_id, cliente_id, de_papel, para_papel, tipo, valor, origem)
        values (new.id, new.festa_id, new.loja_id, new.entregador_id, new.cliente_id, ''commerly'', ''entregador'',
                case when new.festa_id is not null then ''bonus_festa'' else ''complemento_corrida'' end, v_bonus, ''trigger_entregue'')
        on conflict do nothing;
      end if;';
  n1 int; n2 int;
begin
  if position('complemento_corrida' in v_def) > 0 then raise notice 'acertos já tem complemento'; return; end if;
  n1 := (length(v_def) - length(replace(v_def, a1, ''))) / length(a1);
  n2 := (length(v_def) - length(replace(v_def, a2, ''))) / length(a2);
  if n1 <> 1 or n2 <> 1 then raise exception 'âncoras de acertos não únicas (% / %)', n1, n2; end if;
  execute replace(replace(v_def, a1, b1), a2, b2);
end $$;
