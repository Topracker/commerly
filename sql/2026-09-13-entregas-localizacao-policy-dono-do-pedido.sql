-- ===========================================================================
-- D6 — PARTE 2 de 2 — GPS só do entregador ATUAL do pedido
-- >>> NÃO APLICADO <<<  aguardando a validação da Parte 1 em produção.
-- ---------------------------------------------------------------------------
-- `entregas_localizacao` tem PRIMARY KEY (pedido_id): existe UMA linha por
-- pedido. As policies atuais só checam "sou este entregador", nunca "sou o
-- entregador DESTE pedido". Resultado: depois que um pedido é repassado, o app
-- do entregador antigo (que segue com o pedido em memória enquanto a tela está
-- bloqueada) continua gravando na MESMA linha que o novo entregador — os dois
-- se sobrescrevem e o cliente vê a posição errada no mapa.
--
-- A Parte 1 já neutralizou o efeito disso nas decisões do servidor
-- (avaliarEntregaEmRota ignora a linha quando ela não é do entregador atual) e
-- na fila offline do app. Esta parte fecha a escrita de vez.
--
-- ANTES DE APLICAR: testar via REST com JWT REAL do entregador (regra 12 —
-- set_config('role') em SQL NÃO aplica RLS e inventa vazamento). O risco é o
-- GPS do entregador legítimo parar de gravar EM SILÊNCIO: o app enfileira e
-- mostra "offline", o mapa do cliente congela e a própria inatividade dispara.
-- Roteiro: pedido em rota -> upsert deve passar; pedido repassado a outro ->
-- upsert do antigo deve falhar com 42501.
-- ===========================================================================

drop policy if exists loc_insert_entregador on public.entregas_localizacao;
create policy loc_insert_entregador on public.entregas_localizacao
  for insert to authenticated
  with check (
    exists (
      select 1 from public.entregadores e
       where e.id = entregas_localizacao.entregador_id and e.user_id = auth.uid()
    )
    and exists (
      select 1 from public.pedidos_clientes p
       where p.id = entregas_localizacao.pedido_id
         and p.entregador_id = entregas_localizacao.entregador_id
    )
  );

drop policy if exists loc_update_entregador on public.entregas_localizacao;
create policy loc_update_entregador on public.entregas_localizacao
  for update to authenticated
  using (
    exists (
      select 1 from public.entregadores e
       where e.id = entregas_localizacao.entregador_id and e.user_id = auth.uid()
    )
    and exists (
      select 1 from public.pedidos_clientes p
       where p.id = entregas_localizacao.pedido_id
         and p.entregador_id = entregas_localizacao.entregador_id
    )
  )
  with check (
    exists (
      select 1 from public.entregadores e
       where e.id = entregas_localizacao.entregador_id and e.user_id = auth.uid()
    )
    and exists (
      select 1 from public.pedidos_clientes p
       where p.id = entregas_localizacao.pedido_id
         and p.entregador_id = entregas_localizacao.entregador_id
    )
  );
