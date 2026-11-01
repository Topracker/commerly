-- Testes do vale (sql/2026-10-31-vale-alimentacao.sql). Rode INTEIRO depois
-- da migração (ou colado logo após ela, sem o commit): termina em RAISE
-- EXCEPTION com o RESULTADO, então NADA persiste. auth.role() é dirigido por
-- request.jwt.claims; RLS não é testada aqui.
--
-- Resultado em 2026-10-31 (migração + este bloco numa transação só, em prod,
-- terminando na exceção — nada persistiu):
--   V1 loja sem vale: "Esta loja não aceita vale." | V2 ligar sem bandeira: CHECK
--   V3 bandeira fora: "não aceita essa bandeira" | V4 online/pago forjado →
--   entrega/pendente, forma=vale band=alelo troco=null | V5 pedido comum → dinheiro
--   OF "… · 💳 vale Alelo na maquininha da loja, cobrar R$ 22,68 (pegue a maquininha na loja)…"
--   V6 loja não troca a forma | V7 entregue com entregador: pag=pendente
--   corrida=pendente, acertos [cliente>loja:cobranca, loja>entregador:repasse_entregador]
--   + 2 notificações | V8 confirmações → pago/pago | V9 sem entregador: pago +
--   1 cobrança auto-confirmada | V10 dinheiro inalterado (corrida paga,
--   cobranca+repasse_loja) | V11 view com as colunas; guard md5 228429ef… intocado
do $$
declare
  r text := '';
  v_loja uuid := '36d99f1f-07c7-4dae-ad97-15765bb62533';
  v_loja_user uuid; v_cli uuid; v_cli_user uuid; v_ent uuid; v_ent_user uuid; v_prod uuid;
  a uuid; b uuid; c uuid; v_of uuid; p record; n int; t text;
