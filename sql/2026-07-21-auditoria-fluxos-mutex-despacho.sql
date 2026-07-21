-- ============================================================================
-- AUDITORIA DE FLUXOS, MUTEX E DESPACHO                             2026-07-21
--
-- Aplicado em produção via MCP nas migrações:
--   guard_pedidos_merge_festa_hardening_e_lock_terminal
--   mutex_delivery_entregador_offline_e_notif_resilientes
--   despacho_watchdog_estado_e_alertas
--   paywall_carencia_7_dias
--   hardening_trigger_functions_e_search_path
--
-- ----------------------------------------------------------------------------
-- O ACHADO PRINCIPAL: REGRESSÃO DE PREÇO NO GUARD DE PEDIDOS
--
-- `festa_guard_respeita_taxa_rateada` (20260710165115) recriou
-- `pedidos_clientes_guard` a partir de uma cópia ANTIGA do corpo. Com isso
-- desapareceu tudo que três migrações anteriores tinham somado — e ninguém
-- percebeu, porque o objetivo daquela migração (respeitar a taxa rateada da
-- festa) funcionava.
--
-- O que voltou a ficar quebrado entre 10/07 e 21/07:
--
--   * PREÇO AUTORITATIVO. O subtotal voltou a sair de `itens[].preco`, o valor
--     que o CLIENTE manda no corpo da requisição. Dava para fechar um pedido de
--     R$ 0,01 num produto de R$ 50. Esta é a falha mais grave do período.
--   * `anonimo` -> anular cliente_nome/telefone (o Modo Invisível não invisível)
--   * `eta_em` (sem prazo prometido, a Commerly Garantia não tinha o que medir)
--   * `preco_dinamico_fator` / `fator_exibido` (teto do preço dinâmico)
--   * `peso_total_kg` e as validações de drone no UPDATE
--
-- A correção reconstrói o corpo hardened COM o suporte a festa (que era o
-- objetivo legítimo) e acrescenta o LOCK DE ESTADO TERMINAL.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. GUARD DE PEDIDOS — hardening + festa + lock terminal
--
--    O corpo completo é grande e vive na migração do Supabase
--    (`guard_pedidos_merge_festa_hardening_e_lock_terminal`). Não é duplicado
--    aqui de propósito: manter duas cópias de uma função de 200 linhas é
--    exatamente o mecanismo que causou a regressão acima.
--
--    REGRA PARA QUEM FOR MEXER NELE DEPOIS: nunca recrie este guard a partir de
--    um arquivo .sql do repositório. Puxe o corpo VIGENTE do banco
--    (`select pg_get_functiondef(...)`), edite em cima dele e reaplique.
--
--    Comportamentos que o guard garante hoje:
--      INSERT  preço vem de produtos.preco_venda + promoções (nunca do cliente)
--              fator dinâmico = least(fator_real, fator_exibido)
--              festa: confia em taxa_entrega/valor_corrida do servidor, fator 1
--              eta_em, peso_total_kg, anonimo -> nome/telefone nulos
--      UPDATE  status só anda para a frente (ou para 'cancelado')
--              entregue/cancelado: só liquidação (pagamento_corrida, estorno,
--              garantia_cupom_id) — status, entregador e código congelam
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 2. NOTIFICAÇÕES NÃO DERRUBAM A TRANSAÇÃO DE NEGÓCIO
--
--    Achado da auditoria: uma loja cujo `user_id` não existe mais em auth.users
--    fazia o INSERT do PEDIDO falhar inteiro — o trigger de notificação violava
--    a FK de notificacoes.user_id e abortava tudo. Notificação é efeito
--    colateral e nunca pode impedir o pedido de nascer.
-- ---------------------------------------------------------------------------
create or replace function public.notif_novo_pedido()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare loja_user_id uuid;
begin
  select l.user_id into loja_user_id
    from public.lojas l join auth.users u on u.id = l.user_id
   where l.id = new.loja_id;
  if loja_user_id is not null then
    begin
      insert into public.notificacoes(user_id, tipo, titulo, mensagem, link, dados)
      values (loja_user_id, 'pedido_novo', 'Novo pedido!',
              'Voce recebeu um novo pedido de ' || coalesce(new.cliente_nome, 'cliente'),
              '/pedidos', jsonb_build_object('pedido_id', new.id));
    exception when others then
      raise warning '[notif_novo_pedido] falhou: %', sqlerrm;
    end;
  end if;
  return new;
