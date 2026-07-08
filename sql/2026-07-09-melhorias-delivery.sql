-- Melhorias de delivery (2026-07-09):
--   1. Tempo medio de preparo (loja) + override por pedido.
--   2. Taxa dinamica em horario de pico: sex/sab/dom 18h-22h = +30%.
--
-- Os itens 3-6 (reentrega automatica, status "aguardando entregador", rota do
-- entregador, bloqueio de cancelamento) sao 100% de aplicacao/UI e nao mudam o
-- schema (usam entregador_id/status/entregas_localizacao ja existentes).
--
-- Rode no SQL Editor do Supabase (producao). Tudo e idempotente.

-- ===========================================================================
-- 1. TEMPO DE PREPARO
-- ===========================================================================
-- Padrao da loja (delivery). O comerciante ajusta nas configuracoes.
alter table public.lojas add column if not exists tempo_preparo_min int not null default 30;

-- Override por pedido (o comerciante pode ajustar a estimativa de um pedido
-- especifico). Nulo -> herda o padrao da loja no INSERT (snapshot no guard).
alter table public.pedidos_clientes add column if not exists tempo_preparo_min int;

-- ===========================================================================
-- 2. HORARIO DE PICO (surge)
-- ===========================================================================
-- Sexta (5), sabado (6) e domingo (0), das 18h as 22h, no fuso de Sao Paulo.
create or replace function public.eh_horario_pico(ts timestamptz)
returns boolean language sql stable set search_path = public as $$
  select extract(dow  from (ts at time zone 'America/Sao_Paulo'))::int in (0, 5, 6)
     and extract(hour from (ts at time zone 'America/Sao_Paulo'))::int between 18 and 21;
$$;

-- ===========================================================================
-- 3. GUARD recriado: snapshot do tempo de preparo + surge de pico no INSERT.
--    UPDATE inalterado (taxa/valor_corrida continuam imutaveis; tempo_preparo_min
--    passa livre para o comerciante ajustar por pedido).
-- ===========================================================================
create or replace function public.pedidos_clientes_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  loja_lat double precision; loja_lng double precision; max_dist numeric;
  loja_tempo int;
  dist numeric; subtotal numeric; desconto_pts numeric; saldo_atual integer;
begin
  if tg_op = 'INSERT' then
    new.status := 'recebido'; new.entregador_id := null;
    new.codigo_confirmacao := null; new.pagamento_corrida := 'pendente';
    new.created_at := now(); new.updated_at := now();
    select coalesce(sum((e->>'preco')::numeric * (e->>'quantidade')::numeric), 0) into subtotal
      from jsonb_array_elements(coalesce(new.itens, '[]'::jsonb)) e;
    select latitude, longitude, distancia_maxima_entrega, tempo_preparo_min
      into loja_lat, loja_lng, max_dist, loja_tempo
      from public.lojas where id = new.loja_id;
    -- Tempo de preparo: usa o do pedido se enviado, senao o padrao da loja (ou 30).
    new.tempo_preparo_min := coalesce(new.tempo_preparo_min, loja_tempo, 30);
    dist := public.haversine_km(loja_lat, loja_lng, new.entrega_latitude, new.entrega_longitude);
    new.distancia_km := dist;
    new.taxa_entrega := public.calcular_taxa_entrega(dist);
    -- Surge de horario de pico (sex/sab/dom 18-22): +30% na taxa (= corrida).
    if public.eh_horario_pico(now()) then
      new.taxa_entrega := round(new.taxa_entrega * 1.3, 2);
    end if;
    new.valor_corrida := new.taxa_entrega;
    if dist is not null and max_dist is not null and dist > max_dist then
      raise exception 'Endereco fora da area de entrega. Esta loja entrega ate % km.', max_dist using errcode = 'P0001';
    end if;
    if coalesce(new.pontos_usados, 0) > 0 then
      select coalesce(pontos, 0) into saldo_atual from public.pontos_clientes where cliente_id = new.cliente_id and loja_id = new.loja_id;
      if saldo_atual < new.pontos_usados then raise exception 'Saldo de pontos insuficiente.' using errcode = 'P0001'; end if;
      if (new.pontos_usados % 100) <> 0 then raise exception 'Use multiplos de 100 pontos.' using errcode = 'P0001'; end if;
      desconto_pts := (new.pontos_usados / 100.0) * 5.0;
      if desconto_pts > subtotal then desconto_pts := subtotal; end if;
      new.desconto_pontos := desconto_pts;
    else new.desconto_pontos := 0; end if;
    new.total := subtotal + new.taxa_entrega - coalesce(new.desconto_pontos, 0);
  elsif tg_op = 'UPDATE' then
    new.loja_id := old.loja_id; new.cliente_id := old.cliente_id; new.itens := old.itens;
    new.total := old.total; new.taxa_entrega := old.taxa_entrega; new.valor_corrida := old.valor_corrida;
    new.distancia_km := old.distancia_km; new.entrega_latitude := old.entrega_latitude; new.entrega_longitude := old.entrega_longitude;
    new.endereco_entrega := old.endereco_entrega; new.observacao := old.observacao;
    new.cliente_nome := old.cliente_nome; new.cliente_telefone := old.cliente_telefone;
    new.pontos_usados := old.pontos_usados; new.desconto_pontos := old.desconto_pontos;
    new.created_at := old.created_at; new.updated_at := now();
    new.pagamento_metodo := old.pagamento_metodo; new.pagamento_status := old.pagamento_status;
    new.stripe_session_id := old.stripe_session_id; new.stripe_payment_intent := old.stripe_payment_intent;
    if old.codigo_confirmacao is not null and old.codigo_confirmacao <> '' then new.codigo_confirmacao := old.codigo_confirmacao;
    elsif new.status = 'saiu' then new.codigo_confirmacao := lpad((floor(random() * 10000))::integer::text, 4, '0');
    else new.codigo_confirmacao := old.codigo_confirmacao; end if;
  end if;
  return new;
end; $$;

-- ===========================================================================
-- 4. Verificacao (rode manualmente apos aplicar):
--   select column_name from information_schema.columns
--     where table_name='lojas' and column_name='tempo_preparo_min';           -- 1 linha
--   select column_name from information_schema.columns
--     where table_name='pedidos_clientes' and column_name='tempo_preparo_min'; -- 1 linha
--   select public.eh_horario_pico(now());                                     -- t/f
--   -- Ex.: sabado 20h Sao Paulo:
--   select public.eh_horario_pico('2026-07-11 23:00:00+00');                  -- t (20h BRT)
-- ===========================================================================
