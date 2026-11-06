-- 2026-11-06 — Contas fora do prêmio Fundador nº 1..3 e da vaga de fundador.
--
-- ESTADO: APLICADO em produção em 2026-11-06.
--
-- Nenhuma conta é apagada ou alterada: mudam só as duas regras abaixo.
--   conceder_fundador_pagante (selo numerado, medalha e Ads, decididos no pagamento):
--     passa a recusar também a conta do dono do produto e a de um amigo dele.
--   auto_set_fundador (vaga e preço de fundador, decididos no cadastro):
--     loja nova dessas mesmas contas (admin, dono e amigo) não ocupa vaga.
-- O selo numerado continua seguindo o PAGAMENTO.
--
-- Corpos partiram do banco vivo em 2026-11-06 (pg_get_functiondef):
--   auto_set_fundador          md5 40777273a43acf80bec65f742d294cee
--   conceder_fundador_pagante  md5 bab33bd589da23e00cd4fc73253e4e09

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
