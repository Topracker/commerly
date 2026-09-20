-- ===========================================================================
-- Guard de pedidos: entrega_drone não pode virar NULL quando o entregador
-- não tem veiculo_tipo
-- APLICADO em produção em 2026-09-19 via MCP.
-- ---------------------------------------------------------------------------
-- No ramo UPDATE de pedidos_clientes_guard, ao atribuir um entregador:
--     select veiculo_tipo into ent_veiculo from entregadores where id = ...;
--     new.entrega_drone := (ent_veiculo = 'drone');
-- Com veiculo_tipo NULL a comparação dá NULL e a coluna é NOT NULL:
--   "null value in column entrega_drone violates not-null constraint"
-- — ou seja, um entregador sem veículo definido não conseguia receber pedido
-- (aceite, repasse, multi-entrega, festa). Achado durante o teste do D6 Parte 2
-- (o entregador temporário do teste nasceu sem veiculo_tipo). Em produção só
-- há um entregador e ele tem 'moto', então ninguém foi atingido.
--
-- Correção: coalesce(ent_veiculo = 'drone', false). O ramo de drone (loja
-- aceita, 5 km, 2 kg, horário diurno) continua igual.
--
-- REGRA 5 (o guard já perdeu o preço autoritativo por ser recriado de cópia
-- antiga): o patch é feito SOBRE O CORPO VIVO, no próprio banco — lê
-- pg_get_functiondef, confere o md5 e que o trecho aparece exatamente uma vez,
-- e recria com replace(). Nada é copiado de arquivo.
--   md5 antes: a1d037681d40e228297f081f3858e982 (o do fix de exclusão de conta)
--   md5 depois: b655151d62463833f72e344e76f454ca (10715 -> 10730 chars, +15 = a troca)
--
-- Testado em bloco DO/ROLLBACK (entregadores sem veículo / moto / drone +
-- pedido, tudo desfeito por raise): antes -> NOT NULL violation; depois ->
-- entrega_drone=false para sem-veículo, moto e liberado; drone continua
-- barrado por "Esta loja nao aceita entrega por drone".
-- ===========================================================================

do $$
declare
  v_def text := pg_get_functiondef('public.pedidos_clientes_guard'::regproc);
  v_old text := 'new.entrega_drone := (ent_veiculo = ''drone'');';
  v_new text := 'new.entrega_drone := coalesce(ent_veiculo = ''drone'', false);';
  v_n   int;
begin
  if md5(v_def) <> 'a1d037681d40e228297f081f3858e982' then
    raise exception 'Guard mudou desde a leitura (md5 %); releia antes de aplicar.', md5(v_def);
  end if;
  select count(*) into v_n from regexp_matches(v_def, regexp_replace(v_old, '([().])', '\\\1', 'g'), 'g');
  if v_n <> 1 then
    raise exception 'Trecho esperado aparece % vez(es), esperado 1.', v_n;
  end if;
  execute replace(v_def, v_old, v_new);
end $$;

-- Conferência:
--   select md5(pg_get_functiondef('pedidos_clientes_guard'::regproc));  -- b655151d…
-- Rollback: mesmo bloco com v_old/v_new trocados e o md5 de "depois".
