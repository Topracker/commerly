-- 2026-11-03 — Cupom no BALCÃO: o comerciante aplica o cupom no caixa (Vendas).
--
-- Problema: o cupom da campanha de retorno ("sentimos sua falta") só podia ser
-- usado no Modo Festa (aplicar_cupom_festa), que depende de pedido online —
-- e pedido online depende de delivery (hoje só em Goiânia). Fora disso o
-- cliente recebia um cupom impossível de usar.
--
-- Solução: função NOVA `registrar_venda_cupom`, que:
--   1. trava e valida o cupom (da loja, não usado, não vencido, sem festa);
--   2. chama a `registrar_venda` ORIGINAL (intocada — corpo vivo conferido em
--      2026-11-03, igual a sql/2026-09-13-registrar-venda-rpc.sql), que faz a
--      baixa de estoque e grava as linhas de venda com preço VIVO do banco;
--   3. confere o mínimo do cupom contra o total real;
--   4. distribui o desconto nas linhas gravadas NESTA transação (valor e lucro);
--   5. marca o cupom como usado (usado_em + desconto_aplicado).
-- Tudo numa transação: qualquer erro desfaz a venda e o cupom continua livre.
--
-- `cupom_usos` não serve aqui (pedido_id é NOT NULL — é do pedido online).
-- O uso no balcão fica no próprio cupom: usado_em + desconto_aplicado.
--
-- SECURITY DEFINER porque o passo 4 atualiza `vendas` (a RLS de vendas não
-- garante UPDATE ao dono). As travas de segurança são explícitas:
--   - dono da loja por auth.uid() (vem do JWT, vale também em definer);
--   - plano_bloqueia() (paywall) — a registrar_venda checa de novo;
--   - todo UPDATE é filtrado por loja_id = p_loja_id.
--
-- Quem usa: app/vendas/page.tsx (campo "Cupom"; vazio = registrar_venda).
--
-- STATUS: NÃO APLICADO. Aplicar no SQL Editor do Supabase e rodar a
-- conferência do fim.

create or replace function public.registrar_venda_cupom(
  p_loja_id uuid,
  p_itens jsonb,
  p_forma_pagamento text,
  p_cupom text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cupom     public.cupons%rowtype;
  v_codigo    text := upper(btrim(coalesce(p_cupom, '')));
  v_venda     jsonb;
  v_total     numeric;
  v_desconto  numeric;
  v_fator     numeric;
  v_linhas    integer;
begin
  if p_loja_id is null then
    raise exception 'Loja não informada.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.lojas where id = p_loja_id and user_id = auth.uid()) then
    raise exception 'Loja não encontrada.' using errcode = 'P0002';
  end if;
  if public.plano_bloqueia(p_loja_id) then
    raise exception 'Plano vencido: regularize a assinatura para registrar vendas.' using errcode = 'P0001';
  end if;
  if v_codigo = '' then
    raise exception 'Informe o código do cupom.' using errcode = 'P0001';
  end if;

  -- 1. Cupom DESTA loja, travado contra uso duplo simultâneo (duas abas).
  --    Cupom sem loja (Garantia, custeado pela plataforma) não vale no balcão.
  select * into v_cupom
    from public.cupons
   where upper(codigo) = v_codigo
     and loja_id = p_loja_id
   for update;

  if not found then
    raise exception 'Cupom "%" não encontrado nesta loja.', v_codigo using errcode = 'P0001';
  end if;
  if v_cupom.usado_em is not null then
    raise exception 'Este cupom já foi usado.' using errcode = 'P0001';
  end if;
  if v_cupom.festa_id is not null then
    raise exception 'Este cupom está reservado em um pedido em grupo.' using errcode = 'P0001';
  end if;
  if v_cupom.expira_em is not null and v_cupom.expira_em <= now() then
    raise exception 'Este cupom venceu.' using errcode = 'P0001';
  end if;

  -- 2. Venda pela função original (estoque + preço vivo + paywall).
  v_venda := public.registrar_venda(p_loja_id, p_itens, p_forma_pagamento);
  v_total := coalesce((v_venda ->> 'valor_total')::numeric, 0);

  -- 3. Mínimo do cupom contra o total REAL (preço do banco).
  if v_total < coalesce(v_cupom.minimo, 0) then
    raise exception 'Este cupom vale para compras a partir de R$ %.', to_char(v_cupom.minimo, 'FM999G990D00')
      using errcode = 'P0001';
  end if;

  v_desconto := case v_cupom.tipo
    when 'percentual' then round(v_total * v_cupom.valor / 100, 2)
    else least(v_cupom.valor, v_total)
  end;
  v_desconto := greatest(0, least(v_desconto, v_total));

  -- 4. Desconto proporcional nas linhas gravadas nesta transação. now() é o
  --    instante da TRANSAÇÃO, então casa só com as linhas que a registrar_venda
  --    acabou de inserir; a contagem confere com o que ela devolveu.
  if v_total > 0 and v_desconto > 0 then
    v_fator := v_desconto / v_total;
    update public.vendas
       set lucro       = lucro - round(valor_total * v_fator, 2),
           valor_total = valor_total - round(valor_total * v_fator, 2)
     where loja_id = p_loja_id
       and origem = 'manual'
       and created_at = now();
    get diagnostics v_linhas = row_count;
    if v_linhas <> coalesce((v_venda ->> 'vendas')::integer, -1) then
      raise exception 'Não foi possível aplicar o cupom nesta venda. Tente de novo.' using errcode = 'P0001';
    end if;
  end if;

  -- 5. Cupom usado.
  update public.cupons
     set usado_em = now(),
         desconto_aplicado = v_desconto
   where id = v_cupom.id;

  return v_venda || jsonb_build_object(
    'desconto', v_desconto,
    'valor_total', v_total - v_desconto,
    'lucro', coalesce((v_venda ->> 'lucro')::numeric, 0) - v_desconto,
    'cupom', v_cupom.codigo
  );
end;
$$;

revoke all on function public.registrar_venda_cupom(uuid, jsonb, text, text) from public, anon;
grant execute on function public.registrar_venda_cupom(uuid, jsonb, text, text) to authenticated;

-- Conferência:
-- select proname, prosecdef from pg_proc where proname in ('registrar_venda', 'registrar_venda_cupom');
--   esperado: registrar_venda | f   e   registrar_venda_cupom | t
-- select column_default from information_schema.columns
--  where table_schema = 'public' and table_name = 'vendas' and column_name = 'created_at';
--   esperado: now()  (o passo 4 depende disso; se vier outra coisa, NÃO use o cupom e me avise)
--
-- REVERTER:
-- drop function if exists public.registrar_venda_cupom(uuid, jsonb, text, text);
