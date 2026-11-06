-- 2026-11-06 — PagBank indisponível: fecha a gravação direta pelo REST.
--
-- ESTADO: NÃO APLICADO em produção.
--
-- O PAGBANK_LIBERADO=false só escondia o card. As policies abaixo permitiam ao
-- lojista gravar a própria conexão com a chave anon + JWT, sem passar pelas
-- rotas. Em 2026-11-06 a tabela tinha 0 linhas e `vendas` não tinha nenhuma
-- venda de PagBank: nenhuma loja é afetada.
--
-- Nada no app depende destas duas policies: /api/pagbank/connect e o callback
-- do OAuth gravam com service role (createAdminClient), que ignora a RLS.
-- pb_select e pb_delete ficam: ler ou apagar a própria conexão não liga nada.

drop policy if exists pb_insert on public.pagbank_conexoes;
drop policy if exists pb_update on public.pagbank_conexoes;

-- Para reverter quando o PagBank for liberado:
--   create policy pb_insert on public.pagbank_conexoes for insert to authenticated
--     with check (loja_id in (select id from public.lojas where user_id = auth.uid()));
--   create policy pb_update on public.pagbank_conexoes for update to authenticated
--     using (loja_id in (select id from public.lojas where user_id = auth.uid()));
