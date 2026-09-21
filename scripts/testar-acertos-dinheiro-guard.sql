-- Testes do guard + trigger do ledger (sql/2026-09-20-acertos-dinheiro.sql).
-- Rode INTEIRO via MCP/SQL Editor: termina em RAISE EXCEPTION com o RESULTADO,
-- então NADA persiste (padrão DO/ROLLBACK da memória clube_pontos_na_entrega).
-- auth.role() é dirigido por request.jwt.claims; RLS NÃO é testada aqui
-- (para isso: scripts/testar-acertos-dinheiro.mjs, REST com JWT real).
--
-- Resultado obtido em 2026-09-20 (pós-migração):
--   A1 metodo=entrega status=pendente troco=200.00 | B1 levantou
--   OF1 "Corrida de Burger House a 1.2 km · 💵 dinheiro, cobrar R$ 13,73, troco para R$ 200,00. Aceite em 30s."
--   C1 loja anon: status=pendente corrida=pendente troco=200.00
--   D1 sem entregador: pag=pago acertos=1 [cliente>loja:cobranca] confAuto=1
--   D2 com entregador: pag=pendente corrida=pago acertos=2 [cobranca, repasse_loja] notifs=2
--   E1 barrado | F1 festa: 3 acertos (bonus_festa=1.00) | G1 cupom: cupom_garantia=2.00
--   G2 pago | G3 pago->pendente: pago (barrado) | G4 pago->estornado: estornado
--   H1 preco item A=6.90 (forjado 0.01 reescrito)
do $$
declare
  r text := '';
  v_loja uuid := '36d99f1f-07c7-4dae-ad97-15765bb62533';
  v_loja_user uuid; v_cli uuid; v_cli_user uuid; v_ent uuid; v_ent_user uuid; v_prod uuid;
  a uuid; b uuid; c uuid; d uuid; v_festa uuid; v_cupom uuid; v_of uuid;
  p record; n int; n2 int; t text;
