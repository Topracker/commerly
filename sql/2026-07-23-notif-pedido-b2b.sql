-- Notificações do Marketplace B2B (tabela `pedidos`: loja compra do fornecedor).
--
-- Antes desta migração, um pedido B2B era inserido em `pedidos` e NINGUÉM era
-- avisado: o fornecedor só descobria abrindo o dashboard, e a loja só sabia da
-- resposta reabrindo a página do fornecedor. As triggers abaixo fecham as duas
-- pontas, no mesmo estilo defensivo das triggers de `pedidos_clientes`
-- (o insert/update de notificação NUNCA pode derrubar a escrita do pedido).

-- ── Fornecedor recebe um novo pedido ────────────────────────────────────────
create or replace function public.notif_pedido_b2b_novo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  forn_user_id uuid;
  loja_nome    text;
begin
  select f.user_id into forn_user_id from public.fornecedores f where f.id = new.fornecedor_id;
  select l.nome    into loja_nome    from public.lojas l        where l.id = new.loja_id;

  if forn_user_id is not null then
    begin
      insert into public.notificacoes(user_id, tipo, titulo, mensagem, link, dados)
      values (
        forn_user_id, 'pedido_novo', 'Novo pedido!',
        coalesce(loja_nome, 'Uma loja') || ' fez um pedido de ' ||
          to_char(coalesce(new.total, 0), 'FM999G999G990D00') || ' reais.',
        '/fornecedor/dashboard',
        jsonb_build_object('pedido_id', new.id, 'total', new.total)
      );
    exception when others then
      raise warning '[notif_pedido_b2b_novo] falhou: %', sqlerrm;
    end;
  end if;
  return new;
end; $$;

drop trigger if exists trg_notif_pedido_b2b_novo on public.pedidos;
create trigger trg_notif_pedido_b2b_novo
after insert on public.pedidos
for each row execute function public.notif_pedido_b2b_novo();

-- ── Loja é avisada quando o fornecedor muda o status do pedido ───────────────
create or replace function public.notif_pedido_b2b_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  loja_user_id uuid;
  forn_nome    text;
  rotulo       text;
begin
  -- Só quando o status realmente muda (o checkout também dá UPDATE em `pedidos`
  -- para gravar a sessão do Stripe, e isso não deve gerar notificação).
  if new.status is not distinct from old.status then
    return new;
  end if;

  select l.user_id into loja_user_id from public.lojas l        where l.id = new.loja_id;
  select f.nome    into forn_nome    from public.fornecedores f where f.id = new.fornecedor_id;

  rotulo := case new.status
    when 'aceito'   then 'aceitou'
    when 'recusado' then 'recusou'
    when 'entregue' then 'marcou como entregue'
    else 'atualizou'
  end;

  if loja_user_id is not null then
    begin
      insert into public.notificacoes(user_id, tipo, titulo, mensagem, link, dados)
      values (
        loja_user_id, 'pedido_status', 'Atualização do pedido',
        coalesce(forn_nome, 'O fornecedor') || ' ' || rotulo || ' seu pedido.',
        '/fornecedor/' || new.fornecedor_id::text,
        jsonb_build_object('pedido_id', new.id, 'status', new.status)
      );
    exception when others then
      raise warning '[notif_pedido_b2b_status] falhou: %', sqlerrm;
    end;
  end if;
  return new;
end; $$;

drop trigger if exists trg_notif_pedido_b2b_status on public.pedidos;
create trigger trg_notif_pedido_b2b_status
after update on public.pedidos
for each row execute function public.notif_pedido_b2b_status();
