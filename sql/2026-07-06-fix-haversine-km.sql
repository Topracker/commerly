-- Hotfix (2026-07-06): funcao public.haversine_km ausente em producao.
--
-- Sintoma: qualquer INSERT em public.pedidos_clientes falha com
--   "function public.haversine_km(double precision, double precision,
--    double precision, double precision) does not exist"
-- ou seja: o cliente NAO consegue fazer nenhum pedido de delivery.
--
-- Causa: migracao parcial. O trigger `pedidos_clientes_guard` (que chama
-- haversine_km no INSERT para calcular a distancia loja->entrega) foi
-- aplicado, mas a funcao auxiliar `haversine_km` nunca foi criada em
-- producao. A `calcular_taxa_entrega` (modelo dinamico por km) ja existe.
--
-- Idempotente. Rode no SQL Editor do Supabase (producao).

create or replace function public.haversine_km(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns numeric
language sql immutable as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else round((2 * 6371 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) *
      power(sin(radians(lng2 - lng1) / 2), 2)
    )))::numeric, 3)
  end
$$;

-- Verificacao (rode manualmente apos aplicar):
--   select public.haversine_km(-16.585,-49.331,-16.588,-49.334);  -- ~0.4 km
--   select public.calcular_taxa_entrega(
--     public.haversine_km(-16.585,-49.331,-16.588,-49.334));       -- taxa
