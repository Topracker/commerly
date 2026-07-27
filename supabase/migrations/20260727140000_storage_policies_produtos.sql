-- Bucket `produtos`: mesmo buraco do `entregadores` (20260727130000).
--
-- RLS ligado em storage.objects e nenhuma policy para este bucket => todo
-- upload de foto de produto voltava 400, em silêncio (o código ignora
-- `uploadError` e segue salvando o produto sem imagem). Resultado medido em
-- 2026-07-27: 8 de 8 produtos com `imagem_url` nula. Nunca funcionou.
--
-- ESCOPO POR LOJA, não por usuário: diferente do bucket `entregadores` (onde a
-- pasta é o próprio user), foto de produto pertence à LOJA — é assim que o
-- bucket `feed` já faz. A subquery garante que a pasta é de uma loja do
-- chamador, então continua sendo "só na sua pasta".
--
-- Depende da mudança em app/produtos/page.tsx no mesmo commit: o caminho
-- passou de `${loja.id}-${ts}.ext` (plano) para `${loja.id}/${ts}.ext` (pasta).
-- Sem isso `storage.foldername(name)[1]` é NULL e nada casa.

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='produtos_loja_insert') then
    create policy produtos_loja_insert on storage.objects for insert to authenticated
      with check (
        bucket_id = 'produtos'
        and (storage.foldername(name))[1] in (select id::text from public.lojas where user_id = auth.uid())
      );
  end if;

  -- O upload usa upsert: reenviar a mesma foto vira UPDATE.
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='produtos_loja_update') then
    create policy produtos_loja_update on storage.objects for update to authenticated
      using (
        bucket_id = 'produtos'
        and (storage.foldername(name))[1] in (select id::text from public.lojas where user_id = auth.uid())
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='produtos_loja_delete') then
    create policy produtos_loja_delete on storage.objects for delete to authenticated
      using (
        bucket_id = 'produtos'
        and (storage.foldername(name))[1] in (select id::text from public.lojas where user_id = auth.uid())
      );
  end if;
end $$;
