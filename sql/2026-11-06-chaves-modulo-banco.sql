-- 2026-11-06 — Chaves de módulo no banco: o que faltava além do proxy e das rotas.
--
-- ESTADO: NÃO APLICADO em produção. O site funciona sem este arquivo; ele fecha a
-- gravação direta pelo REST (chave anon + sessão), que não passa pelo proxy.
--
-- Regra central: desligar impede COMEÇAR, nunca TERMINAR. Os triggers são só BEFORE
-- INSERT em tabelas de início, nunca em UPDATE de pedido, festa ou corrida já aberta.
-- Service role fica de fora: webhook, cron e rotas do servidor terminam o que começou
-- e já passam pela trava de cada rota.
--
-- Guards intocados: pedidos_clientes_guard e o guard de pedidos B2B.
-- Corpos partiram do banco vivo em 2026-11-06 (pg_get_functiondef):
--   modulo_ativo               md5 16adf2e1f860ee61247399aeadc6005a
--   auto_set_fundador          md5 e1b4e6c18bfb6d0d5894dd0f01c292aa
--   conceder_fundador_pagante  md5 e5fd6d9e7adb09c7f818889c5e536248
--   pontos_status_pedido       md5 832250529a849e367a923ddfa3728b72
--   premiar                    md5 4d833753b996aa4b62cf3da7e4762980

-- 1) modulo_ativo responde por todas as chaves só-globais e de programa.
--    Delivery fica de fora: é por cidade, e tem trigger próprio.
create or replace function public.modulo_ativo(p_flag text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case
    when p_flag in ('cliente', 'entregador', 'fornecedor', 'modo_festa', 'ia', 'cashback',
                    'gamificacao', 'kit', 'fundadores', 'embaixadores', 'flash_sale') then
      coalesce((select ativo from public.feature_flags
                 where cidade_slug = '__global__' and flag = p_flag), true)
  end
$function$;

-- 2) Trava genérica de INSERT: o módulo vem do argumento do trigger.
create or replace function public.bloquear_insert_modulo_pausado()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_modulo text;
begin
  if auth.role() = 'service_role' then return new; end if;
  foreach v_modulo in array tg_argv loop
    if public.modulo_ativo(v_modulo) = false then
      raise exception 'Modulo indisponivel: % esta pausado no momento.', v_modulo
        using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end $function$;

revoke all on function public.bloquear_insert_modulo_pausado() from public, anon, authenticated;

drop trigger if exists trg_modulo_clientes on public.clientes;
create trigger trg_modulo_clientes before insert on public.clientes
  for each row execute function public.bloquear_insert_modulo_pausado('cliente');

drop trigger if exists trg_modulo_entregadores on public.entregadores;
create trigger trg_modulo_entregadores before insert on public.entregadores
  for each row execute function public.bloquear_insert_modulo_pausado('entregador');

drop trigger if exists trg_modulo_fornecedores on public.fornecedores;
create trigger trg_modulo_fornecedores before insert on public.fornecedores
  for each row execute function public.bloquear_insert_modulo_pausado('fornecedor');

-- Festa: só nascer e entrar. A festa aberta continua fechando (UPDATE não passa aqui).
drop trigger if exists trg_modulo_festas on public.festas;
create trigger trg_modulo_festas before insert on public.festas
  for each row execute function public.bloquear_insert_modulo_pausado('cliente', 'modo_festa');

drop trigger if exists trg_modulo_festa_participantes on public.festa_participantes;
create trigger trg_modulo_festa_participantes before insert on public.festa_participantes
  for each row execute function public.bloquear_insert_modulo_pausado('cliente', 'modo_festa');

drop trigger if exists trg_modulo_flash_sales on public.flash_sales;
create trigger trg_modulo_flash_sales before insert on public.flash_sales
  for each row execute function public.bloquear_insert_modulo_pausado('flash_sale');

drop trigger if exists trg_modulo_assistente on public.assistente_conversas;
create trigger trg_modulo_assistente before insert on public.assistente_conversas
  for each row execute function public.bloquear_insert_modulo_pausado('ia');

drop trigger if exists trg_modulo_insights on public.insights_semanais;
create trigger trg_modulo_insights before insert on public.insights_semanais
  for each row execute function public.bloquear_insert_modulo_pausado('ia');

drop trigger if exists trg_modulo_kit_pedidos on public.kit_pedidos;
create trigger trg_modulo_kit_pedidos before insert on public.kit_pedidos
  for each row execute function public.bloquear_insert_modulo_pausado('kit');

