-- Feature flags por cidade (padrão global), privacidade do perfil do cliente e
-- aprovação de entregadores pelo admin. RLS ligado, sem policies (acesso só via
-- rotas service role — padrão do app). Aplicado em produção via MCP 2026-07-11.

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cidade_slug text NOT NULL DEFAULT '__global__',
  flag text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cidade_slug, flag)
);
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

INSERT INTO public.feature_flags (cidade_slug, flag, ativo) VALUES
  ('__global__','delivery',true),
  ('__global__','ia',true),
  ('__global__','cashback',true),
  ('__global__','gamificacao',true),
  ('__global__','kit',true),
  ('__global__','fundadores',true),
  ('__global__','embaixadores',true),
  ('__global__','modo_festa',true),
  ('__global__','flash_sale',true)
ON CONFLICT (cidade_slug, flag) DO NOTHING;

ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS perfil_privado boolean NOT NULL DEFAULT false;

ALTER TABLE public.entregadores ADD COLUMN IF NOT EXISTS aprovacao_status text NOT NULL DEFAULT 'pendente';
ALTER TABLE public.entregadores ADD COLUMN IF NOT EXISTS aprovado_em timestamptz;

CREATE INDEX IF NOT EXISTS feature_flags_cidade_idx ON public.feature_flags (cidade_slug);
