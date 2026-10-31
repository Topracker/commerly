-- 2026-10-30 — Chaves de módulo, passo 6: travas no BANCO.
--
-- As rotas de API e a interface já respeitam as chaves `cliente`, `fornecedor`
-- e `entregador`. Estas travas fecham os caminhos que falam DIRETO com o
-- Supabase pela chave anon (PedidoModal, pedido B2B, "Ficar online").
--
-- Funções NOVAS e separadas. Nenhum guard existente é tocado:
--   pedidos_clientes_guard 228429eff53618f32287f976f49cadf8
--   pedidos_b2b_guard      4d4cdb4984dfe4687b89100b81ce18bc
-- (md5 de pg_get_functiondef conferido antes e depois — ver o fim do arquivo).
--
-- Regra central: desligar impede COMEÇAR, nunca TERMINAR. Por isso:
--   - o pedido PAGO que nasce no webhook da Stripe (service role +
--     stripe_session_id) passa sempre — recusar deixaria o cliente cobrado e
--     sem pedido. Mesma isenção de bloquear_pedido_delivery_desligado();
--   - o entregador só é impedido de PASSAR de offline para online. Ninguém é
--     forçado a ficar offline, e quem está online pode sair;
--   - ao desligar `entregador`, as ofertas PENDENTES expiram (ninguém aceita
--     corrida nova); corrida já aceita não é tocada.
--
-- Nomes dos triggers: BEFORE triggers rodam em ordem alfabética. Os dois de
-- INSERT ordenam antes do guard da tabela ('trg_b…' < 'trg_p…'), então veem o
-- NEW como veio, antes de qualquer reescrita.
--
-- O trigger de feature_flags é AFTER INSERT OR UPDATE: hoje a chave
-- `entregador` não tem linha (= ligada), e o primeiro desligamento é um INSERT.
--
-- APLICADO em produção em 2026-10-30 (via MCP).

-- 1. pedidos_clientes: chave `cliente` ----------------------------------------
create or replace function public.bloquear_pedido_cliente_pausado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Pago online: nasce no webhook, DEPOIS da cobrança. Nunca recusar.
  if nullif(new.stripe_session_id, '') is not null
     and auth.role() = 'service_role' then
    return new;
  end if;

  if public.modulo_ativo('cliente') = false then
    raise exception 'A area do cliente esta pausada no momento. Pedidos em andamento continuam normalmente.'
      using errcode = 'check_violation';
  end if;
  return new;
end $function$;

drop trigger if exists trg_bloquear_cliente_pausado on public.pedidos_clientes;
create trigger trg_bloquear_cliente_pausado
  before insert on public.pedidos_clientes
  for each row execute function public.bloquear_pedido_cliente_pausado();

-- 2. pedidos (B2B): chave `fornecedor` ----------------------------------------
create or replace function public.bloquear_pedido_b2b_pausado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if nullif(new.stripe_session_id, '') is not null
     and auth.role() = 'service_role' then
    return new;
  end if;

  if public.modulo_ativo('fornecedor') = false then
    raise exception 'As compras de fornecedores estao pausadas no momento. Pedidos ja feitos continuam normalmente.'
      using errcode = 'check_violation';
  end if;
  return new;
end $function$;

drop trigger if exists trg_b2b_modulo_pausado on public.pedidos;
create trigger trg_b2b_modulo_pausado
  before insert on public.pedidos
  for each row execute function public.bloquear_pedido_b2b_pausado();

-- 3. entregadores: offline -> online com `entregador` OFF ----------------------
create or replace function public.bloquear_entregador_online_pausado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Só a PASSAGEM para online. Ficar offline, GPS e qualquer outra coluna
  -- passam. Service role (rotas do servidor, testes) fica de fora.
  if new.disponivel is true
     and old.disponivel is distinct from true
     and auth.role() is distinct from 'service_role'
     and public.modulo_ativo('entregador') = false then
    raise exception 'A rede de entregadores esta pausada no momento. Corridas ja aceitas continuam normalmente.'
      using errcode = 'check_violation';
  end if;
  return new;
end $function$;

drop trigger if exists trg_entregador_online_pausado on public.entregadores;
create trigger trg_entregador_online_pausado
  before update of disponivel on public.entregadores
  for each row execute function public.bloquear_entregador_online_pausado();

-- 4. feature_flags: desligar `entregador` expira as ofertas pendentes ----------
create or replace function public.flag_entregador_off_expira_ofertas()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.flag <> 'entregador' or new.cidade_slug <> '__global__' or new.ativo is distinct from false then
    return null;
  end if;
  -- UPDATE que já estava desligado não refaz nada (OLD só existe no UPDATE).
  if tg_op = 'UPDATE' then
    if old.ativo is false then
      return null;
    end if;
  end if;
  update public.corrida_ofertas set status = 'expirada' where status = 'pendente';
  return null;
end $function$;

drop trigger if exists trg_flag_entregador_off on public.feature_flags;
create trigger trg_flag_entregador_off
  after insert or update of ativo on public.feature_flags
  for each row execute function public.flag_entregador_off_expira_ofertas();

-- Conferência (guards INALTERADOS):
-- select proname, md5(pg_get_functiondef(oid)) from pg_proc
--  where proname in ('pedidos_clientes_guard','pedidos_b2b_guard');
--   -> 228429eff53618f32287f976f49cadf8 / 4d4cdb4984dfe4687b89100b81ce18bc
--
-- Conferido após aplicar (2026-10-30): guards INALTERADOS
--   pedidos_clientes_guard 228429eff53618f32287f976f49cadf8
--   pedidos_b2b_guard      4d4cdb4984dfe4687b89100b81ce18bc
-- Funções novas: bloquear_pedido_cliente_pausado 564d15cf…,
--   bloquear_pedido_b2b_pausado 925edeb5…, bloquear_entregador_online_pausado 87e0b4a5…,
--   flag_entregador_off_expira_ofertas e1a7fa7d…