begin
  select user_id into v_loja_user from lojas where id = v_loja;
  select c2.id, c2.user_id into v_cli, v_cli_user from clientes c2 join auth.users u on u.id=c2.user_id where u.email='cliente@teste.com';
  select e.id, e.user_id into v_ent, v_ent_user from entregadores e join auth.users u on u.id=e.user_id where u.email='entregador@teste.com';
  select id into v_prod from produtos where loja_id = v_loja and preco_venda > 0 order by preco_venda limit 1;
  update lojas set horario = null, plano = 'ativo', aceita_vale = false, vale_bandeiras = '{}' where id = v_loja;

  perform set_config('request.jwt.claims', json_build_object('role','authenticated','sub',v_cli_user)::text, true);

  -- V1: loja não aceita vale
  begin
    insert into pedidos_clientes (loja_id, cliente_id, itens, endereco_entrega, entrega_latitude, entrega_longitude, forma_pagamento, vale_bandeira)
    values (v_loja, v_cli, jsonb_build_array(jsonb_build_object('produto_id', v_prod, 'quantidade',1)), 'Rua V', -16.68, -49.25, 'vale', 'alelo');
    r := r || 'V1 NAO levantou!! | ';
  exception when others then r := r || 'V1 levantou: ' || sqlerrm || ' | '; end;

  -- V2: CHECK da loja: ligar sem bandeira
  begin
    update lojas set aceita_vale = true, vale_bandeiras = '{}' where id = v_loja;
    r := r || 'V2 NAO levantou!! | ';
  exception when others then r := r || 'V2 levantou | '; end;
  update lojas set aceita_vale = true, vale_bandeiras = array['alelo','vr'] where id = v_loja;

  -- V3: bandeira não aceita
  begin
    insert into pedidos_clientes (loja_id, cliente_id, itens, endereco_entrega, entrega_latitude, entrega_longitude, forma_pagamento, vale_bandeira)
    values (v_loja, v_cli, jsonb_build_array(jsonb_build_object('produto_id', v_prod, 'quantidade',1)), 'Rua V', -16.68, -49.25, 'vale', 'caju');
    r := r || 'V3 NAO levantou!! | ';
  exception when others then r := r || 'V3 levantou: ' || sqlerrm || ' | '; end;

  -- V4: pedido de vale válido, com troco forjado e tentando online/pago
  insert into pedidos_clientes (loja_id, cliente_id, itens, endereco_entrega, entrega_latitude, entrega_longitude, forma_pagamento, vale_bandeira, troco_para, pagamento_metodo, pagamento_status)
  values (v_loja, v_cli, jsonb_build_array(jsonb_build_object('produto_id', v_prod, 'quantidade',2)), 'Rua V', -16.68, -49.25, 'vale', 'alelo', 500, 'online', 'pago')
  returning id into a;
  select * into p from pedidos_clientes where id = a;
  r := r || format('V4 metodo=%s status=%s forma=%s band=%s troco=%s total=%s | ', p.pagamento_metodo, p.pagamento_status, p.forma_pagamento, p.vale_bandeira, p.troco_para, p.total);

  -- V5: pedido normal ganha forma 'dinheiro'
  insert into pedidos_clientes (loja_id, cliente_id, itens, endereco_entrega, entrega_latitude, entrega_longitude)
  values (v_loja, v_cli, jsonb_build_array(jsonb_build_object('produto_id', v_prod, 'quantidade',1)), 'Rua D', -16.68, -49.25)
  returning id into b;
  select forma_pagamento into t from pedidos_clientes where id = b;
  r := r || format('V5 dinheiro forma=%s | ', t);

  -- OF: oferta do pedido de vale (service role)
  perform set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  insert into corrida_ofertas (pedido_id, entregador_id, loja_id, status, distancia_km, expira_em)
  values (a, v_ent, v_loja, 'pendente', 1.2, now() + interval '30 seconds') returning id into v_of;
  select mensagem into t from notificacoes where tipo='corrida_oferta' and dados->>'oferta_id' = v_of::text;
  r := r || format('OF "%s" | ', t);
  update corrida_ofertas set status='expirada' where id = v_of;

  -- V6: ninguém troca a forma depois (loja authenticated)
  perform set_config('request.jwt.claims', json_build_object('role','authenticated','sub',v_loja_user)::text, true);
  update pedidos_clientes set forma_pagamento = 'dinheiro', vale_bandeira = null where id = a;
  select forma_pagamento || '/' || vale_bandeira into t from pedidos_clientes where id = a;
  r := r || format('V6 loja troca forma: %s | ', t);

  -- V7: vale COM entregador até entregue
  perform set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  update pedidos_clientes set entregador_id = v_ent where id = a;
  perform set_config('request.jwt.claims', json_build_object('role','authenticated','sub',v_loja_user)::text, true);
  update pedidos_clientes set status = 'preparando' where id = a;
  update pedidos_clientes set status = 'saiu' where id = a;
  update pedidos_clientes set status = 'entregue' where id = a;
  select * into p from pedidos_clientes where id = a;
  select count(*), string_agg(de_papel||'>'||para_papel||':'||tipo||'='||valor, ',' order by tipo) into n, t from acertos_dinheiro where pedido_id = a;
  r := r || format('V7 status=%s pag=%s corrida=%s taxa=%s acertos=%s [%s] | ', p.status, p.pagamento_status, p.pagamento_corrida, p.taxa_entrega, n, t);
  select string_agg(titulo || ': ' || mensagem, ' // ') into t from notificacoes where tipo='acerto' and dados->>'pedido_id' = a::text;
  r := r || format('V7 notifs: %s | ', t);

  -- V8: confirmações (o que /api/acertos/confirmar faz com service role)
  perform set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  update pedidos_clientes set pagamento_status = 'pago' where id = a and pagamento_status = 'pendente';
  update pedidos_clientes set pagamento_corrida = 'pago' where id = a and pagamento_corrida = 'pendente';
  select * into p from pedidos_clientes where id = a;
  r := r || format('V8 pag=%s corrida=%s forma=%s | ', p.pagamento_status, p.pagamento_corrida, p.forma_pagamento);

  -- V9: vale SEM entregador (a loja entregou)
  perform set_config('request.jwt.claims', json_build_object('role','authenticated','sub',v_cli_user)::text, true);
  insert into pedidos_clientes (loja_id, cliente_id, itens, endereco_entrega, entrega_latitude, entrega_longitude, forma_pagamento, vale_bandeira)
  values (v_loja, v_cli, jsonb_build_array(jsonb_build_object('produto_id', v_prod, 'quantidade',1)), 'Rua V9', -16.68, -49.25, 'vale', 'vr')
  returning id into c;
  perform set_config('request.jwt.claims', json_build_object('role','authenticated','sub',v_loja_user)::text, true);
  update pedidos_clientes set status = 'preparando' where id = c;
  update pedidos_clientes set status = 'saiu' where id = c;
  update pedidos_clientes set status = 'entregue' where id = c;
  select * into p from pedidos_clientes where id = c;
  select count(*), string_agg(de_papel||'>'||para_papel||':'||tipo||'='||valor, ',') into n, t from acertos_dinheiro where pedido_id = c;
  r := r || format('V9 sem entregador: pag=%s acertos=%s [%s] confAuto=%s | ', p.pagamento_status, n, t,
    (select count(*) from acertos_confirmacoes ac join acertos_dinheiro ad on ad.id = ac.acerto_id where ad.pedido_id = c and ac.origem='auto'));

  -- V10: dinheiro com entregador continua igual (corrida paga no entregue)
  perform set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  update pedidos_clientes set entregador_id = v_ent where id = b;
  update pedidos_clientes set status = 'preparando' where id = b;
  update pedidos_clientes set status = 'saiu' where id = b;
  update pedidos_clientes set status = 'entregue' where id = b;
  select * into p from pedidos_clientes where id = b;
  select string_agg(tipo, ',' order by tipo) into t from acertos_dinheiro where pedido_id = b;
  r := r || format('V10 dinheiro: corrida=%s [%s] | ', p.pagamento_corrida, t);

  -- V11: view pública tem as colunas
  select aceita_vale::text || ' ' || array_to_string(vale_bandeiras, ',') into t from lojas_publicas where id = v_loja;
  r := r || format('V11 view: %s | guard md5=%s', t, md5(pg_get_functiondef('public.pedidos_clientes_guard'::regproc)));

  raise exception 'RESULTADO: %', r;
end $$;
