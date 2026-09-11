-- ===========================================================================
-- Auditoria do delivery (2026-09-11) — parte 2 de 2.
-- Rode DEPOIS de `2026-09-11-auditoria-entrega.sql` e DEPOIS de o app que lê
-- `pedido_codigos` estar publicado: esta migração encerra o dual-write.
--
-- Fecha o furo: `pedidos_clientes.codigo_confirmacao` é legível pelo ENTREGADOR
-- via RLS, e com o código em mãos ele marca "entregue" sem encontrar o cliente —
-- que é justamente o que o código de 4 dígitos existe para impedir. O código
-- real passa a viver só em `public.pedido_codigos` (RLS: cliente e loja).
-- ===========================================================================

-- A troca é feita em cima do pg_get_functiondef ATUAL para que todo o resto do
-- guard (preço autoritativo, taxa por distância, surge, teto de área, lock de
-- estado terminal...) continue byte a byte igual — regravar este guard à mão de
-- uma cópia antiga já custou o preço autoritativo uma vez.
do $outer$
declare def text; novo text;
begin
  select pg_get_functiondef(oid) into def
    from pg_proc where oid = 'public.pedidos_clientes_guard()'::regprocedure;

  novo := replace(
    def,
    $alvo$    if old.codigo_confirmacao is not null and old.codigo_confirmacao <> '' then new.codigo_confirmacao := old.codigo_confirmacao;
    elsif new.status = 'saiu' then new.codigo_confirmacao := lpad((floor(random() * 10000))::integer::text, 4, '0');
    else new.codigo_confirmacao := old.codigo_confirmacao; end if;$alvo$,
    $novo$    -- COLUNA LEGADA: nao e mais populada. O codigo de confirmacao vive em
    -- public.pedido_codigos, fora do alcance do entregador (auditoria 2026-09-11).
    new.codigo_confirmacao := null;$novo$
  );

  -- Fail-closed: se o bloco alvo não casar (guard já alterado), aborta em vez de
  -- recriar a função com o código de confirmação ainda sendo gravado.
  if novo = def then
    raise exception 'bloco do codigo_confirmacao nao encontrado no guard — nada foi alterado';
  end if;

  execute novo;
end
$outer$;

-- Zera o que já estava gravado. Os pedidos em rota continuam funcionando porque
-- o backfill da migração anterior já copiou tudo para pedido_codigos.
update public.pedidos_clientes
   set codigo_confirmacao = null
 where codigo_confirmacao is not null;

comment on column public.pedidos_clientes.codigo_confirmacao is
  'LEGADO — sempre null desde 2026-09-11. O codigo vive em public.pedido_codigos (RLS: so cliente e loja).';
