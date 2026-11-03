-- 2026-11-03 — Flash Sale também para o COMERCIANTE (antes: só fornecedor).
--
-- A promoção-relâmpago (#13) nasceu do lado do fornecedor. O comerciante só
-- tinha promoções automáticas ("dias sem vender"). Agora a loja também lança
-- uma flash sale: título + desconto + duração, com countdown no feed e na busca
-- do cliente. Continua sendo um AVISO (não mexe no preço do pedido — o preço
-- de pedido é sempre do banco, regra 23).
--
-- Mudança ADITIVA, sem tocar nas policies existentes:
--   1. coluna loja_id (FK lojas, cascade) + índice
--   2. fornecedor_id deixa de ser NOT NULL; CHECK garante exatamente UM dono
--      (fornecedor OU loja). Linhas antigas têm fornecedor_id → passam no CHECK.
--   3. policies NOVAS para o dono da loja (insert/update/delete/select).
--      Policies permissivas se somam (OR) às do fornecedor, que ficam intactas:
--      flash_sales_insert_dono, _update_dono, _delete_dono, _select_dono,
--      _select_vigentes (ver 2026-07-15-features-12.sql e
--      2026-09-19-rls-promocoes-combos-flash-sales.sql).
--
-- Quem usa: app/api/flash-sale/route.ts (POST do comerciante grava loja_id;
-- GET lista as vigentes com o nome da loja via lojas_publicas).
-- A rota já tem paywall pelo proxy (/api/flash-sale está em APIS_COMERCIANTE).
--
-- STATUS: APLICADO em produção em 2026-11-03 (SQL Editor do Supabase, pelo dono).
-- Aplicado antes do deploy do código que usa loja_id.

begin;

-- 1. Coluna do dono-loja
alter table public.flash_sales
  add column if not exists loja_id uuid references public.lojas(id) on delete cascade;

create index if not exists flash_sales_loja_idx on public.flash_sales (loja_id);

-- 2. Exatamente um dono
alter table public.flash_sales alter column fornecedor_id drop not null;

alter table public.flash_sales drop constraint if exists flash_sales_um_dono_chk;
alter table public.flash_sales
  add constraint flash_sales_um_dono_chk check (num_nonnulls(fornecedor_id, loja_id) = 1);

-- 3. Policies do dono da loja (lojas tem leitura da própria linha pelo dono,
--    então a subquery enxerga a loja de quem está logado).
drop policy if exists flash_sales_insert_loja on public.flash_sales;
create policy flash_sales_insert_loja on public.flash_sales
  for insert to authenticated
  with check (
    loja_id is not null
    and exists (select 1 from public.lojas l where l.id = flash_sales.loja_id and l.user_id = auth.uid())
  );

drop policy if exists flash_sales_update_loja on public.flash_sales;
create policy flash_sales_update_loja on public.flash_sales
  for update to authenticated
  using (exists (select 1 from public.lojas l where l.id = flash_sales.loja_id and l.user_id = auth.uid()))
  with check (exists (select 1 from public.lojas l where l.id = flash_sales.loja_id and l.user_id = auth.uid()));

drop policy if exists flash_sales_delete_loja on public.flash_sales;
create policy flash_sales_delete_loja on public.flash_sales
  for delete to authenticated
  using (exists (select 1 from public.lojas l where l.id = flash_sales.loja_id and l.user_id = auth.uid()));

-- O dono lê as próprias, vigentes ou não (o POST conta as ativas e devolve a
-- criada com .select() — sem isto o insert "funciona" e volta zero linhas).
drop policy if exists flash_sales_select_loja on public.flash_sales;
create policy flash_sales_select_loja on public.flash_sales
  for select to authenticated
  using (exists (select 1 from public.lojas l where l.id = flash_sales.loja_id and l.user_id = auth.uid()));

commit;

-- Conferência (esperado: a coluna, o CHECK e 4 policies *_loja + as antigas):
-- select column_name, is_nullable from information_schema.columns
--  where table_schema = 'public' and table_name = 'flash_sales'
--    and column_name in ('fornecedor_id', 'loja_id');
-- select conname from pg_constraint where conname = 'flash_sales_um_dono_chk';
-- select policyname, cmd from pg_policies where tablename = 'flash_sales' order by 1;
--
-- REVERTER (só se nenhuma flash sale de loja tiver sido criada):
-- begin;
-- drop policy if exists flash_sales_insert_loja on public.flash_sales;
-- drop policy if exists flash_sales_update_loja on public.flash_sales;
-- drop policy if exists flash_sales_delete_loja on public.flash_sales;
-- drop policy if exists flash_sales_select_loja on public.flash_sales;
-- alter table public.flash_sales drop constraint if exists flash_sales_um_dono_chk;
-- delete from public.flash_sales where loja_id is not null;
-- alter table public.flash_sales alter column fornecedor_id set not null;
-- drop index if exists flash_sales_loja_idx;
-- alter table public.flash_sales drop column if exists loja_id;
-- commit;
