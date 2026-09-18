-- ============================================================================
-- B2B: GUARD DE PREÇO NOS PEDIDOS AO FORNECEDOR (achado "B2B sem guard de preço")
-- ----------------------------------------------------------------------------
-- O pedido B2B nunca passa por uma rota de API: `app/fornecedor/[id]/page.tsx`
-- insere direto em `pedidos` pela chave anon, e é o NAVEGADOR DO COMPRADOR que
-- escreve `itens[].preco` e `total`. A rota `/api/b2b/checkout` parecia cobrir
-- isso — o comentário dela diz "nunca confiar no `total` gravado" — mas ela
-- recalcula o total a partir de `itens[].preco`, que veio do mesmo comprador.
-- É autoconsistência, não autoridade.
--
-- Nenhuma linha do app relia `fornecedor_produtos.preco` no servidor antes de
-- cobrar, e `public.pedidos` só tinha dois triggers AFTER de notificação
-- (`trg_notif_pedido_b2b_novo`, `trg_notif_pedido_b2b_status`) — nenhum guard.
-- Não é um guard quebrado: é um guard que nunca foi escrito. O B2B (2026-07-10)
-- nasceu depois do delivery e não herdou o padrão do `pedidos_clientes_guard`.
--
-- ----------------------------------------------------------------------------
-- BASELINE MEDIDO EM PRODUÇÃO instantes antes deste arquivo, via REST com JWT
-- real (regra 12) de matheus@teste.com e fornecedor@teste.com:
--
--   POST /rest/v1/pedidos  itens=[{produto_id: <Óleo de soja 900ml>,
--                                  preco: 0.01, quantidade: 2}], total: 0.02
--   -> 201 Created, gravado tal e qual:
--      {"total": 0.02, "itens": [{"preco": 0.01, "quantidade": 2, ...}]}
--      R$179,80 de mercadoria (2 × R$89,90) encomendados por R$0,02.
--
--   PATCH /rest/v1/pedidos?id=eq.<id>  (JWT do FORNECEDOR, pedido pendente)
--        itens=[{... preco: 8990.00 ...}], total: 17980.00
--   -> 200 OK, total gravado: 17980
--      A fraude espelhada: a policy "fornecedor atualiza status" é
--      FOR UPDATE ... USING (fornecedor_id IN ...) SEM restrição de coluna. O
--      nome promete "status"; o efeito é "qualquer coluna". Como o checkout lê
--      `itens` no momento do clique, o fornecedor inflava o pedido depois de
--      aceito e o comerciante pagava a diferença.
--
--   PATCH status: 'entregue' -> 'pendente'  -> 200 OK, status: "pendente"
--      Só existia o CHECK de valores (`pedidos_status_check`), sem transição.
--
-- A linha de baseline foi apagada (pedidos volta a 0) antes deste arquivo.
--
-- ----------------------------------------------------------------------------
-- EXPOSIÇÃO REAL quando isto foi escrito: ZERO. `select count(*) from pedidos`
-- = 0 (nenhum pedido B2B jamais criado), `fornecedores` = 1 (o de teste) e
-- `stripe_onboarded = true` = 0, então nenhum checkout B2B jamais rodou em
-- produção. Isto é endurecimento pré-lançamento, não incidente — e por isso
-- não há backfill: não existe linha antiga para reprocessar.
--
-- ----------------------------------------------------------------------------
-- POR QUE GUARD SQL, E NÃO VALIDAÇÃO NA ROTA
--
-- Validar em `/api/b2b/checkout` NÃO corrige o bug:
--   1. O insert não passa pela rota. O pedido fraudado ficaria gravado,
--      notificado por trigger e visível no dashboard do fornecedor, que separa
--      a mercadoria achando que vendeu por R$89,90.
--   2. O pagamento online é OPCIONAL ("combine o pagamento direto com ele"
--      quando o fornecedor não tem Connect). Nesse caminho nenhuma rota é
--      chamada em momento algum.
--   3. É a regra de arquitetura do projeto: a segurança real mora na RLS/no
--      Postgres, não em rotas.
--
-- Um trigger BEFORE ainda tem a vantagem de CORRIGIR em vez de recusar: ele
-- reescreve `itens[].preco` a partir do catálogo, então a tela do comprador
-- continua funcionando sem mudança nenhuma, inclusive com o app antigo em
-- produção. Por isso a ordem de rollout é SQL PRIMEIRO, deploy depois.
--
-- ----------------------------------------------------------------------------
-- O QUE O GUARD FAZ
--
-- INSERT (o comprador só escolhe fornecedor, produtos, quantidades e observação):
--   1. Força status/pagamento/stripe/comissao/created_at — campos que não são
--      dele. `comissao` fica NULL de propósito: quem a escreve continua sendo
--      `/api/b2b/checkout`, agora a partir de um total autoritativo. Gravá-la
--      aqui inventaria comissão em pedido pago FORA da plataforma.
--   2. `itens` tem que ser array não-vazio.
--   3. `quantidade` inteira de 1 a 500 e `produto_id` no formato uuid — a
--      checagem de formato vem ANTES do cast para uuid, senão um produto_id
--      lixo estoura 22P02 em vez da mensagem P0001 (o guard do delivery tem
--      esse canto vivo; aqui não).
--   4. Todo produto tem que existir em `fornecedor_produtos` COM
--      `fornecedor_id = new.fornecedor_id` E `ativo` — fecha o item de outro
--      fornecedor e o produto desativado. É o análogo do `p.loja_id =
--      new.loja_id` do delivery.
--   5. `quantidade >= minimo_pedido` do catálogo — nunca foi verificado, nem
--      na tela nem no banco.
--   6. Reescreve cada item a partir do catálogo (`preco`, `nome`, `unidade`) e
--      recalcula `total`. É o bloco de preço autoritativo.
--
-- UPDATE (só o fornecedor tem policy de UPDATE; o comprador não tem nenhuma):
--   - Congela loja_id, fornecedor_id, itens, total, observacao, created_at.
--   - Congela os 4 campos de pagamento EXCETO para o service role — é o webhook
--     do Stripe (`pagamento_status`, `stripe_payment_intent`) e a própria rota
--     de checkout (`stripe_session_id`, `comissao`, `pagamento_metodo`) que
--     escrevem ali. Errar esta exceção quebra o pagamento B2B em silêncio
--     (update 204, zero linhas, sem `error`), que é o modo de falha que o teste
--     T9 existe para pegar.
--   - Transição de status: pendente -> aceito -> entregue, e pendente ->
--     recusado. Estado terminal congela em silêncio (mesmo comportamento do
--     `pedidos_clientes_guard`, que devolve `new.status := old.status`);
--     andar para trás a partir de estado não-terminal levanta P0001.
--
-- FORA DE ESCOPO DE PROPÓSITO: baixa de `fornecedor_produtos.estoque` no
-- aceite, e exigir `estoque >= quantidade`. O B2B não faz baixa de estoque
-- hoje; embutir isso aqui misturaria mudança de comportamento numa correção de
-- segurança, e `estoque` é nullable. Só `ativo` é validado.
--
-- ARMADILHA: os 5% de comissão existem em DOIS lugares — `COMISSAO_PCT` em
-- `app/lib/b2b.ts` e o literal na rota de checkout. Este arquivo NÃO grava
-- comissão justamente para não criar um terceiro. Se um dia o guard passar a
-- gravá-la, ela vira o par TS<->SQL da regra 7.
--
-- ROLLBACK: drop trigger if exists trg_pedidos_b2b_guard on public.pedidos;
--   (devolve exatamente o estado anterior; não remove policy nenhuma, então
--    não existe janela de tela quebrada e não há rollout em 2 fases)
--
-- APLICADO em produção em 2026-09-17 via MCP do Supabase.
-- ============================================================================

