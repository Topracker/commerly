-- Bolsa térmica no cadastro do entregador + lista de interesse do Kit Oficial.
--
-- Contexto: o kit NÃO é requisito para rodar (ver app/lib/dispatch.ts) e não há
-- checkout. O que de fato importa para a qualidade da entrega é a bolsa
-- térmica — de QUALQUER marca. Então passamos a perguntar sobre a bolsa no
-- cadastro e a tratar o Kit Oficial como lista de espera.

-- ---------------------------------------------------------------------------
-- 1. Bolsa térmica do entregador
-- ---------------------------------------------------------------------------
-- `tem_bolsa` fica NULLABLE de propósito: NULL = cadastro antigo, que nunca foi
-- perguntado. Distinguir isso de `false` ("respondeu que não tem") é o que
-- permite ao /admin cobrar só quem realmente declarou não ter.
alter table public.entregadores
  add column if not exists tem_bolsa            boolean,
  add column if not exists bolsa_foto_url       text,
  add column if not exists bolsa_confirmada_em  timestamptz;

comment on column public.entregadores.tem_bolsa is
  'Declarou ter bolsa térmica no cadastro. NULL = cadastro anterior à pergunta.';
comment on column public.entregadores.bolsa_foto_url is
  'Foto da bolsa (bucket `entregadores`, prefixo bolsa-). Qualquer marca serve.';
comment on column public.entregadores.bolsa_confirmada_em is
  'Quando marcou o compromisso de usar bolsa térmica em todas as entregas.';

-- Coerência: quem diz que tem bolsa precisa ter mandado foto E aceitado o
-- compromisso. Não restringe quem respondeu "não" nem o legado (NULL).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'entregadores_bolsa_chk'
  ) then
    alter table public.entregadores
      add constraint entregadores_bolsa_chk
      check (tem_bolsa is not true or (bolsa_foto_url is not null and bolsa_confirmada_em is not null));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Lista de interesse do Kit Oficial
-- ---------------------------------------------------------------------------
create table if not exists public.kit_interesse (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  telefone      text not null,
  -- Preenchidos quando quem envia está logado como entregador; o formulário do
  -- /kit é público, então ambos podem ser nulos.
  entregador_id uuid references public.entregadores(id) on delete set null,
  user_id       uuid references auth.users(id)          on delete set null,
  created_at    timestamptz not null default now()
);

-- Mesmo telefone não entra duas vezes na fila. A rota trata o 23505 como
-- sucesso ("você já está na lista"), então reenviar não vira erro na tela.
create unique index if not exists kit_interesse_telefone_uidx on public.kit_interesse (telefone);
create index        if not exists kit_interesse_created_idx   on public.kit_interesse (created_at desc);

-- RLS ligado e SEM policies: ninguém lê nem escreve com a anon key. Quem grava
-- é `/api/kit/interesse` pelo service role, com rate limit — mesmo desenho de
-- `expansao_interesse`. É uma lista com telefone de gente real: não pode ficar
-- legível para o navegador.
alter table public.kit_interesse enable row level security;

comment on table public.kit_interesse is
  'Lista de espera do Kit Oficial (o kit ainda não tem checkout). Só service role: '
  'gravada por /api/kit/interesse. NÃO crie policy de select para anon/authenticated — '
  'a tabela guarda nome e telefone.';
