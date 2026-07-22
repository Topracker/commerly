-- ============================================================================
-- PAYWALL NA RLS — o bloqueio que o proxy.ts não consegue dar
-- ----------------------------------------------------------------------------
-- O painel é client-side e fala DIRETO com o PostgREST usando a chave anon.
-- Bloquear a rota HTTP no proxy tira o painel do ar, mas não tira os dados: com
-- a sessão válida na mão, um `fetch` no /rest/v1 continua respondendo. Este
-- arquivo é o bloqueio de verdade.
--
-- DECISÕES (tomadas com o dono do projeto em 2026-07-22):
--
--   1. BLOQUEIO TOTAL PARA O DONO. Com o plano vencido o comerciante perde
--      SELECT/INSERT/UPDATE/DELETE nas tabelas da própria loja — inclusive a
--      leitura do histórico.
--   2. VITRINE INTACTA PARA O CLIENTE. O consumidor continua vendo o cardápio,
--      achando a loja na busca e fazendo pedido. Quem sente a inadimplência é
--      o comerciante, não o consumidor.
--
-- Como (2) e (1) valem sobre AS MESMAS TABELAS, a policy não pode ser "trave
-- esta linha": ela é condicionada a QUEM está chamando. `plano_bloqueia()` só
-- devolve true quando o chamador é o DONO daquela loja. Para o cliente, para o
-- entregador e para o fornecedor a expressão é falsa e nada muda.
--
-- MECANISMO: `AS RESTRICTIVE`. Todas as policies que já existem no schema são
-- PERMISSIVE, e permissivas se somam por OR — criar mais uma não restringiria
-- coisa alguma. As restritivas entram por AND por cima do que já existe, então
-- este arquivo se sobrepõe ao modelo atual sem reescrever nenhuma policy.
--
-- `service_role` IGNORA RLS por atributo do papel (rolbypassrls), portanto
-- webhook da Stripe, crons e rotas de servidor NÃO são afetados por nada aqui.
-- Isso é essencial: é o webhook que grava plano='ativo' e regulariza a loja.
--
-- EFEITO HOJE: NENHUM. As 17 lojas em `plano='inativo'` estão com
-- `trial_expira_em = 2026-07-28 21:30 UTC`, ou seja, liberadas. Esta migração
-- fica ARMADA e dispara sozinha naquele instante, junto com o proxy.
-- ============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A regra, em um lugar só
-- ─────────────────────────────────────────────────────────────────────────────
-- Espelha `situacaoPlano()` de app/lib/plano.ts:
--     liberada = plano = 'ativo'  OU  trial_expira_em ainda no futuro
-- Logo:
--     bloqueada = plano <> 'ativo' E (trial nulo OU trial já venceu)
--
-- SEM `security definer`, de propósito, por dois motivos:
--   * função SQL simples e STABLE pode ser INLINADA pelo planner; com definer
--     o Postgres nunca inlina e passaríamos a pagar uma chamada por linha;
--   * ela não precisa de privilégio nenhum — o dono enxerga a própria linha em
--     `lojas` pela policy `lojas_select_own` que já existe.
--
-- Se por algum motivo a leitura de `lojas` falhar, o EXISTS dá falso e o acesso
-- é LIBERADO. Falha aberta é intencional aqui, igual ao proxy: um erro de
-- infraestrutura não pode trancar do lado de fora quem está pagando.
create or replace function public.plano_bloqueia(p_loja_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
      from public.lojas l
     where l.id = p_loja_id
       and l.user_id = auth.uid()                    -- só morde o DONO
       and l.plano is distinct from 'ativo'
       and (l.trial_expira_em is null or l.trial_expira_em <= now())
  )
$$;

comment on function public.plano_bloqueia(uuid) is
  'true quando quem chama e o dono da loja e o plano dela esta vencido. '
  'Espelha situacaoPlano() de app/lib/plano.ts. Usada nas policies de paywall.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. A policy, replicada nas tabelas da loja
-- ─────────────────────────────────────────────────────────────────────────────
-- USING cobre SELECT/UPDATE/DELETE; WITH CHECK cobre INSERT/UPDATE. Os dois são
-- necessários: `FOR ALL` só com USING deixaria o INSERT passar.
--
-- FICAM DE FORA, e cada uma por um motivo:
--
--   lojas             A linha de controle. Se o dono perde o SELECT dela, o
--                     `useAuth` e o proxy não conseguem nem descobrir que ele
--                     está vencido (o proxy falha aberta e DESTRAVARIA tudo), e
--                     a tela /planos não teria como oferecer a assinatura. Uma
--                     loja bloqueada precisa continuar enxergando a si mesma
--                     para poder voltar.
--   pedidos_pendentes RLS ligada e ZERO policies: já é inacessível pela chave
--                     anon. É área só do service_role (staging da Stripe).
--   fundadores        Mesma situação: RLS ligada, zero policies.
do $$
declare
  t text;
  alvos text[] := array[
    'academy_progresso', 'agendamentos', 'assistente_conversas', 'avaliacoes_lojas',
    'campanhas_retorno', 'clube_movimentos', 'combos', 'conquistas',
    'corrida_ofertas', 'cupons', 'entregador_parcerias', 'feedbacks',
    'festa_lojas', 'fiado', 'funcionarios', 'gastos', 'insights_semanais',
    'loja_seguidores', 'mensagens', 'mensagens_clientes', 'mercadopago_conexoes',
    'pagbank_conexoes', 'pedidos', 'pedidos_clientes', 'pontos_clientes',
    'posts', 'produtos', 'promocao_regras', 'promocoes', 'servicos',
    'stories', 'vendas'
  ];
begin
  foreach t in array alvos loop
    -- Guarda de segurança: se uma tabela for renomeada, falha alto em vez de
    -- fingir que aplicou o paywall nela.
    if to_regclass('public.' || t) is null then
      raise exception 'Tabela public.% nao existe — revise a lista de alvos.', t;
    end if;

    execute format('drop policy if exists paywall_plano on public.%I', t);
    execute format($f$
      create policy paywall_plano on public.%I
        as restrictive
        for all
        to authenticated
        using       (not public.plano_bloqueia(loja_id))
        with check  (not public.plano_bloqueia(loja_id))
    $f$, t);
  end loop;
end $$;

commit;

-- ============================================================================
-- CONFERÊNCIA (rodar depois; deve listar 32 tabelas, todas polpermissive=false)
-- ----------------------------------------------------------------------------
--   select c.relname, p.polpermissive, pg_get_expr(p.polqual, p.polrelid)
--     from pg_policy p join pg_class c on c.oid = p.polrelid
--    where p.polname = 'paywall_plano'
--    order by c.relname;
--
-- TESTE REAL (ver memoria rls_teste_metodologia): impersonar via SQL NAO serve
-- para validar RLS — o papel de plan-time do MCP tem BYPASSRLS e o teste mente.
-- Valide pelo PostgREST com JWT de verdade.
--
-- REVERTER TUDO:
--   do $$ declare t text; begin
--     for t in select c.relname from pg_policy p join pg_class c on c.oid=p.polrelid
--               where p.polname='paywall_plano' loop
--       execute format('drop policy if exists paywall_plano on public.%I', t);
--     end loop;
--   end $$;
--   drop function if exists public.plano_bloqueia(uuid);
-- ============================================================================
