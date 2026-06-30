-- Rode este SQL no SQL Editor do Supabase (produção) ANTES de usar o deploy
-- com as novas validações de cadastro.
--
-- O que ele faz:
--   1. Adiciona a coluna `cnpj` em `fornecedores` (CNPJ obrigatório no app).
--   2. Adiciona a coluna `telefone` em `clientes` (novo campo de WhatsApp).
--   3. Cria índices nas colunas usadas pela checagem de duplicidade
--      (/api/cadastro/checar), deixando a consulta rápida.
--
-- Tudo é idempotente (IF NOT EXISTS), então pode rodar mais de uma vez.

alter table public.fornecedores add column if not exists cnpj text;
alter table public.clientes     add column if not exists telefone text;

-- Índices para a checagem de duplicidade de CPF / CNPJ / telefone.
create index if not exists idx_fornecedores_cnpj     on public.fornecedores (cnpj);
create index if not exists idx_fornecedores_telefone on public.fornecedores (telefone);
create index if not exists idx_clientes_cpf          on public.clientes (cpf);
create index if not exists idx_clientes_telefone     on public.clientes (telefone);
create index if not exists idx_lojas_documento       on public.lojas (documento);
create index if not exists idx_lojas_telefone        on public.lojas (telefone);
