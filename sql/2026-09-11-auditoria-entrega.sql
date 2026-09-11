-- ===========================================================================
-- Auditoria do sistema de entrega (2026-09-11) — correções
--
-- Achados testados contra PRODUÇÃO com as contas de teste:
--
--  1. O código de confirmação de 4 dígitos ficava LEGÍVEL para o entregador
--     (`pedidos_clientes.codigo_confirmacao` + policy de SELECT). Isso anula o
--     controle: o entregador podia marcar "entregue" sem encontrar o cliente.
--     -> o código passa a viver em `pedido_codigos`, que só o cliente e a loja
--        leem. A coluna antiga continua sendo escrita nesta etapa (dual-write)
--        para não quebrar a versão do app que ainda está no ar.
--
--  2. Entregador com PARCERIA aceita lia o código, o nome, o telefone e o
--     endereço de QUALQUER pedido da loja — inclusive os atribuídos a outro
--     entregador. A lista "Pedidos disponíveis" só precisa dos pedidos SEM
--     entregador, então a policy foi estreitada para isso.
--
--  3. Cancelamento (pelo cliente ou pela loja) avisava o cliente, mas nunca o
--     ENTREGADOR — que podia estar a caminho da loja.
-- ===========================================================================

-- ── 1. Código de confirmação em tabela própria ─────────────────────────────
create table if not exists public.pedido_codigos (
  pedido_id  uuid primary key references public.pedidos_clientes(id) on delete cascade,
  codigo     text not null,
  created_at timestamptz not null default now()
);

alter table public.pedido_codigos enable row level security;

-- Só o dono do pedido e a loja enxergam. Sem policy de INSERT/UPDATE de
-- propósito: quem escreve é o trigger (security definer) e o service role.
drop policy if exists codigo_select_cliente on public.pedido_codigos;
create policy codigo_select_cliente on public.pedido_codigos
for select to authenticated
using (exists (
  select 1 from public.pedidos_clientes p
    join public.clientes c on c.id = p.cliente_id
   where p.id = pedido_codigos.pedido_id and c.user_id = auth.uid()
));

drop policy if exists codigo_select_loja on public.pedido_codigos;
create policy codigo_select_loja on public.pedido_codigos
for select to authenticated
using (exists (
  select 1 from public.pedidos_clientes p
    join public.lojas l on l.id = p.loja_id
   where p.id = pedido_codigos.pedido_id and l.user_id = auth.uid()
));

-- Nasce quando o pedido sai para entrega e NUNCA muda (o `do nothing` é o que
-- garante isso, mesmo que o pedido seja atualizado várias vezes em 'saiu').
create or replace function public.pedido_gera_codigo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'saiu' and old.status is distinct from 'saiu' then
    insert into public.pedido_codigos (pedido_id, codigo)
    values (new.id, coalesce(nullif(new.codigo_confirmacao, ''),
                             lpad((floor(random() * 10000))::int::text, 4, '0')))
    on conflict (pedido_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_pedido_gera_codigo on public.pedidos_clientes;
create trigger trg_pedido_gera_codigo
after update of status on public.pedidos_clientes
for each row execute function public.pedido_gera_codigo();

-- Backfill: pedidos que já têm código (inclusive os em rota agora) não podem
-- ficar sem a linha nova, senão a confirmação para de funcionar para eles.
insert into public.pedido_codigos (pedido_id, codigo)
select id, codigo_confirmacao
  from public.pedidos_clientes
 where codigo_confirmacao is not null and codigo_confirmacao <> ''
on conflict (pedido_id) do nothing;

-- ── 2. Entregador parceiro só vê pedido SEM dono ───────────────────────────
drop policy if exists pedidos_entregador_select on public.pedidos_clientes;
create policy pedidos_entregador_select on public.pedidos_clientes
for select to authenticated
using (
  -- o pedido é dele
  exists (
    select 1 from public.entregadores e
     where e.id = pedidos_clientes.entregador_id and e.user_id = auth.uid()
  )
  -- ou está na fila aberta de uma loja de que ele é parceiro
  or (
    pedidos_clientes.entregador_id is null
    and pedidos_clientes.status in ('recebido', 'preparando')
    and exists (
      select 1 from public.entregador_parcerias pa
        join public.entregadores e on e.id = pa.entregador_id
       where pa.loja_id = pedidos_clientes.loja_id
         and pa.status = 'aceita'
         and e.user_id = auth.uid()
    )
  )
);

-- ── 3. Cancelamento também avisa o ENTREGADOR ──────────────────────────────
create or replace function public.notif_status_pedido()
returns trigger language plpgsql security definer set search_path = public as $$
declare cliente_user_id uuid; entregador_user_id uuid; loja_nome text; msg text;
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

  -- Pedido cancelado com entregador designado: ele pode estar a caminho da
  -- loja. Antes desta auditoria ninguém avisava — o card sumia da tela dele.
  if new.status = 'cancelado' and new.entregador_id is not null then
    select e.user_id into entregador_user_id
      from public.entregadores e join auth.users u on u.id = e.user_id
     where e.id = new.entregador_id;
    select l.nome into loja_nome from public.lojas l where l.id = new.loja_id;

    if entregador_user_id is not null then
      begin
        insert into public.notificacoes(user_id, tipo, titulo, mensagem, link, dados)
        values (entregador_user_id, 'pedido_status', 'Corrida cancelada ❌',
                'O pedido ' || coalesce('de ' || loja_nome, '') ||
                ' foi cancelado. Não precisa mais buscar.',
                '/entregador-delivery/dashboard',
                jsonb_build_object('pedido_id', new.id, 'status', 'cancelado'));
      exception when others then
        raise warning '[notif_status_pedido] aviso ao entregador falhou: %', sqlerrm;
      end;
    end if;

    -- Encerra a oferta aceita: sem isto ela fica 'aceita' para sempre e suja o
    -- histórico de despacho do pedido.
    update public.corrida_ofertas set status = 'expirada'
     where pedido_id = new.id and status in ('pendente', 'aceita');
  end if;

  return new;
end; $$;
