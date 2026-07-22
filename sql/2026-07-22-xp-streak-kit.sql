-- ============================================================================
-- XP EVENT-DRIVEN + ATIVIDADE DIÁRIA + KIT TRACKING
-- ----------------------------------------------------------------------------
-- Cobre a camada de dados de quatro frentes:
--   3. XP deixa de depender de o usuário abrir o app
--   4. grade de atividade diária (estilo GitHub) para o streak visual
--   5. novos `tipo` de notificação (o CHECK barra o que não estiver na lista)
--   6. kit_pedidos com rastreio real
--
-- ⚠️ DECISÃO CENTRAL DO XP — POR QUE RECALCULAR E NÃO INCREMENTAR
-- O motor em app/lib/gamificacaoServer.ts é PULL-BASED: ele computa o XP como
-- função pura das tabelas-fonte e grava com upsert (SET, não +=). Se o trigger
-- INCREMENTASSE, os dois brigariam — o usuário abriria o app, o reconciliador
-- sobrescreveria com o valor calculado e o incremento sumiria (ou dobraria,
-- dependendo da ordem). Então o trigger RECALCULA com a MESMA fórmula. Os dois
-- convergem para o mesmo número e a ordem entre eles deixa de importar.
--
-- 🔁 A FÓRMULA ESTÁ EM DOIS LUGARES e precisa ser mudada nos dois juntos:
--      SQL  -> public.recalcular_xp()            (aqui)
--      TS   -> reconciliarUsuario()              (gamificacaoServer.ts)
--    pedidos*10 + entregas*15 + recebidos*8 + avaliacoes*5
--      + indicacoes*20 + missoes*10 + (streak > 1 ? streak*2 : 0)
--
-- ⚠️ SEGURANÇA DO FLUXO PRINCIPAL: todo trigger daqui é AFTER e engole a
-- própria exceção. Gamificação NUNCA pode derrubar a criação de um pedido —
-- vale menos que a venda.
-- ============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Atividade diária (alimenta a grade do streak) + streak em SQL
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.atividade_dias (
  user_id  uuid not null references auth.users(id) on delete cascade,
  dia      date not null,
  eventos  integer not null default 0,
  primary key (user_id, dia)
);

alter table public.atividade_dias enable row level security;
drop policy if exists atividade_dias_dono on public.atividade_dias;
create policy atividade_dias_dono on public.atividade_dias
  for select to authenticated using (user_id = auth.uid());

create index if not exists atividade_dias_user_dia_idx
  on public.atividade_dias (user_id, dia desc);

