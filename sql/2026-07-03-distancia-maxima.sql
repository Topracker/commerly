-- Distância máxima de entrega configurável por loja.
--
-- O comerciante define, nas Configurações (nichos de delivery), até quantos km
-- a loja entrega (1 a 50, padrão 10). Pedidos com distância loja→cliente acima
-- do limite são bloqueados no app (UX) E no trigger (anti-burla).
--
-- Rode no SQL Editor do Supabase (produção). Idempotente.
-- OBS: recria pedidos_clientes_guard e lojas_publicas — os
-- 2026-07-03-taxa-distancia.sql e 2026-07-03-pagamento-pedido.sql já devem
-- ter sido aplicados (este script parte da versão mais recente do guard/view).

-- ===========================================================================
-- 1. Coluna na loja (padrão 10 km).
-- ===========================================================================
alter table public.lojas
  add column if not exists distancia_maxima_entrega numeric(5,1) not null default 10
    check (distancia_maxima_entrega >= 1 and distancia_maxima_entrega <= 50);

-- ===========================================================================
-- 2. GUARD reescrito: além de recalcular distância/taxa/total e travar os
--    campos imutáveis, agora REJEITA o INSERT se a distância ultrapassar a
--    distância máxima da loja (anti-burla). SECURITY DEFINER p/ ler a loja.
-- ===========================================================================
create or replace function public.pedidos_clientes_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  loja_lat double precision;
  loja_lng double precision;
  max_dist numeric;
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

    select coalesce(sum(
             (e->>'preco')::numeric * (e->>'quantidade')::numeric
           ), 0)
      into subtotal
      from jsonb_array_elements(coalesce(new.itens, '[]'::jsonb)) e;

    select latitude, longitude, distancia_maxima_entrega
      into loja_lat, loja_lng, max_dist
      from public.lojas where id = new.loja_id;

    dist := public.haversine_km(loja_lat, loja_lng, new.entrega_latitude, new.entrega_longitude);

    -- Anti-burla: fora da área de entrega -> rejeita o pedido.
    if dist is not null and max_dist is not null and dist > max_dist then
      raise exception 'Endereço fora da área de entrega. Esta loja entrega até % km.', max_dist
        using errcode = 'P0001';
    end if;

    new.distancia_km  := dist;
    new.taxa_entrega  := public.calcular_taxa_entrega(dist);
    new.valor_corrida := new.taxa_entrega;
    new.total         := subtotal + new.taxa_entrega;

  elsif tg_op = 'UPDATE' then
    new.loja_id := old.loja_id;
    new.cliente_id := old.cliente_id;
    new.itens := old.itens;
    new.total := old.total;
    new.taxa_entrega := old.taxa_entrega;
    new.valor_corrida := old.valor_corrida;
    new.distancia_km := old.distancia_km;
    new.entrega_latitude := old.entrega_latitude;
    new.entrega_longitude := old.entrega_longitude;
    new.endereco_entrega := old.endereco_entrega;
    new.observacao := old.observacao;
    new.cliente_nome := old.cliente_nome;
    new.cliente_telefone := old.cliente_telefone;
    new.created_at := old.created_at;
    new.updated_at := now();
    -- Pagamento imutável após a criação.
    new.pagamento_metodo := old.pagamento_metodo;
    new.pagamento_status := old.pagamento_status;
    new.stripe_session_id := old.stripe_session_id;
    new.stripe_payment_intent := old.stripe_payment_intent;
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

-- ===========================================================================
-- 3. VIEW PÚBLICA recriada: expõe distancia_maxima_entrega pro app do cliente.
-- ===========================================================================
drop view if exists public.lojas_publicas;
create view public.lojas_publicas
  with (security_invoker = false) as
  select id, nome, tipo, localizacao, telefone, instagram, horario,
         latitude, longitude, fotos_fachada, taxa_entrega, created_at,
         (stripe_onboarded and stripe_account_id is not null) as aceita_pagamento_online,
         distancia_maxima_entrega
  from public.lojas;

grant select on public.lojas_publicas to anon, authenticated;

-- ===========================================================================
-- 4. Verificação (rode manualmente após aplicar):
--   select column_name from information_schema.columns
--     where table_name='lojas' and column_name='distancia_maxima_entrega';
--   select distancia_maxima_entrega from public.lojas_publicas limit 1;
--   -- Deve falhar (fora da área) se a loja tiver max menor que a distância:
--   -- insert into pedidos_clientes(loja_id, cliente_id, itens, endereco_entrega,
--   --   entrega_latitude, entrega_longitude) values (...);
-- ===========================================================================