begin
  select user_id into v_loja_user from lojas where id = v_loja;
  select c2.id, c2.user_id into v_cli, v_cli_user from clientes c2 join auth.users u on u.id=c2.user_id where u.email='cliente@teste.com';
  select e.id, e.user_id into v_ent, v_ent_user from entregadores e join auth.users u on u.id=e.user_id where u.email='entregador@teste.com';
  select id into v_prod from produtos where loja_id = v_loja and preco_venda > 0 order by preco_venda limit 1;
  update lojas set horario = null, plano = 'ativo' where id = v_loja;

  -- papel: cliente (authenticated)
  perform set_config('request.jwt.claims', json_build_object('role','authenticated','sub',v_cli_user)::text, true);
  perform set_config('request.jwt.claim.role','authenticated', true);
  perform set_config('request.jwt.claim.sub', v_cli_user::text, true);

  -- A1: cliente tenta se declarar online/pago, com preço forjado e troco 200
  insert into pedidos_clientes (loja_id, cliente_id, itens, total, endereco_entrega, entrega_latitude, entrega_longitude, pagamento_metodo, pagamento_status, troco_para)
  values (v_loja, v_cli, jsonb_build_array(jsonb_build_object('produto_id', v_prod, 'nome','x','quantidade',1,'preco',0.01)), 0.01, 'Rua Teste 1', -16.68, -49.25, 'online', 'pago', 200)
  returning id into a;
  select * into p from pedidos_clientes where id = a;
  r := r || format('A1 metodo=%s status=%s total=%s troco=%s | ', p.pagamento_metodo, p.pagamento_status, p.total, p.troco_para);

  -- B1: troco menor que o total
  begin
    insert into pedidos_clientes (loja_id, cliente_id, itens, endereco_entrega, entrega_latitude, entrega_longitude, troco_para)
    values (v_loja, v_cli, jsonb_build_array(jsonb_build_object('produto_id', v_prod, 'quantidade',1)), 'Rua Teste 1', -16.68, -49.25, 1);
    r := r || 'B1 NAO levantou!! | ';
  exception when others then r := r || 'B1 levantou | ';
  end;

  -- pedido B: sem troco (a loja vai entregar ela mesma)
  insert into pedidos_clientes (loja_id, cliente_id, itens, endereco_entrega, entrega_latitude, entrega_longitude)
  values (v_loja, v_cli, jsonb_build_array(jsonb_build_object('produto_id', v_prod, 'quantidade',2)), 'Rua Teste 2', -16.68, -49.25)
  returning id into b;

  -- OF1: push da oferta com dinheiro/troco (service role)
  perform set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  perform set_config('request.jwt.claim.role','service_role', true);
  perform set_config('request.jwt.claim.sub', '', true);
  insert into corrida_ofertas (pedido_id, entregador_id, loja_id, status, distancia_km, expira_em)
  values (a, v_ent, v_loja, 'pendente', 1.2, now() + interval '30 seconds') returning id into v_of;
  select mensagem into t from notificacoes where tipo='corrida_oferta' and dados->>'oferta_id' = v_of::text;
  r := r || format('OF1 push oferta: "%s" | ', t);
  update corrida_ofertas set status='expirada' where id = v_of;

  -- C1: loja (authenticated) tenta mexer em pagamento
  perform set_config('request.jwt.claims', json_build_object('role','authenticated','sub',v_loja_user)::text, true);
  perform set_config('request.jwt.claim.role','authenticated', true);
  perform set_config('request.jwt.claim.sub', v_loja_user::text, true);
  update pedidos_clientes set pagamento_status = 'pago', pagamento_corrida = 'pago', troco_para = 1 where id = a;
  select * into p from pedidos_clientes where id = a;
  r := r || format('C1 loja anon: status=%s corrida=%s troco=%s | ', p.pagamento_status, p.pagamento_corrida, p.troco_para);

  -- D1: loja avança B até entregue sem entregador
  update pedidos_clientes set status = 'preparando' where id = b;
  update pedidos_clientes set status = 'saiu' where id = b;
  update pedidos_clientes set status = 'entregue' where id = b;
  select * into p from pedidos_clientes where id = b;
  select count(*), string_agg(de_papel||'>'||para_papel||':'||tipo||'='||valor, ',') into n, t from acertos_dinheiro where pedido_id = b;
  select count(*) into n2 from acertos_confirmacoes ac join acertos_dinheiro ad on ad.id = ac.acerto_id where ad.pedido_id = b and ac.origem='auto';
  r := r || format('D1 sem entregador: pag=%s acertos=%s [%s] confAuto=%s | ', p.pagamento_status, n, t, n2);

  -- D2: pedido C com entregador (service role)
  perform set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  perform set_config('request.jwt.claim.role','service_role', true);
  perform set_config('request.jwt.claim.sub', '', true);
  insert into pedidos_clientes (loja_id, cliente_id, itens, endereco_entrega, entrega_latitude, entrega_longitude, troco_para)
  values (v_loja, v_cli, jsonb_build_array(jsonb_build_object('produto_id', v_prod, 'quantidade',1)), 'Rua Teste 3', -16.68, -49.25, 100)
  returning id into c;
  update pedidos_clientes set entregador_id = v_ent where id = c;
  update pedidos_clientes set status = 'preparando' where id = c;
  update pedidos_clientes set status = 'saiu' where id = c;
  update pedidos_clientes set status = 'entregue' where id = c;
  select * into p from pedidos_clientes where id = c;
  select count(*), string_agg(de_papel||'>'||para_papel||':'||tipo||'='||valor, ',' order by tipo) into n, t from acertos_dinheiro where pedido_id = c;
  select count(*) into n2 from notificacoes where tipo='acerto' and dados->>'pedido_id' = c::text;
  r := r || format('D2 com entregador: pag=%s corrida=%s acertos=%s [%s] notifs=%s | ', p.pagamento_status, p.pagamento_corrida, n, t, n2);

  -- E1: imutabilidade vale até para service role
  begin
    update acertos_dinheiro set valor = 1 where pedido_id = c; r := r || 'E1 UPDATE passou!! | ';
  exception when others then r := r || 'E1 barrado | '; end;

  -- F1: festa em dinheiro gera o bônus (valor_corrida 6 − taxa 5)
  insert into festas (criador_cliente_id, nome, codigo, endereco_entrega, entrega_latitude, entrega_longitude, status)
  values (v_cli, 'Teste', 'ZZTEST', 'Rua Festa', -16.68, -49.25, 'fechada') returning id into v_festa;
  insert into pedidos_clientes (loja_id, cliente_id, festa_id, itens, endereco_entrega, entrega_latitude, entrega_longitude, taxa_entrega, valor_corrida, pagamento_metodo, pagamento_status)
  values (v_loja, v_cli, v_festa, jsonb_build_array(jsonb_build_object('produto_id', v_prod, 'quantidade',1)), 'Rua Festa', -16.68, -49.25, 5, 6, 'entrega', 'pendente')
  returning id into d;
  update pedidos_clientes set entregador_id = v_ent where id = d;
  update pedidos_clientes set status = 'preparando' where id = d;
  update pedidos_clientes set status = 'saiu' where id = d;
  update pedidos_clientes set status = 'entregue' where id = d;
  select count(*), string_agg(de_papel||'>'||para_papel||':'||tipo||'='||valor, ',' order by tipo) into n, t from acertos_dinheiro where pedido_id = d;
  r := r || format('F1 festa: acertos=%s [%s] | ', n, t);

  -- G: cupom da Garantia em A + pagamento_status por service role
  insert into cupons (codigo, cliente_id, tipo, valor, origem) values ('DESCULPA-ZZTEST', v_cli, 'valor', 2, 'garantia') returning id into v_cupom;
  insert into cupom_usos (cupom_id, pedido_id, loja_id, base, desconto, custeado_por) values (v_cupom, a, v_loja, 10, 2, 'plataforma');
  update pedidos_clientes set entregador_id = v_ent where id = a;
  update pedidos_clientes set status = 'preparando' where id = a;
  update pedidos_clientes set status = 'saiu' where id = a;
  update pedidos_clientes set status = 'entregue' where id = a;
  select count(*), string_agg(de_papel||'>'||para_papel||':'||tipo||'='||valor, ',' order by tipo) into n, t from acertos_dinheiro where pedido_id = a;
  r := r || format('G1 cupom: acertos=%s [%s] | ', n, t);
  update pedidos_clientes set pagamento_status = 'pago' where id = a;
  select pagamento_status into t from pedidos_clientes where id = a;
  r := r || format('G2 service pago: %s | ', t);
  update pedidos_clientes set pagamento_status = 'pendente' where id = a;
  select pagamento_status into t from pedidos_clientes where id = a;
  r := r || format('G3 pago->pendente: %s | ', t);
  update pedidos_clientes set pagamento_status = 'estornado' where id = a;
  select pagamento_status into t from pedidos_clientes where id = a;
  r := r || format('G4 pago->estornado: %s | ', t);

  -- H1: preço autoritativo continua de pé (regressão do guard)
  r := r || format('H1 preco item A=%s (forjado 0.01) | ', (select itens->0->>'preco' from pedidos_clientes where id = a));

  raise exception 'RESULTADO: %', r;
end $$;
