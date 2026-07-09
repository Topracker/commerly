-- Clube Commerly: o guard de pedidos_clientes passa a validar o resgate de
-- pontos contra o saldo GLOBAL do cliente (soma de todas as lojas), e não mais
-- contra o saldo da loja do pedido. Só essa checagem mudou; o resto da função
-- é idêntico ao anterior.
--
-- Aplicado em produção em 2026-07-10.

create or replace function public.pedidos_clientes_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
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
    new.tempo_preparo_min := coalesce(new.tempo_preparo_min, loja_tempo, 30);
    dist := public.haversine_km(loja_lat, loja_lng, new.entrega_latitude, new.entrega_longitude);
    new.distancia_km := dist;
    new.taxa_entrega := public.calcular_taxa_entrega(dist);
    if public.eh_horario_pico(now()) then
      new.taxa_entrega := round(new.taxa_entrega * 1.3, 2);
    end if;
    new.valor_corrida := new.taxa_entrega;
    if dist is not null and max_dist is not null and dist > max_dist then
      raise exception 'Endereco fora da area de entrega. Esta loja entrega ate % km.', max_dist using errcode = 'P0001';
    end if;
    if coalesce(new.pontos_usados, 0) > 0 then
      -- Clube Commerly: os pontos valem em QUALQUER loja, então o saldo
      -- verificado é o global do cliente, não o desta loja.
      select coalesce(sum(pontos), 0) into saldo_atual
        from public.pontos_clientes where cliente_id = new.cliente_id;
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
end;
$$;
