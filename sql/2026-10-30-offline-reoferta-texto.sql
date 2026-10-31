-- 2026-10-30 — "Ficar offline" agora reoferta a corrida solta.
--
-- Quem solta continua sendo o trigger trg_entregador_offline
-- (entregador_offline_libera_pedidos). A REOFERTA é feita em TS pela rota
-- /api/entregador/ficar-offline (SQL não chama o despacho — sem pg_net), com a
-- mesma lógica da desistência (app/lib/redespacho.ts): dissolve o lote, oferta
-- ao próximo do raio sem quem saiu e avisa a loja do resultado.
--
-- Aqui só muda o TEXTO do aviso do trigger: "chame outro entregador" deixou de
-- ser verdade — a busca agora é automática, e a loja recebe logo em seguida o
-- aviso com o resultado (tipo 'despacho', motivo 'entregador_offline').
--
-- replace() no corpo VIVO, com guarda de md5 (pg_get_functiondef).
-- md5 antes: 22f28f05135c0e4c64817ec9761d42a1 · depois: 045f5892fea17628ae430215e2b4d447
--
-- APLICADO em produção em 2026-10-30 (via MCP).

do $$
declare
  d text;
  novo text;
begin
  d := pg_get_functiondef('public.entregador_offline_libera_pedidos()'::regprocedure);
  if md5(d) <> '22f28f05135c0e4c64817ec9761d42a1' then
    raise exception 'entregador_offline_libera_pedidos mudou desde a leitura (md5 %); puxe o corpo vivo de novo', md5(d);
  end if;

  novo := replace(d,
    $r$' saiu do ar. O pedido voltou para a busca — chame outro entregador.'$r$,
    $r$' saiu do ar. O pedido voltou para a busca de outro entregador.'$r$);
  if novo = d then
    raise exception 'trecho esperado não encontrado em entregador_offline_libera_pedidos';
  end if;

  execute novo;
end $$;