-- Marca presença do dia e reavalia o streak. Mesma regra do `atualizarStreak`
-- em TS: mesmo dia não mexe; ontem soma 1; qualquer buraco reinicia em 1.
create or replace function public.registrar_atividade(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_hoje date := current_date; v_ultimo date; v_dias int; v_recorde int;
begin
  if p_user_id is null then return; end if;

  insert into public.atividade_dias (user_id, dia, eventos)
  values (p_user_id, v_hoje, 1)
  on conflict (user_id, dia) do update set eventos = atividade_dias.eventos + 1;

  select ultimo_dia, dias, recorde into v_ultimo, v_dias, v_recorde
    from public.streaks where user_id = p_user_id;

  if v_ultimo = v_hoje then return; end if;

  if v_ultimo = v_hoje - 1 then v_dias := coalesce(v_dias, 0) + 1;
  else v_dias := 1; end if;
  v_recorde := greatest(coalesce(v_recorde, 0), v_dias);

  insert into public.streaks (user_id, dias, recorde, ultimo_dia, updated_at)
  values (p_user_id, v_dias, v_recorde, v_hoje, now())
  on conflict (user_id) do update
    set dias = excluded.dias, recorde = excluded.recorde,
        ultimo_dia = excluded.ultimo_dia, updated_at = now();
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. XP recalculado (espelho exato da fórmula do TS)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.recalcular_xp(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cli uuid; v_ent uuid; v_loja uuid; v_forn uuid; v_papel text;
  v_pedidos int := 0; v_entregas int := 0; v_recebidos int := 0;
  v_avaliacoes int := 0; v_indic int := 0; v_missoes int := 0; v_streak int := 0;
  v_xp int;
begin
  if p_user_id is null then return null; end if;

  select id into v_cli  from public.clientes      where user_id = p_user_id limit 1;
  select id into v_ent  from public.entregadores  where user_id = p_user_id limit 1;
  select id into v_loja from public.lojas         where user_id = p_user_id limit 1;
  select id into v_forn from public.fornecedores  where user_id = p_user_id limit 1;

  -- Mesma precedência do TS: loja > entregador > fornecedor > cliente.
  v_papel := case
    when v_loja is not null then 'comerciante'
    when v_ent  is not null then 'entregador'
    when v_forn is not null then 'fornecedor'
    when v_cli  is not null then 'cliente'
  end;
  if v_papel is null then return null; end if;

  if v_cli is not null then
    select count(*) into v_pedidos    from public.pedidos_clientes where cliente_id = v_cli;
    select count(*) into v_avaliacoes from public.avaliacoes_lojas where cliente_id = v_cli;
  end if;
  if v_ent is not null then
    select count(*) into v_entregas from public.pedidos_clientes
      where entregador_id = v_ent and status = 'entregue';
  end if;
  if v_loja is not null then
    select count(*) into v_recebidos from public.pedidos_clientes where loja_id = v_loja;
  end if;

  select count(*) into v_indic from public.indicacoes
    where indicador_user_id = p_user_id and status in ('confirmada', 'recompensada');
  select count(*) into v_missoes from public.missoes_usuarios where user_id = p_user_id;
  select coalesce(dias, 0) into v_streak from public.streaks where user_id = p_user_id;

  v_xp := v_pedidos * 10 + v_entregas * 15 + v_recebidos * 8 + v_avaliacoes * 5
        + v_indic * 20 + v_missoes * 10
        + case when v_streak > 1 then v_streak * 2 else 0 end;

  insert into public.xp_usuarios (user_id, papel, xp, updated_at)
  values (p_user_id, v_papel, v_xp, now())
  on conflict (user_id) do update
    set xp = excluded.xp, papel = excluded.papel, updated_at = now();

  return v_xp;
end $$;

-- Atalho usado por todos os gatilhos: presença + XP, à prova de exceção.
create or replace function public.premiar(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_user_id is null then return; end if;
  perform public.registrar_atividade(p_user_id);
  perform public.recalcular_xp(p_user_id);
exception when others then
  -- Gamificação é acessória: nunca derruba o fluxo que a disparou.
  null;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Gatilhos por evento
-- ─────────────────────────────────────────────────────────────────────────────

-- Pedido criado -> XP para o CLIENTE (e presença para a LOJA, que recebeu venda).
create or replace function public.gamif_pedido_criado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_u uuid;
begin
  select user_id into v_u from public.clientes where id = new.cliente_id;
  perform public.premiar(v_u);
  select user_id into v_u from public.lojas where id = new.loja_id;
  perform public.premiar(v_u);
  return null;
exception when others then return null;
end $$;

drop trigger if exists trg_gamif_pedido_criado on public.pedidos_clientes;
create trigger trg_gamif_pedido_criado
  after insert on public.pedidos_clientes
  for each row execute function public.gamif_pedido_criado();

-- Pedido concluído -> XP para o COMERCIANTE e para o ENTREGADOR.
create or replace function public.gamif_pedido_concluido()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_u uuid;
begin
  if new.status = 'entregue' and old.status is distinct from 'entregue' then
    select user_id into v_u from public.lojas where id = new.loja_id;
    perform public.premiar(v_u);
    if new.entregador_id is not null then
      select user_id into v_u from public.entregadores where id = new.entregador_id;
      perform public.premiar(v_u);
    end if;
  end if;
  return null;
exception when others then return null;
end $$;

drop trigger if exists trg_gamif_pedido_concluido on public.pedidos_clientes;
create trigger trg_gamif_pedido_concluido
  after update on public.pedidos_clientes
  for each row execute function public.gamif_pedido_concluido();

-- Avaliação feita -> XP para quem AVALIOU.
create or replace function public.gamif_avaliacao()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_u uuid;
begin
  select user_id into v_u from public.clientes where id = new.cliente_id;
  perform public.premiar(v_u);
  return null;
exception when others then return null;
end $$;

drop trigger if exists trg_gamif_avaliacao on public.avaliacoes_lojas;
create trigger trg_gamif_avaliacao
  after insert on public.avaliacoes_lojas
  for each row execute function public.gamif_avaliacao();

-- Indicação registrada -> XP para quem INDICOU.
create or replace function public.gamif_indicacao()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.premiar(new.indicador_user_id);
  return null;
exception when others then return null;
end $$;

drop trigger if exists trg_gamif_indicacao on public.indicacoes;
create trigger trg_gamif_indicacao
  after insert on public.indicacoes
  for each row execute function public.gamif_indicacao();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Notificações: novos tipos
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️ Este CHECK já foi armadilha antes: inserir um `tipo` fora da lista falha e
-- derruba o fluxo que estava notificando. Ao criar categoria nova, ADICIONE aqui.
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in (
    'pedido_novo', 'pedido_status', 'parceria_aceita', 'corrida_oferta',
    'cupom', 'post_novo', 'flash_sale', 'retencao', 'relatorio', 'despacho',
    -- novos
    'kit_status', 'medalha', 'missao', 'ranking', 'cidade', 'convite',
    'promocao', 'boas_vindas'
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Kit do entregador — rastreio real
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.kit_pedidos (
  id             uuid primary key default gen_random_uuid(),
  entregador_id  uuid not null references public.entregadores(id) on delete cascade,
  status         text not null default 'aguardando_pagamento',
  codigo_rastreio text,
  valor          numeric(10,2),
  observacao     text,
  -- Cada mudança de status vira uma linha aqui: é o que a tela desenha.
  historico      jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint kit_pedidos_status_check check (status in (
    'aguardando_pagamento', 'producao', 'embalado', 'enviado',
    'saiu_entrega', 'recebido', 'ativado', 'cancelado'
  ))
);

create index if not exists kit_pedidos_entregador_idx
  on public.kit_pedidos (entregador_id, created_at desc);

alter table public.kit_pedidos enable row level security;

drop policy if exists kit_pedidos_dono_select on public.kit_pedidos;
create policy kit_pedidos_dono_select on public.kit_pedidos
  for select to authenticated
  using (entregador_id in (select id from public.entregadores where user_id = auth.uid()));

-- Escrita é só do servidor (service_role ignora RLS): status de kit não pode
-- ser avançado pelo próprio entregador.

-- Registra o histórico e notifica a cada mudança de status.
create or replace function public.kit_status_mudou()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_u uuid; v_txt text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  new.updated_at := now();
  new.historico := coalesce(new.historico, '[]'::jsonb) || jsonb_build_object(
    'status', new.status, 'em', now()
  );

  begin
    select user_id into v_u from public.entregadores where id = new.entregador_id;
    v_txt := case new.status
      when 'aguardando_pagamento' then 'Recebemos seu pedido do kit. Falta o pagamento.'
      when 'producao'    then 'Seu kit entrou em produção.'
      when 'embalado'    then 'Seu kit foi embalado.'
      when 'enviado'     then 'Seu kit foi enviado.'
      when 'saiu_entrega' then 'Seu kit saiu para entrega.'
      when 'recebido'    then 'Kit recebido. Falta só ativar!'
      when 'ativado'     then 'Conta ativada. Bem-vindo à rede oficial!'
      when 'cancelado'   then 'Seu pedido do kit foi cancelado.'
    end;
    if v_u is not null and v_txt is not null then
      insert into public.notificacoes (user_id, tipo, titulo, mensagem, link, dados)
      values (v_u, 'kit_status', 'Kit oficial', v_txt, '/kit',
              jsonb_build_object('kit_id', new.id, 'status', new.status));
    end if;
  exception when others then null;  -- notificar nunca derruba o rastreio
  end;

  return new;
end $$;

drop trigger if exists trg_kit_status on public.kit_pedidos;
create trigger trg_kit_status
  before insert or update on public.kit_pedidos
  for each row execute function public.kit_status_mudou();

commit;

-- ============================================================================
-- BACKFILL (rodar uma vez; recalcula XP e atividade de quem já existe)
--   select public.recalcular_xp(user_id) from public.xp_usuarios;
--
-- REVERTER:
--   drop trigger if exists trg_gamif_pedido_criado on public.pedidos_clientes;
--   drop trigger if exists trg_gamif_pedido_concluido on public.pedidos_clientes;
--   drop trigger if exists trg_gamif_avaliacao on public.avaliacoes_lojas;
--   drop trigger if exists trg_gamif_indicacao on public.indicacoes;
--   drop trigger if exists trg_kit_status on public.kit_pedidos;
--   drop table if exists public.kit_pedidos, public.atividade_dias;
--   drop function if exists public.premiar(uuid), public.recalcular_xp(uuid),
--                           public.registrar_atividade(uuid);
-- ============================================================================
