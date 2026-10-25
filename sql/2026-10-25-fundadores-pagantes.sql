-- =============================================================================
-- Prêmio dos 3 primeiros comerciantes que PAGAM a mensalidade (Fundador nº 1..3)
-- =============================================================================
-- STATUS: APLICADO em produção em 2026-10-25 (via MCP), md5 da função
--   bab33bd589da23e00cd4fc73253e4e09 (pg_get_functiondef). Testado em rollback
--   (19/19) e via REST com JWT (anon/authenticated sem execute nem escrita; dono
--   lê só a própria linha). fundadores segue com 0 linhas.
-- PRÉ-REQUISITO: sql/2026-10-25-lojas-oculta-vitrine.sql (coluna lojas.oculta).
--
-- Regras (ver conceder_fundador_pagante):
--   * só lojas criadas a partir de 2026-10-26 00:00 America/Sao_Paulo;
--   * fora: e-mail @teste.com, a conta admin (611f9ece…), lojas.oculta = true;
--   * só com valor efetivamente pago > 0 (cupom 100% / fatura zerada não conta);
--   * a assinatura informada tem de ser a da loja (lojas.stripe_subscription_id);
--   * cada vaga uma única vez: advisory lock transacional + índice único em
--     `ordem` (1..3) + unique(loja_id) que já existia. Reentrega da Stripe e
--     dois pagamentos simultâneos caem na mesma fila e não duplicam.
--   * prêmio: 1 mês de Ads grátis SEM passar pela Stripe —
--     destaque_ate = greatest(destaque_ate atual, now() + 31 dias). Sem cartão
--     e sem assinatura: expira sozinho, nada é cobrado depois.
--
-- `lojas.fundador` (preço R$29,90 das 100 primeiras, trigger auto_set_fundador)
-- é OUTRA coisa e não é tocado aqui. Nenhuma função/trigger existente é recriada.
-- Só chamado pelo webhook da Stripe (service_role).

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lojas' and column_name = 'oculta'
  ) then
    raise exception 'Aplique antes sql/2026-10-25-lojas-oculta-vitrine.sql (falta lojas.oculta)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Colunas novas (a tabela já existe: ALTER, não CREATE TABLE IF NOT EXISTS)
-- ---------------------------------------------------------------------------
alter table public.fundadores add column if not exists premiado_em            timestamptz;
alter table public.fundadores add column if not exists stripe_subscription_id text;
alter table public.fundadores add column if not exists valor_pago_centavos    integer;

-- Premiado tem ordem 1..3. Linha sem premiado_em (legado, hoje não há nenhuma)
-- não é afetada.
alter table public.fundadores drop constraint if exists fundadores_premio_ordem_chk;
alter table public.fundadores add constraint fundadores_premio_ordem_chk
  check (premiado_em is null or (ordem between 1 and 3 and valor_pago_centavos > 0));

-- Uma loja por vaga, mesmo que o lock falhe por algum motivo.
create unique index if not exists fundadores_ordem_premio_uniq
  on public.fundadores (ordem) where ordem between 1 and 3;

-- ---------------------------------------------------------------------------
-- Acesso: RLS ligado e zero policy até aqui (ninguém lia nem escrevia pelo
-- navegador). Grants amplos herdados do default do Supabase: tira a escrita e
-- deixa o dono LER a própria linha (selo no dashboard, que é client-side).
-- O perfil público e /fundadores leem pelo service role no servidor.
-- ---------------------------------------------------------------------------
revoke insert, update, delete, truncate, references, trigger on public.fundadores from anon, authenticated;

drop policy if exists fundadores_dono_le on public.fundadores;
create policy fundadores_dono_le on public.fundadores
  for select to authenticated
  using (loja_id in (select id from public.lojas where user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Concessão
-- ---------------------------------------------------------------------------
create or replace function public.conceder_fundador_pagante(
  p_loja_id        uuid,
  p_sub_id         text,
  p_valor_centavos integer
)
returns integer                -- ordem concedida (1..3), ou null se não concedeu
language plpgsql
security definer
set search_path = public
as $$
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

  select id, user_id, created_at, oculta, stripe_subscription_id, cidade_slug
    into v_loja
    from lojas where id = p_loja_id;
  if not found then return null; end if;

  if v_loja.stripe_subscription_id is distinct from p_sub_id then return null; end if;
  if v_loja.created_at < ('2026-10-26 00:00:00'::timestamp at time zone 'America/Sao_Paulo') then return null; end if;
  if coalesce(v_loja.oculta, false) then return null; end if;
  if v_loja.user_id = '611f9ece-10b8-4347-814b-9a7b91a987af'::uuid then return null; end if;

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
$$;

revoke all on function public.conceder_fundador_pagante(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.conceder_fundador_pagante(uuid, text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Conferência pós-aplicação
-- ---------------------------------------------------------------------------
-- select column_name from information_schema.columns
--  where table_name = 'fundadores' and column_name in ('premiado_em','stripe_subscription_id','valor_pago_centavos');
-- select indexname from pg_indexes where indexname = 'fundadores_ordem_premio_uniq';
-- select policyname from pg_policies where tablename = 'fundadores';
-- select has_function_privilege('authenticated', 'public.conceder_fundador_pagante(uuid,text,integer)', 'execute'); -- false
-- select has_function_privilege('service_role',  'public.conceder_fundador_pagante(uuid,text,integer)', 'execute'); -- true
