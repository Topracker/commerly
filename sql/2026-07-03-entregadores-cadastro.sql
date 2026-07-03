-- Cadastro completo do entregador (padrao dos apps de delivery reais).
--
-- Adiciona a entregadores os campos de verificacao exigidos no onboarding:
--   - data_nascimento     (precisa ter 18+; a idade e validada no app)
--   - documento_tipo      ('RG' ou 'CNH') + documento_numero + documento_foto_url
--   - veiculo_tipo        ('moto', 'carro', 'bicicleta', 'a_pe')
--   - cnh_numero / cnh_categoria / cnh_foto_url (obrigatorios p/ moto e carro)
--
-- A foto do rosto (verificacao) e o telefone ja existem: foto_url e telefone.
--
-- Rode este SQL no SQL Editor do Supabase (producao), APOS o
-- 2026-07-02-entregadores.sql. Tudo e idempotente. Colunas nullable para nao
-- quebrar linhas ja existentes; a obrigatoriedade e garantida no cadastro.

alter table public.entregadores add column if not exists data_nascimento date;

alter table public.entregadores add column if not exists documento_tipo text;
alter table public.entregadores add column if not exists documento_numero text;
alter table public.entregadores add column if not exists documento_foto_url text;

alter table public.entregadores add column if not exists veiculo_tipo text;

alter table public.entregadores add column if not exists cnh_numero text;
alter table public.entregadores add column if not exists cnh_categoria text;
alter table public.entregadores add column if not exists cnh_foto_url text;

-- Constraints de dominio (idempotentes via catálogo). Aceitam NULL para os
-- registros antigos; validam apenas quando ha valor.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'entregadores_documento_tipo_chk') then
    alter table public.entregadores add constraint entregadores_documento_tipo_chk
      check (documento_tipo is null or documento_tipo in ('RG', 'CNH'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'entregadores_veiculo_tipo_chk') then
    alter table public.entregadores add constraint entregadores_veiculo_tipo_chk
      check (veiculo_tipo is null or veiculo_tipo in ('moto', 'carro', 'bicicleta', 'a_pe'));
  end if;
end $$;

-- Verificacao (rode manualmente apos aplicar):
--   select column_name from information_schema.columns
--     where table_name = 'entregadores'
--       and column_name in ('data_nascimento','documento_tipo','documento_numero',
--         'documento_foto_url','veiculo_tipo','cnh_numero','cnh_categoria','cnh_foto_url');