drop trigger if exists trg_modulo_kit_interesse on public.kit_interesse;
create trigger trg_modulo_kit_interesse before insert on public.kit_interesse
  for each row execute function public.bloquear_insert_modulo_pausado('kit');

drop trigger if exists trg_modulo_indicacoes on public.indicacoes;
create trigger trg_modulo_indicacoes before insert on public.indicacoes
  for each row execute function public.bloquear_insert_modulo_pausado('embaixadores');

drop trigger if exists trg_modulo_codigos on public.codigos_indicacao;
create trigger trg_modulo_codigos before insert on public.codigos_indicacao
  for each row execute function public.bloquear_insert_modulo_pausado('embaixadores');

drop trigger if exists trg_modulo_conquistas on public.conquistas;
create trigger trg_modulo_conquistas before insert on public.conquistas
  for each row execute function public.bloquear_insert_modulo_pausado('gamificacao');

-- 3) Cashback: pedido novo não resgata ponto com a chave desligada. O pedido pago
--    online nasce no webhook, com o resgate já cobrado: esse passa (service role).
create or replace function public.bloquear_resgate_cashback_pausado()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if coalesce(new.pontos_usados, 0) > 0
     and auth.role() is distinct from 'service_role'
     and public.modulo_ativo('cashback') = false then
    raise exception 'Modulo indisponivel: o Clube Commerly esta pausado no momento.'
      using errcode = 'check_violation';
  end if;
  return new;
end $function$;

revoke all on function public.bloquear_resgate_cashback_pausado() from public, anon, authenticated;

drop trigger if exists trg_bloquear_resgate_pausado on public.pedidos_clientes;
create trigger trg_bloquear_resgate_pausado before insert on public.pedidos_clientes
  for each row execute function public.bloquear_resgate_cashback_pausado();

-- 4) Cashback: pedido entregue com a chave desligada não credita ponto novo. O estorno
--    do cancelamento segue valendo: devolver ponto é terminar, não começar.
create or replace function public.pontos_status_pedido()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pontos    int;
  v_resgatado int;
  v_ganho     int;
begin
  if new.status is not distinct from old.status then return new; end if;

  if new.status = 'entregue' and old.status <> 'entregue' then
    if public.modulo_ativo('cashback') = false then
      return new;
    end if;

    if public.pontos_liquidos_pedido(new.id, 'ganho') > 0 then
      return new;
    end if;

    v_pontos := public.pontos_do_pedido(new.itens);
    if v_pontos > 0 then
      perform public.creditar_pontos_clube(new.cliente_id, new.loja_id, v_pontos);
      insert into public.clube_movimentos (cliente_id, loja_id, pedido_id, tipo, pontos)
      values (new.cliente_id, new.loja_id, new.id, 'ganho', v_pontos);
    end if;
    return new;
  end if;

  if new.status = 'cancelado' and old.status <> 'cancelado' then

    v_resgatado := public.pontos_liquidos_pedido(new.id, 'resgate');

    if v_resgatado > 0 then
      perform public.creditar_pontos_clube(new.cliente_id, new.loja_id, v_resgatado);
      update public.pontos_clientes
         set total_acumulado = greatest(0, coalesce(total_acumulado, 0) - v_resgatado)
       where cliente_id = new.cliente_id and loja_id = new.loja_id;

      insert into public.clube_movimentos (cliente_id, loja_id, pedido_id, tipo, pontos)
      values (new.cliente_id, new.loja_id, new.id, 'estorno_resgate', v_resgatado);
    end if;

    v_ganho := public.pontos_liquidos_pedido(new.id, 'ganho');

    if v_ganho > 0 then
      perform public.retirar_pontos_clube(new.cliente_id, new.loja_id, v_ganho);
      insert into public.clube_movimentos (cliente_id, loja_id, pedido_id, tipo, pontos)
      values (new.cliente_id, new.loja_id, new.id, 'estorno_ganho', v_ganho);
    end if;
  end if;

  return new;
end;
$function$;

