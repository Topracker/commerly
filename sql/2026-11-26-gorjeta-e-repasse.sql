-- ============================================================================
-- Gorjeta do entregador + retry do repasse Stripe — 2026-11-26
-- APLICADO em produção em 2026-11-26 (via MCP do Supabase).
-- ----------------------------------------------------------------------------
-- GORJETA
--  - `gorjeta` fica FORA de `total` (total = valor do pedido; o guard e o
--    acerto do dinheiro continuam iguais). A Stripe cobra total + gorjeta.
--  - Só existe no pagamento ONLINE: no INSERT sem pagamento online o guard zera
--    (dinheiro/vale: o cliente dá a gorjeta na mão — não mexemos no ledger
--    `acertos_dinheiro` nem no trigger acertos_gerar_na_entrega).
--  - Online, o valor vem do pedidos_pendentes (montado no servidor, cobrado na
--    Stripe); no UPDATE é congelado como total/taxa.
--  - 100% para o entregador: confirmar-entrega transfere valor_corrida + gorjeta.
--  - Estorno: as rotas de cancelamento fazem refund do payment_intent inteiro,
--    então a gorjeta volta junto.
--
-- REPASSE (transfer Stripe Connect ao entregador)
--  - Colunas de controle para o retry diário (/api/entregador/repasse-cron) e a
--    lista "Repasses travados" do admin. Só o service role escreve (guard).
--
-- Guard: alterado com replace() sobre o corpo VIVO (md5 de pg_get_functiondef
-- antes: d3b2fd087a1e73d6028a0085736a74fd; DEPOIS: d3ff27d77d77d86315ad37ba97708ad5).
-- Três inserções, cada âncora conferida como única antes de aplicar (o bloco
-- aborta se alguma não for única e é no-op se o guard já tiver gorjeta).
-- ============================================================================

alter table public.pedidos_clientes add column if not exists gorjeta numeric not null default 0;
alter table public.pedidos_clientes drop constraint if exists pedidos_clientes_gorjeta_check;
alter table public.pedidos_clientes add constraint pedidos_clientes_gorjeta_check check (gorjeta >= 0 and gorjeta <= 200);

alter table public.pedidos_pendentes add column if not exists gorjeta numeric not null default 0;
alter table public.pedidos_pendentes drop constraint if exists pedidos_pendentes_gorjeta_check;
alter table public.pedidos_pendentes add constraint pedidos_pendentes_gorjeta_check check (gorjeta >= 0 and gorjeta <= 200);

alter table public.pedidos_clientes add column if not exists stripe_transfer_id text;
alter table public.pedidos_clientes add column if not exists repasse_tentativas integer not null default 0;
alter table public.pedidos_clientes add column if not exists repasse_tentado_em timestamptz;
alter table public.pedidos_clientes add column if not exists repasse_erro text;

do $$
declare
  v_def text := pg_get_functiondef('public.pedidos_clientes_guard'::regproc);
  a1 text := 'new.pagamento_metodo := ''entrega'';';
  a2 text := 'new.troco_para := old.troco_para;';
  a3 text := 'new.stripe_refund_id := old.stripe_refund_id;';
  n int;
begin
  if position('gorjeta' in v_def) > 0 then
    raise notice 'guard já tem gorjeta — nada a fazer';
    return;
  end if;
  foreach n in array array[
    (length(v_def) - length(replace(v_def, a1, ''))) / length(a1),
    (length(v_def) - length(replace(v_def, a2, ''))) / length(a2),
    (length(v_def) - length(replace(v_def, a3, ''))) / length(a3)] loop
    if n <> 1 then raise exception 'âncora do guard não é única (%), abortando', n; end if;
  end loop;
  -- INSERT sem pagamento online: sem gorjeta.
  v_def := replace(v_def, a1, a1 || ' new.gorjeta := 0;');
  -- UPDATE: gorjeta congelada como total/taxa.
  v_def := replace(v_def, a2, a2 || ' new.gorjeta := old.gorjeta;');
  -- UPDATE fora do service role: controle do repasse é só do servidor.
  v_def := replace(v_def, a3, a3 ||
    ' new.stripe_transfer_id := old.stripe_transfer_id; new.repasse_tentativas := old.repasse_tentativas;' ||
    ' new.repasse_tentado_em := old.repasse_tentado_em; new.repasse_erro := old.repasse_erro;');
  execute v_def;
end $$;

-- INSERT online: limita a gorjeta (o CHECK já barra fora de 0..200) e arredonda.
-- Fica no guard? Não precisou: o webhook copia do pendente, que o servidor montou.