end; $$;

create or replace function public.notif_status_pedido()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare cliente_user_id uuid; msg text;
begin
  if old.status = new.status then return new; end if;
  select c.user_id into cliente_user_id
    from public.clientes c join auth.users u on u.id = c.user_id
   where c.id = new.cliente_id;
  msg := case new.status
           when 'preparando' then 'Seu pedido esta sendo preparado!'
           when 'saiu'       then 'Seu pedido saiu para entrega!'
           when 'entregue'   then 'Seu pedido foi entregue!'
           when 'cancelado'  then 'Seu pedido foi cancelado.'
           else null end;
  if cliente_user_id is not null and msg is not null then
    begin
      insert into public.notificacoes(user_id, tipo, titulo, mensagem, link, dados)
      values (cliente_user_id, 'pedido_status', 'Atualizacao do pedido', msg,
              '/cliente/pedidos', jsonb_build_object('pedido_id', new.id, 'status', new.status));
    exception when others then
      raise warning '[notif_status_pedido] falhou: %', sqlerrm;
    end;
  end if;
  return new;
end; $$;

-- ---------------------------------------------------------------------------
-- 3. MUTEX: LOJA DESLIGA O DELIVERY
--
--    Chave única de "estou aceitando pedidos". Desligar corta os pedidos novos
--    na raiz e expira as ofertas de corrida abertas — os entregadores parceiros
--    param de receber corridas desta loja sozinhos, porque não nascem pedidos.
-- ---------------------------------------------------------------------------
alter table public.lojas add column if not exists delivery_ativo boolean not null default true;

comment on column public.lojas.delivery_ativo is
  'Loja aceitando pedidos de delivery. false = vitrine continua visível, mas nenhum pedido entra.';

-- Flag `delivery` agora respeita o escopo GLOBAL, não só o da cidade: com
-- `__global__` desligado o bloqueio não pegava em lugar nenhum.
create or replace function public.bloquear_pedido_delivery_desligado()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_slug text; v_ativo boolean; v_loja_ativa boolean; v_nome text;
begin
  select cidade_slug, coalesce(delivery_ativo, true), nome
    into v_slug, v_loja_ativa, v_nome
    from public.lojas where id = new.loja_id;

  if not coalesce(v_loja_ativa, true) then
    raise exception 'A loja % nao esta aceitando pedidos no momento.', coalesce(v_nome, '')
      using errcode = 'check_violation';
  end if;

  select ativo into v_ativo
    from public.feature_flags where cidade_slug = '__global__' and flag = 'delivery';
  if v_slug is not null then
    select coalesce((select ativo from public.feature_flags
                      where cidade_slug = v_slug and flag = 'delivery'), v_ativo)
      into v_ativo;
  end if;

  if v_ativo is not null and v_ativo = false then
    raise exception 'Delivery indisponivel nesta cidade no momento.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create or replace function public.loja_delivery_off_encerra_ofertas()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(old.delivery_ativo, true) and not coalesce(new.delivery_ativo, true) then
    update public.corrida_ofertas set status = 'expirada'
     where loja_id = new.id and status = 'pendente';
  end if;
  return new;
end $$;

drop trigger if exists trg_loja_delivery_off on public.lojas;
create trigger trg_loja_delivery_off
  after update of delivery_ativo on public.lojas
  for each row execute function public.loja_delivery_off_encerra_ofertas();

