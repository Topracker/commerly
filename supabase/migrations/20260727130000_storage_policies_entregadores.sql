-- Bucket `entregadores`: faltavam as policies de escrita.
--
-- Descoberto ao testar a etapa "Equipamento" em produção: o upload devolvia
-- 400 e o cadastro não completava. `storage.objects` tinha policies só para
-- os buckets `avaliacoes`, `feed` e `lojas` — nenhuma para `entregadores`.
-- Ou seja, NENHUM entregador nunca conseguiu enviar foto: por isso os
-- `foto_url` / `documento_foto_url` / `cnh_foto_url` da base estão todos NULL
-- e o storage inteiro tinha 1 objeto (no bucket `lojas`).
--
-- Escopo por pasta = user id, que é o formato que `uploadFotoEntregador` grava
-- (`${user.id}/${categoria}-...`). Mais apertado que o `lojas_auth_insert`,
-- que deixa qualquer autenticado escrever em qualquer lugar do bucket.
--
-- Leitura não precisa de policy: o bucket é público e é servido pela URL
-- pública. As fotos são documento e bolsa — quem souber a URL vê, igual às
-- demais mídias do app.

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='entregadores_own_insert') then
    create policy entregadores_own_insert on storage.objects for insert to authenticated
      with check (
        bucket_id = 'entregadores'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  -- `uploadFotoEntregador` usa upsert: reenviar a mesma foto vira UPDATE.
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='entregadores_own_update') then
    create policy entregadores_own_update on storage.objects for update to authenticated
      using (
        bucket_id = 'entregadores'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='entregadores_own_delete') then
    create policy entregadores_own_delete on storage.objects for delete to authenticated
      using (
        bucket_id = 'entregadores'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;

-- ATENÇÃO: o bucket `produtos` tem o MESMO buraco (app/produtos/page.tsx faz
-- upload e não há policy). Não foi corrigido aqui de propósito — é outra
-- feature e outra decisão de escopo de acesso. Vale checar.
