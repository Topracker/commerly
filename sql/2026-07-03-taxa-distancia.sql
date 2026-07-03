-- Taxa de entrega AUTOMÁTICA por distância (delivery).
--
-- O comerciante não define mais a taxa. Ela é calculada no SERVIDOR (banco), a
-- partir da distância real entre a loja e o ponto de entrega do cliente
-- (Haversine), segundo a tabela:
--   até 2 km  = R$ 5
--   2–5 km    = R$ 8
--   5–10 km   = R$ 12
--   acima 10km= R$ 15
--
-- Essa taxa é integralmente a corrida do entregador (valor_corrida) e é paga a
-- ele via Stripe Connect quando a entrega é confirmada com o código de 4
-- dígitos (rota /api/entregador/confirmar-entrega).
--
-- ANTI-BURLA: taxa_entrega, valor_corrida e total são SEMPRE recalculados pelo
-- trigger no INSERT — qualquer valor enviado pelo cliente é ignorado. O trigger
-- é SECURITY DEFINER para ler as coordenadas da loja (a RLS de `lojas` é
-- owner-only e o cliente não é o dono). No UPDATE, valor_corrida/taxa/total são
-- imutáveis (o entregador não altera a corrida) e o código só é gerado ao sair
-- para entrega.
--
-- Rode no SQL Editor do Supabase (produção), APÓS 2026-07-02-entregadores.sql e
-- 2026-07-02-taxa-entrega.sql. Idempotente.

-- ---------------------------------------------------------------------------
-- 1. Colunas do ponto de entrega + distância congelada no pedido.
-- ---------------------------------------------------------------------------
alter table public.pedidos_clientes
  add column if not exists entrega_latitude  double precision,
  add column if not exists entrega_longitude double precision,
  add column if not exists distancia_km numeric(10,2);

-- ---------------------------------------------------------------------------
-- 2. Haversine em SQL (km). Retorna NULL se faltar alguma coordenada.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3. Tabela de preços da taxa por distância (fonte da verdade no servidor).
--    Sem coordenadas (dist NULL) -> taxa base (faixa até 2 km).
-- ---------------------------------------------------------------------------
create or replace function public.calcular_taxa_entrega(dist_km numeric)
returns numeric
language sql immutable as $$
  select (case
    when dist_km is null then 5
    when dist_km <= 2  then 5
    when dist_km <= 5  then 8
    when dist_km <= 10 then 12
    else 15
  end)::numeric
$$;

-- ---------------------------------------------------------------------------
-- 4. Trigger-guarda reescrito (SECURITY DEFINER).
--
--    INSERT: força status/entregador/código/pagamento seguros; recalcula
--            subtotal (a partir dos itens), distância, taxa, valor_corrida (=
--            taxa) e total = subtotal + taxa. Ignora o que o cliente mandou
--            nesses campos.
--    UPDATE: conteúdo do pedido imutável (itens, total, taxa, valor_corrida,
--            distância, coordenadas, endereço, contato); gera o código ao sair
--            para entrega e o mantém depois. status/entregador/pagamento livres.
-- ---------------------------------------------------------------------------
create or replace function public.pedidos_clientes_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  loja_lat double precision;
  loja_lng double precision;
  dist numeric;
  subtotal numeric;
begin
  if tg_op = 'INSERT' then
    new.status := 'recebido';
    new.entregador_id := null;
    new.codigo_confirmacao := null;
    new.pagamento_corrida := 'pendente';
    new.created_at := now();
    new.updated_at := now();

    -- Subtotal recalculado a partir dos itens (ignora total do cliente).
    select coalesce(sum(
             (e->>'preco')::numeric * (e->>'quantidade')::numeric
           ), 0)
      into subtotal
      from jsonb_array_elements(coalesce(new.itens, '[]'::jsonb)) e;

    -- Coordenadas reais da loja (bypass de RLS via SECURITY DEFINER).
    select latitude, longitude into loja_lat, loja_lng
      from public.lojas where id = new.loja_id;

    dist := public.haversine_km(loja_lat, loja_lng, new.entrega_latitude, new.entrega_longitude);
    new.distancia_km  := dist;
    new.taxa_entrega  := public.calcular_taxa_entrega(dist);
    new.valor_corrida := new.taxa_entrega;      -- taxa integral vai ao entregador
    new.total         := subtotal + new.taxa_entrega;

  elsif tg_op = 'UPDATE' then
    new.loja_id := old.loja_id;
    new.cliente_id := old.cliente_id;
    new.itens := old.itens;
    new.total := old.total;
    new.taxa_entrega := old.taxa_entrega;
    new.valor_corrida := old.valor_corrida;     -- entregador não altera a corrida
    new.distancia_km := old.distancia_km;
    new.entrega_latitude := old.entrega_latitude;
    new.entrega_longitude := old.entrega_longitude;
    new.endereco_entrega := old.endereco_entrega;
    new.observacao := old.observacao;
    new.cliente_nome := old.cliente_nome;
    new.cliente_telefone := old.cliente_telefone;
    new.created_at := old.created_at;
    new.updated_at := now();
    -- Código de confirmação: gera ao sair para entrega; depois imutável.
    if old.codigo_confirmacao is not null and old.codigo_confirmacao <> '' then
      new.codigo_confirmacao := old.codigo_confirmacao;
    elsif new.status = 'saiu' then
      new.codigo_confirmacao := lpad((floor(random() * 10000))::int::text, 4, '0');
    else
      new.codigo_confirmacao := old.codigo_confirmacao;
    end if;
    -- status, entregador_id, pagamento_corrida passam livres.
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pedidos_clientes_guard on public.pedidos_clientes;
create trigger trg_pedidos_clientes_guard
  before insert or update on public.pedidos_clientes
  for each row execute function public.pedidos_clientes_guard();

-- ---------------------------------------------------------------------------
-- 5. Verificação (rode manualmente após aplicar):
--   select public.calcular_taxa_entrega(1.0);   -- 5
--   select public.calcular_taxa_entrega(3.0);   -- 8
--   select public.calcular_taxa_entrega(7.0);   -- 12
--   select public.calcular_taxa_entrega(20.0);  -- 15
--   select public.haversine_km(-16.68,-49.25,-16.70,-49.27); -- ~2.8 km
-- ---------------------------------------------------------------------------
