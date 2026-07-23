-- Hardening de segurança apontado pela auditoria pré-lançamento (advisors).

-- 1) Funções de notificação B2B são de TRIGGER — ninguém deve chamá-las via RPC.
--    (as demais notif_* já tiveram EXECUTE revogado no commit b6a162e; estas
--    entraram depois e ficaram de fora.)
revoke execute on function public.notif_pedido_b2b_novo()   from public, anon, authenticated;
revoke execute on function public.notif_pedido_b2b_status() from public, anon, authenticated;

-- 2) search_path fixo em plano_bloqueia (evita sequestro de resolução de nomes).
alter function public.plano_bloqueia(uuid) set search_path = public, pg_temp;

-- 3) Buckets públicos (avaliacoes, feed, lojas): a política SELECT ampla deixava
--    QUALQUER cliente LISTAR todos os arquivos. Bucket público serve o objeto
--    pela URL pública sem essa política, e o app só usa getPublicUrl/upload
--    (nunca .list()). Removemos a listagem, mantendo o acesso por URL e o upload.
drop policy if exists avaliacoes_public_read on storage.objects;
drop policy if exists feed_public_read       on storage.objects;
drop policy if exists lojas_public_read       on storage.objects;
