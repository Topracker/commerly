-- Abertura limitada: delivery só em Goiânia.
--
-- Estado conferido em 2026-10-24 (antes de aplicar):
--   __global__ / delivery = TRUE  (desde 2026-09-20 05:43 UTC — delivery aberto
--                                  no Brasil inteiro; a memória dizia OFF)
--   goiania    / delivery = TRUE
--   pedidos_clientes em aberto em qualquer cidade: 0
--
-- Quem é afetado (pedido NOVO passa a ser recusado pelo trg_bloquear_delivery;
-- a loja continua listada no /cliente/buscar com delivery_liberado=false, e o
-- checkout recusa em app/api/cliente/pedido-checkout):
--   caxias-do-sul : minha loja                (plano vencido — já não vendia)
--   miguelopolis  : baby love store           (em dia)
--   porto-alegre  : lgbeauty                  (em dia)
--   sao-goncalo   : testeEDI                  (em dia)
--   uberlandia    : Araújo serviço            (em dia)
-- Não afetadas: goiania (Brasa Burger, Burger House). Nenhuma loja com
-- cidade_slug nulo (essas já não vendem de qualquer forma).
--
-- Pré-requisito: sql/2026-10-24-bloquear-delivery-isenta-pago.sql aplicado
-- antes — senão um Pix pago de outra cidade que chegue depois daqui fica
-- cobrado e sem pedido.
--
-- STATUS: NÃO APLICADO — aguardando aprovação.

begin;

insert into public.feature_flags (cidade_slug, flag, ativo, updated_at)
values ('__global__', 'delivery', false, now()),
       ('goiania',    'delivery', true,  now())
on conflict (cidade_slug, flag) do update
  set ativo = excluded.ativo, updated_at = excluded.updated_at;

commit;

-- Conferência (esperado: __global__ false, goiania true):
-- select cidade_slug, ativo from public.feature_flags where flag = 'delivery' order by 1;
--
-- REVERTER (reabre o Brasil inteiro):
-- update public.feature_flags set ativo = true, updated_at = now()
--  where cidade_slug = '__global__' and flag = 'delivery';