-- ---------------------------------------------------------------------------
-- 4. MUTEX: ENTREGADOR FICA OFFLINE -> PEDIDOS VOLTAM PRO POOL
--
--    Pedido aceito mas ainda não retirado (recebido/preparando) volta a ficar
--    sem entregador e o comerciante é avisado. Pedido já em rota ('saiu') NÃO é
--    liberado aqui — a mercadoria está com ele; quem cuida desse caso é a
--    reentrega por inatividade de GPS (/api/entrega/checar-entregador), que
--    confirma o sumiço antes de liberar.
-- ---------------------------------------------------------------------------
create or replace function public.entregador_offline_libera_pedidos()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare r record; loja_user uuid;
begin
  if coalesce(old.disponivel, false) and not coalesce(new.disponivel, false) then
    update public.corrida_ofertas set status = 'expirada'
     where entregador_id = new.id and status = 'pendente';

    for r in
      select p.id, p.loja_id from public.pedidos_clientes p
       where p.entregador_id = new.id and p.status in ('recebido', 'preparando')
    loop
      update public.pedidos_clientes set entregador_id = null where id = r.id;
      update public.corrida_ofertas set status = 'expirada'
       where pedido_id = r.id and entregador_id = new.id and status = 'aceita';

      select l.user_id into loja_user
        from public.lojas l join auth.users u on u.id = l.user_id where l.id = r.loja_id;
      if loja_user is not null then
        begin
          insert into public.notificacoes(user_id, tipo, titulo, mensagem, link, dados)
          values (loja_user, 'pedido_status', 'Entregador ficou indisponivel',
                  coalesce(new.nome, 'O entregador') || ' saiu do ar. O pedido voltou para a busca — chame outro entregador.',
                  '/pedidos', jsonb_build_object('pedido_id', r.id, 'motivo', 'entregador_offline'));
        exception when others then raise warning '[entregador_offline] notif falhou: %', sqlerrm; end;
      end if;
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists trg_entregador_offline on public.entregadores;
create trigger trg_entregador_offline
  after update of disponivel on public.entregadores
  for each row execute function public.entregador_offline_libera_pedidos();

-- ---------------------------------------------------------------------------
-- 5. MUTEX: ACEITOU UMA CORRIDA -> SOME PARA TODAS AS OUTRAS
--
--    O despacho já pulava quem estava ocupado ao MONTAR o pool, mas uma oferta
--    emitida segundos antes continuava viva na tela do entregador — e dois
--    pedidos podiam cair no mesmo par de mãos.
-- ---------------------------------------------------------------------------
create or replace function public.oferta_aceita_encerra_concorrentes()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status = 'aceita' and old.status is distinct from 'aceita' then
    update public.corrida_ofertas set status = 'expirada'
     where status = 'pendente'
       and id <> new.id
       and (entregador_id = new.entregador_id
            or (new.pedido_id is not null and pedido_id = new.pedido_id)
            or (new.festa_id  is not null and festa_id  = new.festa_id));
  end if;
  return new;
end $$;

drop trigger if exists trg_oferta_aceita_encerra on public.corrida_ofertas;
create trigger trg_oferta_aceita_encerra
  after update of status on public.corrida_ofertas
  for each row execute function public.oferta_aceita_encerra_concorrentes();

create or replace function public.pedido_atribuido_encerra_ofertas()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.entregador_id is not null and old.entregador_id is distinct from new.entregador_id then
    update public.corrida_ofertas set status = 'expirada'
     where status = 'pendente'
       and (entregador_id = new.entregador_id or pedido_id = new.id);
  end if;
  return new;
end $$;

drop trigger if exists trg_pedido_atribuido_encerra_ofertas on public.pedidos_clientes;
create trigger trg_pedido_atribuido_encerra_ofertas
  after update of entregador_id on public.pedidos_clientes
  for each row execute function public.pedido_atribuido_encerra_ofertas();

