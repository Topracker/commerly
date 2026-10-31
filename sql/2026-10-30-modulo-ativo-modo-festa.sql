-- 2026-10-30 — modulo_ativo() passa a responder também por 'modo_festa'.
--
-- Por quê: o proxy (passo 4 das chaves de módulo) redireciona para /pausado as
-- páginas que INICIAM algo, e a festa depende de `cliente` E de `modo_festa`.
-- `feature_flags` tem RLS sem policy (a sessão do proxy não lê a tabela), então
-- a resposta tem que vir da RPC SECURITY DEFINER — que até aqui só conhecia
-- cliente/entregador/fornecedor e devolvia NULL para modo_festa.
--
-- Mudança ADITIVA: as três chaves de antes respondem igual. `modo_festa` é lida
-- só no escopo global, igual a festaPausada() em app/api/festa/_lib.ts
-- (flagAtiva('modo_festa', null)). Sem linha = ligado.
--
-- Feito com replace() no corpo VIVO, com guarda de md5 (pg_get_functiondef).
-- md5 antes: e7dd0d06fc8ac04635ce0056e3b442b9 · depois: 16adf2e1f860ee61247399aeadc6005a
--
-- APLICADO em produção em 2026-10-30 (via MCP).

do $$
declare
  d text;
  novo text;
begin
  d := pg_get_functiondef('public.modulo_ativo(text)'::regprocedure);
  if md5(d) <> 'e7dd0d06fc8ac04635ce0056e3b442b9' then
    raise exception 'modulo_ativo mudou desde a leitura (md5 %); puxe o corpo vivo de novo', md5(d);
  end if;

  novo := replace(d,
    $r$when p_flag in ('cliente', 'entregador', 'fornecedor') then$r$,
    $r$when p_flag in ('cliente', 'entregador', 'fornecedor', 'modo_festa') then$r$);
  if novo = d then
    raise exception 'trecho esperado não encontrado em modulo_ativo';
  end if;

  execute novo;
end $$;

-- Conferência:
-- select md5(pg_get_functiondef('public.modulo_ativo(text)'::regprocedure)),
--        public.modulo_ativo('cliente'), public.modulo_ativo('modo_festa'), public.modulo_ativo('xyz');
