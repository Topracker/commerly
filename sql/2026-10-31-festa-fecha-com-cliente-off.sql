-- 2026-10-31 — Festa aberta fecha mesmo com a chave `cliente` desligada.
--
-- A trava bloquear_pedido_cliente_pausado() (sql/2026-10-30-chaves-modulo-travas.sql)
-- barrava também os pedidos que /api/festa/fechar cria ao fechar uma festa já
-- aberta (pedidos da festa não são pagos online, então não caíam na isenção do
-- webhook). Regra das chaves: desligar impede COMEÇAR, nunca TERMINAR — e fechar
-- uma festa já aberta é terminar.
--
-- Isenção nova, estreita de propósito: service role (a rota de fechamento) +
-- festa_id de uma festa que ainda está 'aberta' (no momento do insert a rota
-- ainda não mudou o status para 'fechada'). Só `festa_id` preenchido não basta:
-- um cliente poderia furar a trava via REST preenchendo o campo.
-- Pedido avulso continua bloqueado.
--
-- Altera SÓ esta função nova, com replace() no corpo VIVO e guarda de md5.
-- Guards antigos intocados (pedidos_clientes_guard 228429ef…, pedidos_b2b_guard 4d4cdb49…).
-- md5 antes: 564d15cffff409d946665697e783ced8 · depois: 1df0627609578517e7495da59f4eb833
--
-- APLICADO em produção em 2026-10-31 (via MCP).

do $$
declare
  d text;
  novo text;
begin
  d := pg_get_functiondef('public.bloquear_pedido_cliente_pausado()'::regprocedure);
  if md5(d) <> '564d15cffff409d946665697e783ced8' then
    raise exception 'bloquear_pedido_cliente_pausado mudou desde a leitura (md5 %); puxe o corpo vivo de novo', md5(d);
  end if;

  novo := replace(d,
$r$  if public.modulo_ativo('cliente') = false then$r$,
$r$  -- Fechamento de festa JÁ ABERTA (/api/festa/fechar, service role): terminar
  -- o que começou com a chave ligada. Pedido avulso continua barrado.
  if new.festa_id is not null
     and auth.role() = 'service_role'
     and exists (select 1 from public.festas f where f.id = new.festa_id and f.status = 'aberta') then
    return new;
  end if;

  if public.modulo_ativo('cliente') = false then$r$);
  if novo = d then
    raise exception 'trecho esperado não encontrado em bloquear_pedido_cliente_pausado';
  end if;

  execute novo;
end $$;