-- ---------------------------------------------------------------------------
-- 6. WATCHDOG DE DESPACHO — memória do estado da cadeia
--
--    Até aqui a cadeia de ofertas só andava enquanto a aba do comerciante
--    estava aberta (polling de 2s em /pedidos). Fechou a aba, o pedido ficava
--    parado para sempre e ninguém avisava. Estas colunas deixam o SERVIDOR
--    retomar de onde parou — a lógica está em app/lib/despachoWatchdog.ts.
-- ---------------------------------------------------------------------------
alter table public.pedidos_clientes
  add column if not exists despacho_esgotado_em timestamptz,
  add column if not exists despacho_pool_em     timestamptz,
  add column if not exists despacho_alerta      text;

create index if not exists pedidos_clientes_sem_entregador_idx
  on public.pedidos_clientes (status, created_at)
  where entregador_id is null and status in ('recebido', 'preparando');

alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo = any (array[
    'pedido_novo', 'pedido_status', 'parceria_aceita', 'corrida_oferta',
    'cupom', 'post_novo', 'flash_sale', 'retencao', 'relatorio', 'despacho'
  ]));

-- ---------------------------------------------------------------------------
-- 7. PAYWALL — carência de 7 dias
--
--    O app passa a exigir plano ativo (ou teste correndo) para abrir o painel
--    do comerciante — antes disto, cancelar a assinatura não tirava nada de
--    ninguém. Como a cobrança nunca foi feita de verdade, as lojas sem
--    assinatura ganharam 7 dias de teste a partir da aplicação: o paywall só
--    morde para quem não assinar dentro do prazo.
-- ---------------------------------------------------------------------------
-- update public.lojas
--    set trial_expira_em = now() + interval '7 days'
--  where plano is distinct from 'ativo'
--    and (trial_expira_em is null or trial_expira_em <= now());
-- (comentado: é um one-shot, rodado em 2026-07-21. Reexecutar renovaria a
--  carência de todo mundo e adiaria o paywall de novo.)

-- ---------------------------------------------------------------------------
-- 8. HARDENING apontado pelo linter de segurança
--
--    Funções de TRIGGER são SECURITY DEFINER e o PostgREST publica tudo que
--    está em `public` como RPC. Chamá-las direto normalmente falha, mas não há
--    motivo para estarem ao alcance de anon/authenticated — o trigger roda como
--    dono da função de qualquer forma. Verificado: INSERT/UPDATE de pedidos
--    continuam funcionando como `authenticated` depois do revoke.
-- ---------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_type t on t.oid = p.prorettype
     where n.nspname = 'public' and t.typname = 'trigger'
  loop
    execute format('revoke all on function %s from anon, authenticated', f.assinatura);
  end loop;
end $$;

alter function public.auto_set_fundador()                set search_path to 'public';
alter function public.lojas_bloqueia_cobranca_cliente()  set search_path to 'public';
alter function public.notif_parceria_aceita()            set search_path to 'public';
alter function public.recalc_pontos_cidade()             set search_path to 'public';
alter function public.resolver_cidade_loja()             set search_path to 'public';
alter function public.calcular_taxa_entrega(numeric)     set search_path to 'public';
alter function public.haversine_km(double precision, double precision, double precision, double precision)
  set search_path to 'public';

-- ============================================================================
-- VERIFICAÇÃO (rodada em 2026-07-21, tudo em transação com rollback):
--
--   * pedido com itens[].preco = 0,01 num produto de R$ 2,50 gravou total 8,00
--     (2 x 2,50 + 3,00 de taxa) e itens.preco reescrito para 2,50
--   * anonimo = true -> cliente_nome e cliente_telefone nulos
--   * 'preparando' -> 'recebido' recusado ("Transicao de status invalida")
--   * pedido entregue: tentativa de voltar para 'preparando' ignorada, código
--     preservado; pagamento_corrida = 'pago' ainda passa
--   * aceitar uma oferta zerou as demais pendentes do entregador
--   * entregador -> offline liberou o pedido atribuído
--   * loja com delivery_ativo = false recusou pedido novo
--   * INSERT em pedidos_clientes como role `authenticated` continua OK depois
--     do revoke das funções de trigger
-- ============================================================================
