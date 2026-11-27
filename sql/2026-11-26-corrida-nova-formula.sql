-- ============================================================================
-- Nova fórmula da corrida do entregador — 2026-11-26
-- APLICADO em produção em 2026-11-26 (via MCP do Supabase).
-- ----------------------------------------------------------------------------
-- Onde mora o valor: o guard `pedidos_clientes_guard` faz
--     taxa_entrega := calcular_taxa_entrega(dist)   (×1,3 no pico)
--     valor_corrida := taxa_entrega
-- ou seja, a taxa que o cliente paga é 100% do entregador. Trocar a fórmula
-- aqui troca as duas coisas juntas — e por isso o Caminho B (dinheiro) não
-- gera "bonus_festa" (só nasce quando valor_corrida > taxa_entrega).
--
-- Corpo VIVO antes (md5 ff455a996d25baec5e62ad7885636926):
--     round(least(25, greatest(3, 3 + 1 * coalesce(dist_km, 0))), 2)
--
-- Agora (decisão dentro da faixa pedida, R$8-10 fixo + R$3/km após 2-3 km):
--     R$ 9,00 fixos até 2,5 km + R$ 3,00 por km acima disso, teto R$ 45,00
--     1 km → 9,00 | 2,5 km → 9,00 | 4 km → 13,50 | 8 km → 25,50 | 14,5+ km → 45,00
--     (iFood/99 ~ R$ 7,50 até 4 km + R$ 1,50/km: 4 km → 7,50 | 8 km → 13,50)
-- O teto (antes R$ 25) subiu para não cortar o R$3/km em distância média; o
-- raio máximo de cada loja (distancia_maxima_entrega) continua valendo.
--
-- Espelho em TS: TAXA_ENTREGA / taxaEntregaPorDistancia em app/lib/geo.ts
-- (prévia do PedidoModal, valor cobrado no pedido-checkout e rateio da festa).
-- ============================================================================

create or replace function public.calcular_taxa_entrega(dist_km numeric)
returns numeric language plpgsql immutable set search_path to 'public' as $function$
begin
  return round(least(45, 9 + 3 * greatest(0, coalesce(dist_km, 0) - 2.5)), 2);
end; $function$;

-- Conferência:
--   select d, calcular_taxa_entrega(d) from unnest(array[null,0,1,2.5,3,4,8,20]::numeric[]) d;
