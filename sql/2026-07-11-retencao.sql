-- Retenção automática (cron diário /api/retencao/cron). Log de disparos para
-- cooldown/dedupe + ampliação do CHECK de notificacoes.tipo. RLS ligado, sem
-- policies (acesso só via service role). Aplicado via MCP 2026-07-11.

CREATE TABLE IF NOT EXISTS public.retencao_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tipo text NOT NULL,
  enviado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.retencao_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS retencao_log_user_tipo_idx ON public.retencao_log (user_id, tipo, enviado_em DESC);

ALTER TABLE public.notificacoes DROP CONSTRAINT IF EXISTS notificacoes_tipo_check;
ALTER TABLE public.notificacoes ADD CONSTRAINT notificacoes_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'pedido_novo','pedido_status','parceria_aceita','corrida_oferta',
    'cupom','post_novo','flash_sale','retencao','relatorio'
  ]));
