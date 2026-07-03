-- Taxa de entrega DINÂMICA por km (modelo iFood).
--
-- Substitui a tabela de faixas (5/8/12/15) por um cálculo proporcional:
--   taxa = base + (preço_por_km * distância_km)
--   base           = R$ 3,00
--   preço por km    = R$ 1,00   (proporcional, com casas decimais)
--   mínimo          = R$ 3,00
--   máximo          = R$ 25,00
--
-- Exemplos:
--   2,3 km  -> 3,00 + 2,30 = R$ 5,30
--   8,7 km  -> 3,00 + 8,70 = R$ 11,70
--   0 km / sem coords -> R$ 3,00 (base = mínimo)
--   30 km   -> teto R$ 25,00
--
-- Só a função `calcular_taxa_entrega` muda. O trigger
-- `pedidos_clientes_guard` já chama essa função no INSERT, então passa a usar
-- o novo valor automaticamente (não precisa recriar o trigger).
--
-- Rode no SQL Editor do Supabase (produção). Idempotente.

create or replace function public.calcular_taxa_entrega(dist_km numeric)
returns numeric
language sql immutable as $$
  select round(
    least(25, greatest(3, 3 + 1 * coalesce(dist_km, 0)))::numeric
  , 2)
$$;

-- ---------------------------------------------------------------------------
-- Verificação (rode manualmente após aplicar):
--   select public.calcular_taxa_entrega(2.3);   -- 5.30
--   select public.calcular_taxa_entrega(8.7);   -- 11.70
--   select public.calcular_taxa_entrega(0);     -- 3.00
--   select public.calcular_taxa_entrega(null);  -- 3.00
--   select public.calcular_taxa_entrega(30);    -- 25.00
-- ---------------------------------------------------------------------------
