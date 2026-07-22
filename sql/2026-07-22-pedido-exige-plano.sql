-- ============================================================================
-- PEDIDO EXIGE PLANO EM DIA — fecha o último caminho para o pedido órfão
-- ----------------------------------------------------------------------------
-- Faltava o fundo do poço do paywall. Já tínhamos:
--   sql/2026-07-22-paywall-rls.sql    -> o DONO perde painel e dados
--   sql/2026-07-22-vitrine-plano.sql  -> a loja some da vitrine do cliente
-- Mas `PedidoModal` insere DIRETO em `pedidos_clientes` pela chave anon, e a
-- policy `paywall_plano` é ancorada no DONO — ela não barra o cliente. Quem já
-- estivesse com a tela aberta (ou montasse a requisição na mão) ainda criava
-- pedido em loja vencida, que o comerciante não consegue ver nem despachar.
--
-- POR QUE UM GATILHO SEPARADO E NÃO UMA LINHA NO `pedidos_clientes_guard`:
-- o guard tem ~11 KB e JÁ PERDEU lógica em produção por ter sido recriado a
-- partir de uma cópia velha (o preço autoritativo sumiu — ver memória
-- guard_pedidos_regressao). Reescrevê-lo inteiro para acrescentar quatro linhas
-- é trocar um risco pequeno por um grande. E o schema já usa esse idioma: o
-- `trg_bloquear_delivery` faz exatamente isto — gatilho próprio, BEFORE INSERT,
-- só para dizer "não". Este segue o mesmo molde e é removível sozinho.
-- ============================================================================

begin;

create or replace function public.bloquear_pedido_loja_sem_plano()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_em_dia boolean;
begin
  -- ── ISENÇÃO DO PAGAMENTO JÁ PROCESSADO ──────────────────────────────────
  -- O pedido pago online nasce no webhook da Stripe, DEPOIS que o dinheiro
  -- saiu. Se a loja vencer entre o checkout e a entrega do evento, recusar aqui
  -- deixaria o cliente COBRADO E SEM PEDIDO — dano pior que o pedido órfão.
  --
  -- Exige as DUAS condições. `stripe_session_id` sozinho não serve: ele vem no
  -- corpo da requisição e um cliente poderia inventar um para escapar do
  -- paywall. `auth.role()` sai do JWT assinado, então só o nosso servidor
  -- (service role) consegue apresentá-lo — e é exatamente por ali que o
  -- pagamento já processado entra.
  if nullif(new.stripe_session_id, '') is not null
     and auth.role() = 'service_role' then
    return new;
  end if;

  select (plano = 'ativo' or (trial_expira_em is not null and trial_expira_em > now()))
    into v_em_dia
    from public.lojas where id = new.loja_id;

  -- Falha aberta se a loja não for encontrada: quem decide isso é o guard, que
  -- roda logo depois e tem a mensagem certa para loja inexistente.
  if v_em_dia is not null and v_em_dia = false then
    raise exception 'Esta loja nao esta disponivel no momento.'
      using errcode = 'check_violation';
  end if;

  return new;
end $function$;

comment on function public.bloquear_pedido_loja_sem_plano() is
  'Recusa pedido novo em loja com plano vencido. Isenta o pedido pago online '
  '(stripe_session_id + service_role) para nao cobrar cliente sem criar pedido.';

drop trigger if exists trg_bloquear_loja_sem_plano on public.pedidos_clientes;
create trigger trg_bloquear_loja_sem_plano
  before insert on public.pedidos_clientes
  for each row execute function public.bloquear_pedido_loja_sem_plano();

commit;

-- Ordem de disparo: gatilhos BEFORE do mesmo evento correm em ordem alfabética.
--   trg_bloquear_delivery  <  trg_bloquear_loja_sem_plano  <  trg_pedidos_clientes_guard
-- Ou seja, este roda ANTES do guard — de propósito: recusa antes de gastar o
-- trabalho de precificar o carrinho. Como o guard só mexe em stripe_session_id
-- no ramo de UPDATE, o valor lido aqui é o que veio na requisição.
--
-- REVERTER:
--   drop trigger if exists trg_bloquear_loja_sem_plano on public.pedidos_clientes;
--   drop function if exists public.bloquear_pedido_loja_sem_plano();
