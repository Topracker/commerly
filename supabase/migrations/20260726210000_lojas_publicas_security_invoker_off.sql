-- REGRESSÃO (2a vez): a vitrine sumiu para clientes e visitantes anônimos.
--
-- `lojas` tem RLS com SELECT restrito a (auth.uid() = user_id) — cada
-- comerciante só enxerga a própria loja. Com security_invoker=on a view
-- lojas_publicas herda esse filtro e devolve ZERO linhas para anon e
-- authenticated, quebrando tudo que a lê do navegador: /loja/[id] (página
-- pública), /cardapio/[id] (QR code), /cliente/loja/[id], favoritas, ranking,
-- feed e o sitemap.
--
-- A view é a projeção pública curada: NÃO expõe user_id, documento, plano nem
-- IDs do Stripe (só os booleanos derivados). Rodar como security definer é o
-- comportamento pretendido — foi assim que 20260629000000_lojas_publicas_fix
-- já resolveu isso uma vez, e a view voltou a ser recriada com o invoker on.
--
-- Ver AVISO no fim: quem recriar esta view precisa repetir estas duas linhas.

alter view public.lojas_publicas set (security_invoker = off);

grant select on public.lojas_publicas to anon, authenticated;

comment on view public.lojas_publicas is
  'Projeção pública de `lojas` (vitrine). DEVE permanecer com security_invoker=off: '
  'o RLS de `lojas` restringe SELECT ao dono, então com invoker=on esta view devolve '
  '0 linhas para anon/authenticated e a vitrine inteira some. Já regrediu 2x '
  '(20260629000000 e 20260726). Ao recriar, repita: '
  'alter view public.lojas_publicas set (security_invoker = off); '
  'grant select on public.lojas_publicas to anon, authenticated;';