-- 5) Gamificação: pedido novo ou entregue com a chave desligada não gera XP nem
--    atividade. Todo prêmio do banco passa por premiar().
create or replace function public.premiar(p_user_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if p_user_id is null then return; end if;
  if public.modulo_ativo('gamificacao') = false then return; end if;
  perform public.registrar_atividade(p_user_id);
  perform public.recalcular_xp(p_user_id);
exception when others then
  null;
end $function$;

-- 6) Fundadores: loja nova não ocupa vaga nem ganha preço de fundador com a chave
--    desligada. A numeração das vagas não é consumida.
create or replace function public.auto_set_fundador()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare cnt integer;
begin
  -- Admin, dono do produto e amigo do dono: sem vaga e sem preço de fundador.
  if new.user_id in (
    '611f9ece-10b8-4347-814b-9a7b91a987af'::uuid,
    '72d06024-1e13-488a-bb08-b0632c45f836'::uuid,
    '24cc61bd-ea65-47f6-9d49-fff9f0a41b7f'::uuid
  ) then
    new.fundador := false;
    return new;
  end if;
  -- Programa pausado: sem vaga, sem preço de fundador.
  if public.modulo_ativo('fundadores') = false then
    new.fundador := false;
    return new;
  end if;
  -- Fila única: dois cadastros simultâneos não ocupam a vaga 100 juntos.
  perform pg_advisory_xact_lock(hashtext('fundador_vagas'));
  select count(*) into cnt from fundador_vagas;
  if cnt < 100 then
    new.fundador := true;
    -- Some junto se o INSERT da loja falhar (mesma transação).
    insert into fundador_vagas (loja_id) values (new.id) on conflict (loja_id) do nothing;
  else
    new.fundador := false;
  end if;
  return new;
end;
$function$;

-- 7) Selo numerado: pagamento com a chave desligada não vira Fundador nº 1..3. Quem
--    já foi premiado continua: a reentrega da Stripe devolve a mesma ordem antes disto.
create or replace function public.conceder_fundador_pagante(p_loja_id uuid, p_sub_id text, p_valor_centavos integer)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_loja      record;
  v_email     text;
  v_ordem     integer;
  v_existente integer;
begin
  if p_loja_id is null or p_sub_id is null or coalesce(p_valor_centavos, 0) <= 0 then
    return null;
  end if;

  -- Fila única para todas as concessões: dois webhooks simultâneos não leem o
  -- mesmo max(ordem). Solta no fim da transação.
  perform pg_advisory_xact_lock(hashtext('conceder_fundador_pagante'));

  -- Já premiada (reentrega da Stripe, ou completed + invoice.paid): devolve a
  -- mesma ordem, sem mexer no destaque de novo.
  select ordem into v_existente
    from fundadores where loja_id = p_loja_id and ordem between 1 and 3;
  if v_existente is not null then
    return v_existente;
  end if;

  -- Programa pausado: não concede prêmio novo.
  if public.modulo_ativo('fundadores') = false then return null; end if;

  select id, user_id, created_at, oculta, stripe_subscription_id, cidade_slug
    into v_loja
    from lojas where id = p_loja_id;
  if not found then return null; end if;

  if v_loja.stripe_subscription_id is distinct from p_sub_id then return null; end if;
  if v_loja.created_at < ('2026-10-26 00:00:00'::timestamp at time zone 'America/Sao_Paulo') then return null; end if;
  if coalesce(v_loja.oculta, false) then return null; end if;
  -- Admin, dono do produto e amigo do dono não concorrem ao prêmio.
  if v_loja.user_id in (
    '611f9ece-10b8-4347-814b-9a7b91a987af'::uuid,
    '72d06024-1e13-488a-bb08-b0632c45f836'::uuid,
    '24cc61bd-ea65-47f6-9d49-fff9f0a41b7f'::uuid
  ) then return null; end if;

  select lower(email) into v_email from auth.users where id = v_loja.user_id;
  if v_email is null or v_email like '%@teste.com' then return null; end if;

  select coalesce(max(ordem), 0) + 1 into v_ordem
    from fundadores where ordem between 1 and 3;
  if v_ordem > 3 then return null; end if;

  insert into fundadores (loja_id, ordem, cidade, premiado_em, stripe_subscription_id, valor_pago_centavos)
  values (p_loja_id, v_ordem, v_loja.cidade_slug, now(), p_sub_id, p_valor_centavos)
  on conflict (loja_id) do update
    set ordem = excluded.ordem,
        premiado_em = excluded.premiado_em,
        stripe_subscription_id = excluded.stripe_subscription_id,
        valor_pago_centavos = excluded.valor_pago_centavos
    where fundadores.ordem is null or fundadores.ordem not between 1 and 3;
  if not found then return null; end if;

  -- 1 mês de Ads grátis. greatest() ignora null: sem destaque = now()+31d.
  update lojas
     set destaque_ate = greatest(destaque_ate, now() + interval '31 days')
   where id = p_loja_id;

  return v_ordem;
end;
$function$;

-- Conferência depois de aplicar:
--   select public.modulo_ativo('flash_sale');  -- true com a chave ligada
--   select count(*) from pg_trigger where tgname like 'trg_modulo_%';  -- esperado: 13