create or replace function public.pedidos_b2b_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  nome_ruim text; min_ruim int;
  ordem_old int; ordem_new int;
  eh_service boolean;
begin
  if tg_op = 'INSERT' then
    -- 1. Campos que o comprador não escolhe.
    new.status                := 'pendente';
    new.pagamento_status      := 'pendente';
    new.pagamento_metodo      := null;
    new.comissao              := null;
    new.stripe_session_id     := null;
    new.stripe_payment_intent := null;
    new.created_at            := now();
    new.updated_at            := now();

    -- 2. Carrinho não-vazio.
    if jsonb_typeof(coalesce(new.itens, '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(new.itens, '[]'::jsonb)) = 0 then
      raise exception 'Pedido sem itens.' using errcode = 'P0001';
    end if;

    -- 3. Forma de cada linha. O teste de formato do uuid vem ANTES de qualquer
    --    cast, para o erro sair como P0001 e não como 22P02.
    if exists (
      select 1 from jsonb_array_elements(new.itens) e
       where e->>'quantidade' is null
          or (e->>'quantidade') !~ '^[0-9]+$'
          or (e->>'quantidade')::numeric <= 0
          or (e->>'quantidade')::numeric > 500
    ) then
      raise exception 'Quantidade invalida no pedido (use inteiros de 1 a 500).'
        using errcode = 'P0001';
    end if;

    if exists (
      select 1 from jsonb_array_elements(new.itens) e
       where nullif(e->>'produto_id', '') is null
          or (e->>'produto_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then
      raise exception 'Item invalido no pedido: produto_id ausente ou malformado.'
        using errcode = 'P0001';
    end if;

    -- 4. Produto tem que ser DESTE fornecedor e estar ativo.
    if exists (
      select 1
        from jsonb_array_elements(new.itens) e
        left join public.fornecedor_produtos fp
               on fp.id = (e->>'produto_id')::uuid
              and fp.fornecedor_id = new.fornecedor_id
              and fp.ativo
       where fp.id is null
    ) then
      raise exception 'Item invalido no pedido: produto inexistente ou inativo neste fornecedor.'
        using errcode = 'P0001';
    end if;

    -- 5. Pedido mínimo do catálogo.
    select fp.nome, fp.minimo_pedido into nome_ruim, min_ruim
      from jsonb_array_elements(new.itens) e
      join public.fornecedor_produtos fp on fp.id = (e->>'produto_id')::uuid
     where (e->>'quantidade')::numeric < fp.minimo_pedido
     limit 1;

    if nome_ruim is not null then
      raise exception 'O pedido minimo de "%" e de % unidade(s).', nome_ruim, min_ruim
        using errcode = 'P0001';
    end if;

    -- 6. PREÇO AUTORITATIVO: o item é reescrito a partir do catálogo. O que o
    --    comprador mandou em `preco` e `nome` é descartado; sobram dele apenas
    --    `produto_id` e `quantidade`, ambos já validados acima.
    select
      coalesce(jsonb_agg(
        jsonb_build_object(
          'produto_id', fp.id,
          'nome',       fp.nome,
          'preco',      fp.preco,
          'quantidade', (e->>'quantidade')::int,
          'unidade',    fp.unidade
        ) order by fp.nome), '[]'::jsonb),
      coalesce(round(sum(fp.preco * (e->>'quantidade')::numeric), 2), 0)
      into new.itens, new.total
      from jsonb_array_elements(new.itens) e
      join public.fornecedor_produtos fp on fp.id = (e->>'produto_id')::uuid;

  elsif tg_op = 'UPDATE' then
    eh_service := (auth.role() = 'service_role');

    -- Nada do conteúdo do pedido muda depois de criado, para ninguém.
    new.id           := old.id;
    new.loja_id      := old.loja_id;
    new.fornecedor_id := old.fornecedor_id;
    new.itens        := old.itens;
    new.total        := old.total;
    new.observacao   := old.observacao;
    new.created_at   := old.created_at;
    new.updated_at   := now();

    -- Pagamento: só o service role (webhook do Stripe e /api/b2b/checkout).
    if not eh_service then
      new.comissao              := old.comissao;
      new.pagamento_status      := old.pagamento_status;
      new.pagamento_metodo      := old.pagamento_metodo;
      new.stripe_session_id     := old.stripe_session_id;
      new.stripe_payment_intent := old.stripe_payment_intent;
    end if;

    -- Status. Terminal congela em silêncio, como no guard do delivery.
    if old.status in ('entregue', 'recusado') then
      new.status := old.status;
    elsif new.status is distinct from old.status then
      if new.status = 'recusado' then
        if old.status <> 'pendente' then
          raise exception 'Pedido ja aceito nao pode ser recusado.' using errcode = 'P0001';
        end if;
      else
        ordem_old := array_position(array['pendente','aceito','entregue'], old.status);
        ordem_new := array_position(array['pendente','aceito','entregue'], new.status);
        if ordem_old is null or ordem_new is null or ordem_new < ordem_old then
          raise exception 'Transicao de status invalida: % -> %.', old.status, new.status
            using errcode = 'P0001';
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$function$;

-- O BEFORE roda antes dos dois AFTER de notificação, então
-- `notif_pedido_b2b_novo` passa a anunciar o total AUTORITATIVO ao fornecedor
-- (ela lê `new.total`, não recalcula nada) — que é exatamente o desejado.
drop trigger if exists trg_pedidos_b2b_guard on public.pedidos;
create trigger trg_pedidos_b2b_guard
  before insert or update on public.pedidos
  for each row execute function public.pedidos_b2b_guard();
