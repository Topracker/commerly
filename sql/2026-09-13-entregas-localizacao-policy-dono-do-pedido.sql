-- ===========================================================================
-- D6 — PARTE 2 de 2 — GPS só do entregador ATUAL do pedido
-- APLICADO em produção em 2026-09-19 via MCP (fase única; rollback no fim).
-- ---------------------------------------------------------------------------
-- `entregas_localizacao` tem PRIMARY KEY (pedido_id): existe UMA linha por
-- pedido. As policies antigas só checavam "sou este entregador", nunca "sou o
-- entregador DESTE pedido". Resultado: depois que um pedido é repassado, o app
-- do entregador antigo (que segue com o pedido em memória enquanto a tela está
-- bloqueada) continuava gravando na linha do pedido — e, pior, como o upsert é
-- INSERT ... ON CONFLICT (pedido_id) DO UPDATE, quem chegasse primeiro depois
-- do DELETE de liberarEntregador() ficava DONO da linha: o USING antigo era
-- avaliado sobre a linha existente ("sou o entregador dela"), então o
-- entregador novo levava 42501 e o GPS legítimo parava em silêncio.
--
-- A Parte 1 (commit 47d8168) neutralizou o efeito nas decisões do servidor
-- (avaliarEntregaEmRota ignora a linha quando não é do entregador atual) e na
-- fila offline do app. Esta parte fecha a escrita de vez.
--
-- Regra única: "o pedido aponta HOJE para um entregador que é meu".
--   - INSERT / WITH CHECK: a linha nova tem entregador_id meu E o pedido tem
--     esse entregador_id.
--   - UPDATE / USING: avaliado sobre a linha EXISTENTE — de propósito NÃO olha
--     o entregador_id dela, só se o pedido é meu agora. É o que permite ao
--     entregador novo assumir uma linha obsoleta do antigo se o DELETE de
--     liberarEntregador() falhar ou perder a corrida contra o ping do antigo
--     (a versão planejada em 2026-09-13 exigia `e.id = linha.entregador_id`
--     também no USING, e nesse cenário trancava o entregador legítimo).
--   - O fantasma (pedido já não é dele) falha nos dois caminhos com 42501; o
--     app enfileira e sincronizarFila() descarta o ponto de pedido alheio.
--   - SELECT do entregador segue a MESMA regra. Descoberto no teste: o
--     INSERT ... ON CONFLICT DO UPDATE referencia a linha existente, e o
--     Postgres exige que ela passe também na policy de SELECT do usuário. Com
--     o SELECT antigo ("sou o entregador DESTA linha") o entregador novo não
--     enxergava a linha obsoleta do antigo e levava 42501 ao tentar assumi-la
--     (T4b da bateria). Nenhum código lê entregas_localizacao como entregador
--     (só cliente, e o servidor com service role), então nada mais muda.
--
-- Dentro da policy a RLS também vale: `pedidos_clientes` tem
-- pedidos_entregador_select (pedido com entregador_id meu) e `entregadores`
-- tem entregador_select_dono — a subquery enxerga exatamente o que precisa.
-- Leitores cliente/loja não mudam. /api/entregador/confirmar-rota grava com
-- service role e não passa por aqui.
--
-- Validado em 2026-09-19 pela REST com JWT real de dois entregadores, 11/11
-- asserções (dono grava/atualiza, terceiro barrado, fantasma barrado sobre
-- linha obsoleta e na lacuna após o DELETE, entregador novo assume a linha
-- obsoleta, pedido liberado bloqueia, cliente lê, service role grava). Com a
-- policy ANTIGA a mesma bateria dava 5/11: o fantasma gravava e o entregador
-- legítimo ficava trancado (42501) enquanto a linha obsoleta existisse.
-- Regra 12: set_config('role') em SQL NÃO aplica RLS.
-- ===========================================================================

drop policy if exists loc_select_entregador on public.entregas_localizacao;
create policy loc_select_entregador on public.entregas_localizacao
  for select to authenticated
  using (
    exists (
      select 1
        from public.entregadores e
        join public.pedidos_clientes p on p.entregador_id = e.id
       where e.user_id = auth.uid()
         and p.id = entregas_localizacao.pedido_id
    )
  );

drop policy if exists loc_insert_entregador on public.entregas_localizacao;
create policy loc_insert_entregador on public.entregas_localizacao
  for insert to authenticated
  with check (
    exists (
      select 1
        from public.entregadores e
        join public.pedidos_clientes p on p.entregador_id = e.id
       where e.user_id = auth.uid()
         and e.id = entregas_localizacao.entregador_id
         and p.id = entregas_localizacao.pedido_id
    )
  );

drop policy if exists loc_update_entregador on public.entregas_localizacao;
create policy loc_update_entregador on public.entregas_localizacao
  for update to authenticated
  using (
    exists (
      select 1
        from public.entregadores e
        join public.pedidos_clientes p on p.entregador_id = e.id
       where e.user_id = auth.uid()
         and p.id = entregas_localizacao.pedido_id
    )
  )
  with check (
    exists (
      select 1
        from public.entregadores e
        join public.pedidos_clientes p on p.entregador_id = e.id
       where e.user_id = auth.uid()
         and e.id = entregas_localizacao.entregador_id
         and p.id = entregas_localizacao.pedido_id
    )
  );

-- Rollback (volta às policies de 2026-07, "sou este entregador"):
--   drop policy if exists loc_select_entregador on public.entregas_localizacao;
--   create policy loc_select_entregador on public.entregas_localizacao for select to authenticated
--     using (exists (select 1 from public.entregadores e where e.id = entregas_localizacao.entregador_id and e.user_id = auth.uid()));
--   drop policy if exists loc_insert_entregador on public.entregas_localizacao;
--   create policy loc_insert_entregador on public.entregas_localizacao for insert to authenticated
--     with check (exists (select 1 from public.entregadores e where e.id = entregas_localizacao.entregador_id and e.user_id = auth.uid()));
--   drop policy if exists loc_update_entregador on public.entregas_localizacao;
--   create policy loc_update_entregador on public.entregas_localizacao for update to authenticated
--     using (exists (select 1 from public.entregadores e where e.id = entregas_localizacao.entregador_id and e.user_id = auth.uid()))
--     with check (exists (select 1 from public.entregadores e where e.id = entregas_localizacao.entregador_id and e.user_id = auth.uid()));
