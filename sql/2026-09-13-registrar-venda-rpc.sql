-- ============================================================================
-- 2026-09-13 — RPC registrar_venda: baixa de estoque atômica (achado P1)
-- ----------------------------------------------------------------------------
-- Auditoria 2026-09-11, achado P1 (lost update na venda manual).
--
-- ANTES: app/vendas/page.tsx fazia, por item do carrinho,
--     update produtos set quantidade = <cache_do_mount - N> where ... and quantidade >= N
-- O filtro `>= N` só garantia que HAVIA estoque; o valor gravado era calculado
-- do cache carregado no mount da página. Duas abas/dois funcionários vendendo
-- o mesmo produto: a segunda gravava um número maior que o real. E os dois
-- "reverts" (falha no decremento seguinte ou no insert da venda) gravavam o
-- cache por cima do banco, sem condição — devolviam estoque que nunca saiu.
--
-- AGORA: uma função só, em transação:
--   * UPDATE relativo (quantidade = quantidade - N) com `quantidade >= N`
--     -> o Postgres serializa pelo lock de linha; a segunda venda concorrente
--        reavalia o WHERE depois do lock. Sem lost update.
--   * RETURNING nome, preco_venda, custo -> valor_total e lucro da venda saem
--     dos valores VIVOS do banco, não do cache.
--   * Qualquer RAISE desfaz tudo (função = transação). Sem revert manual.
--
-- SECURITY INVOKER de propósito: as policies de `produtos` e `vendas`
-- (dono da loja + paywall_plano) continuam valendo dentro da função. Nada é
-- aberto. Só função: nenhuma tabela, view, trigger ou policy é tocada.
--
-- Chamada (app/vendas/page.tsx):
--   supabase.rpc('registrar_venda', {
--     p_loja_id: loja.id,
--     p_itens: [{ produto_id, quantidade }, ...],
--     p_forma_pagamento: 'Dinheiro',
--   })
-- Retorno: { "vendas": n, "valor_total": x, "lucro": y }
--
-- STATUS: aplicado em produção via MCP em 2026-09-13 (após teste em bloco
-- DO ... RAISE -> rollback).
-- ============================================================================

create or replace function public.registrar_venda(
  p_loja_id uuid,
  p_itens jsonb,
  p_forma_pagamento text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item        record;
  v_nome        text;
  v_preco       numeric;
  v_custo       numeric;
  v_disponivel  integer;
  v_vendas      integer := 0;
  v_total       numeric := 0;
  v_lucro       numeric := 0;
begin
  if p_loja_id is null then
    raise exception 'Loja não informada.' using errcode = 'P0001';
  end if;
  -- Só o dono, pela sessão dele (auth.uid()). Sem isto, outro usuário recebia
  -- "Estoque insuficiente" em vez de "não encontrada": o UPDATE era barrado
  -- pela RLS, mas `produtos_select_public` deixava o SELECT de fallback ver o
  -- produto. Nada era gravado — só a mensagem ficava errada.
  if not exists (select 1 from public.lojas where id = p_loja_id and user_id = auth.uid()) then
    raise exception 'Loja não encontrada.' using errcode = 'P0002';
  end if;
  -- Mesma regra das policies paywall_plano (restritivas): mensagem clara em
  -- vez de "Produto não encontrado".
  if public.plano_bloqueia(p_loja_id) then
    raise exception 'Plano vencido: regularize a assinatura para registrar vendas.' using errcode = 'P0001';
  end if;
  if p_forma_pagamento is null or btrim(p_forma_pagamento) = '' then
    raise exception 'Informe a forma de pagamento.' using errcode = 'P0001';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Carrinho vazio.' using errcode = 'P0001';
  end if;

  -- Soma por produto: a UI já mescla itens repetidos, mas um payload montado à
  -- mão não pode decrementar a mesma linha duas vezes com checagens separadas.
  for v_item in
    select x.produto_id, sum(x.quantidade)::integer as quantidade
    from jsonb_to_recordset(p_itens) as x(produto_id uuid, quantidade integer)
    group by x.produto_id
  loop
    if v_item.produto_id is null then
      raise exception 'Item sem produto.' using errcode = 'P0001';
    end if;
    if v_item.quantidade is null or v_item.quantidade <= 0 then
      raise exception 'Quantidade inválida.' using errcode = 'P0001';
    end if;

    -- Decremento RELATIVO e condicional: é aqui que o lost update morre.
    update public.produtos
       set quantidade = quantidade - v_item.quantidade
     where id = v_item.produto_id
       and loja_id = p_loja_id
       and quantidade >= v_item.quantidade
    returning nome, preco_venda, custo
      into v_nome, v_preco, v_custo;

    if not found then
      -- Distingue "não existe / não é sua / paywall" de "existe mas sem estoque".
      select nome, quantidade into v_nome, v_disponivel
        from public.produtos
       where id = v_item.produto_id and loja_id = p_loja_id;
      if not found then
        raise exception 'Produto não encontrado.' using errcode = 'P0002';
      end if;
      raise exception 'Estoque insuficiente para "%" (disponível: %).', v_nome, v_disponivel
        using errcode = 'P0001';
    end if;

    -- Valores VIVOS do banco (RETURNING acima), nunca do cache da tela.
    insert into public.vendas (loja_id, produto_id, quantidade, valor_total, lucro, forma_pagamento, origem)
    values (
      p_loja_id,
      v_item.produto_id,
      v_item.quantidade,
      v_preco * v_item.quantidade,
      (v_preco - coalesce(v_custo, 0)) * v_item.quantidade,
      p_forma_pagamento,
      'manual'
    );

    v_vendas := v_vendas + 1;
    v_total  := v_total + v_preco * v_item.quantidade;
    v_lucro  := v_lucro + (v_preco - coalesce(v_custo, 0)) * v_item.quantidade;
  end loop;

  return jsonb_build_object('vendas', v_vendas, 'valor_total', v_total, 'lucro', v_lucro);
end;
$$;

-- Só usuário autenticado chama; anon e public não enxergam a função.
revoke all on function public.registrar_venda(uuid, jsonb, text) from public, anon;
grant execute on function public.registrar_venda(uuid, jsonb, text) to authenticated;
