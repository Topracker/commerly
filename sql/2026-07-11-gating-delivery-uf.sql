-- Gating real de delivery por cidade (trigger) + UF para rankings por estado.
-- Aplicado via MCP 2026-07-11.

ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS cidade_slug text;
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS uf text;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS uf text;
ALTER TABLE public.entregadores ADD COLUMN IF NOT EXISTS uf text;

UPDATE public.lojas l
SET cidade_slug = c.slug, uf = c.uf
FROM public.cidades_expansao c
WHERE l.cidade_slug IS NULL
  AND l.localizacao IS NOT NULL
  AND l.localizacao ILIKE '%' || c.nome || '%';

CREATE INDEX IF NOT EXISTS lojas_uf_idx ON public.lojas (uf);
CREATE INDEX IF NOT EXISTS lojas_cidade_slug_idx ON public.lojas (cidade_slug);

-- Bloqueia novos pedidos quando a cidade da loja desligou 'delivery' (override
-- explícito ativo=false). SECURITY DEFINER para ler feature_flags sob RLS.
CREATE OR REPLACE FUNCTION public.bloquear_pedido_delivery_desligado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_slug text; v_ativo boolean;
BEGIN
  SELECT cidade_slug INTO v_slug FROM public.lojas WHERE id = NEW.loja_id;
  IF v_slug IS NULL THEN RETURN NEW; END IF;
  SELECT ativo INTO v_ativo FROM public.feature_flags WHERE cidade_slug = v_slug AND flag = 'delivery';
  IF v_ativo IS NOT NULL AND v_ativo = false THEN
    RAISE EXCEPTION 'Delivery indisponível nesta cidade no momento.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_bloquear_delivery ON public.pedidos_clientes;
CREATE TRIGGER trg_bloquear_delivery
  BEFORE INSERT ON public.pedidos_clientes
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_pedido_delivery_desligado();

-- Resolve cidade_slug/uf automaticamente em novas lojas / mudança de localizacao.
CREATE OR REPLACE FUNCTION public.resolver_cidade_loja()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_slug text; v_uf text;
BEGIN
  IF NEW.localizacao IS NULL THEN RETURN NEW; END IF;
  SELECT slug, uf INTO v_slug, v_uf
  FROM public.cidades_expansao c
  WHERE NEW.localizacao ILIKE '%' || c.nome || '%'
  ORDER BY length(c.nome) DESC
  LIMIT 1;
  IF v_slug IS NOT NULL THEN
    NEW.cidade_slug := v_slug;
    NEW.uf := v_uf;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_resolver_cidade_loja ON public.lojas;
CREATE TRIGGER trg_resolver_cidade_loja
  BEFORE INSERT OR UPDATE OF localizacao ON public.lojas
  FOR EACH ROW EXECUTE FUNCTION public.resolver_cidade_loja();
