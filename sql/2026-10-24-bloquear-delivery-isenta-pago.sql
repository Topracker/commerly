-- bloquear_pedido_delivery_desligado(): isenta o pedido JÁ PAGO que entra
-- pelo webhook da Stripe.
--
-- O pedido pago online nasce no webhook (app/api/stripe/webhook/route.ts),
-- DEPOIS que a Stripe cobrou. Se entre o checkout e a entrega do evento a
-- flag `delivery` da cidade desligar (ou a loja pausar `delivery_ativo`), o
-- trg_bloquear_delivery recusava o insert: o webhook devolvia 500, a Stripe
-- retentava para sempre e o cliente ficava COBRADO E SEM PEDIDO.
--
-- Os outros dois gatilhos BEFORE INSERT já isentam com a mesma regra
-- (trg_bloquear_loja_sem_plano e trg_bloquear_fora_horario). Exige as DUAS
-- condições: `stripe_session_id` sozinho vem do corpo e poderia ser
-- inventado; `auth.role()` sai do JWT assinado — só o service role o tem.
--
-- Aplicado sobre o CORPO VIVO com replace() (regra 5 do CLAUDE.md), travado
-- pelo md5 de pg_get_functiondef conferido em 2026-10-24:
--   antes:  07d5a8536471bb28d38758fea9d3ba67
--   depois: 82a6b2d00b4388f320728c0ca31c0092 (calculado sem aplicar)
--
-- STATUS: NÃO APLICADO — aguardando aprovação.

do $$
declare
  v_def  text := pg_get_functiondef('public.bloquear_pedido_delivery_desligado()'::regprocedure);
  v_novo text;
begin
  if md5(v_def) <> '07d5a8536471bb28d38758fea9d3ba67' then
    raise exception 'bloquear_pedido_delivery_desligado mudou desde a revisão (md5 %) — revise antes de aplicar', md5(v_def);
  end if;

  v_novo := replace(v_def,
    E'v_nome text;\nbegin\n',
       E'v_nome text;\nbegin\n'
    || E'  -- Pedido pago online nasce no webhook da Stripe, DEPOIS da cobranca:\n'
    || E'  -- recusar aqui deixa o cliente cobrado e sem pedido. Exige as duas\n'
    || E'  -- condicoes (stripe_session_id vem do corpo; auth.role() vem do JWT).\n'
    || E'  if nullif(new.stripe_session_id, \'\') is not null\n'
    || E'     and auth.role() = \'service_role\' then\n'
    || E'    return new;\n'
    || E'  end if;\n'
    || E'\n');

  if md5(v_novo) <> '82a6b2d00b4388f320728c0ca31c0092' then
    raise exception 'replace() não gerou o corpo esperado (md5 %) — nada foi alterado', md5(v_novo);
  end if;

  execute v_novo;
end $$;

-- Conferência (deve dar 82a6b2d00b4388f320728c0ca31c0092):
-- select md5(pg_get_functiondef('public.bloquear_pedido_delivery_desligado()'::regprocedure));
--
-- REVERTER: mesmo bloco com antes/depois trocados e o replace() invertido.
