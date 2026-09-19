-- ============================================================================
-- L5: o horário da loja passa a bloquear pedido fora do expediente
-- ----------------------------------------------------------------------------
-- `lojas.horario` ("HH:MM - HH:MM", escolhido em selects de meia em meia hora)
-- era decorativo: as 3 páginas públicas exibiam o texto e NINGUÉM o lia para
-- decidir nada — nem PedidoModal, nem /api/cliente/pedido-checkout, nem os
-- triggers BEFORE INSERT de pedidos_clientes.
--
-- Regra (a MESMA em app/lib/horario.ts — mudou aqui, mude lá):
--   * nulo ou não-parseável            -> ABERTA (fail-open: um campo que até
--                                         hoje não valia nada não pode passar a
--                                         derrubar venda por valor malformado)
--   * abre <  fecha (08:00 - 18:00)    -> aberta se abre <= agora < fecha
--   * abre >  fecha (18:00 - 02:00)    -> atravessa a meia-noite:
--                                         aberta se agora >= abre OU agora < fecha
--   * abre == fecha                    -> 24h
--   Fuso: America/Sao_Paulo, igual ao eh_horario_pico() já existente.
--   Dias da semana NÃO são cobertos (pendência de produto; quando vier, é só
--   esta função que muda).
--
-- Trigger NOVO e pequeno, no molde de bloquear_pedido_delivery_desligado /
-- bloquear_pedido_loja_sem_plano — pedidos_clientes_guard NÃO é tocado
-- (recriá-lo já custou o preço autoritativo uma vez).
--
-- Exceção: pedido JÁ PAGO chegando pelo webhook do Stripe (service_role +
-- stripe_session_id). Ele foi validado ANTES de cobrar, no checkout; recusar
-- depois de cobrar seria pior do que aceitar (a loja cancela e estorna pelo
-- painel se precisar). Modo Festa (service role SEM stripe) passa pelo
-- trigger: a rota /api/festa/fechar já faz rollback e devolve erro.
--
-- Aplicado em produção via MCP em 2026-09-19.
-- ============================================================================

create or replace function public.loja_aberta(p_horario text, p_em timestamptz default now())
returns boolean
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  m text[];
  abre time; fecha time; agora time;
begin
  if p_horario is null then return true; end if;
  -- Aceita "08:00 - 18:00", "08:00-18:00" e o "10:00--20:00" que já existiu.
  m := regexp_match(btrim(p_horario), '^(\d{1,2}:\d{2})\s*-+\s*(\d{1,2}:\d{2})$');
  if m is null then return true; end if;
  begin
    abre  := m[1]::time;
    fecha := m[2]::time;
  exception when others then
    return true;  -- "25:99" e afins: fail-open
  end;
  agora := (p_em at time zone 'America/Sao_Paulo')::time;
  if abre = fecha then return true; end if;
  if abre < fecha then return agora >= abre and agora < fecha; end if;
  return agora >= abre or agora < fecha;  -- atravessa a meia-noite
end;
$function$;

create or replace function public.bloquear_pedido_fora_horario()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_horario text; v_nome text;
begin
  -- Pedido já pago (webhook): validado antes de cobrar, não recusa agora.
  if auth.role() = 'service_role' and nullif(new.stripe_session_id, '') is not null then
    return new;
  end if;

  select horario, nome into v_horario, v_nome from public.lojas where id = new.loja_id;

  if not public.loja_aberta(v_horario, now()) then
    raise exception 'A loja % esta fechada agora. Horario de funcionamento: %.',
      coalesce(v_nome, ''), v_horario
      using errcode = 'check_violation';
  end if;
  return new;
end $function$;

drop trigger if exists trg_bloquear_fora_horario on public.pedidos_clientes;
create trigger trg_bloquear_fora_horario
  before insert on public.pedidos_clientes
  for each row execute function public.bloquear_pedido_fora_horario();

-- Conferência (tabela-verdade; timestamps em UTC, Brasília = UTC-3):
--   select loja_aberta('08:00 - 18:00', '2026-09-19 15:00:00+00');  -- 12:00 BRT -> t
--   select loja_aberta('08:00 - 18:00', '2026-09-19 22:00:00+00');  -- 19:00 BRT -> f
--   select loja_aberta('18:00 - 02:00', '2026-09-20 02:30:00+00');  -- 23:30 BRT -> t
--   select loja_aberta('18:00 - 02:00', '2026-09-20 04:00:00+00');  -- 01:00 BRT -> t
--   select loja_aberta('18:00 - 02:00', '2026-09-19 15:00:00+00');  -- 12:00 BRT -> f
--   select loja_aberta('08:00 - 08:00', now());                      -- 24h     -> t
--   select loja_aberta(null, now()), loja_aberta('lixo', now());     -- t, t
-- Rollback: drop trigger trg_bloquear_fora_horario on public.pedidos_clientes;
