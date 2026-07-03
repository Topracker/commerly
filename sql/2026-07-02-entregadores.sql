-- Sistema de entregadores (delivery) da Commerly.
--
-- Papeis envolvidos (todos authenticated; a separacao e por owner-check nas
-- policies, pois o Postgres nao distingue os papeis por current_user):
--   - Entregador (dono de entregadores.user_id)
--   - Comerciante (dono de lojas.user_id)
--   - Cliente     (dono de clientes.user_id)
--
-- Fluxo:
--   1. Entregador se cadastra e pede PARCERIA a uma loja de delivery.
--   2. Comerciante aceita/recusa a parceria no painel /pedidos.
--   3. Comerciante define o valor da corrida de cada pedido.
--   4. Entregador parceiro ACEITA um pedido livre (via API service role),
--      liga o GPS e passa a atualizar entregas_localizacao a cada 10s.
--   5. Ao sair para entrega (status 'saiu'), o trigger gera um CODIGO de 4
--      digitos. O cliente ve o codigo; o entregador o digita para confirmar
--      a entrega -> status 'entregue' + payout via Stripe Connect (API).
--   6. Cliente avalia o entregador (avaliacoes_entregadores) e o produto/loja
--      (avaliacoes_lojas, ja existente).
--
-- Rode este SQL no SQL Editor do Supabase (producao). Tudo e idempotente.

-- ===========================================================================
-- 1. ENTREGADORES
-- ===========================================================================
create table if not exists public.entregadores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  nome text not null,
  cpf text not null,
  telefone text,
  foto_url text,
  -- Stripe Connect (payout da corrida na conta do entregador).
  stripe_account_id text,
  stripe_onboarded boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_entregadores_user on public.entregadores (user_id);

alter table public.entregadores enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='entregadores'
  loop execute format('drop policy if exists %I on public.entregadores', pol.policyname); end loop;
end $$;

grant select, insert, update on public.entregadores to authenticated;

-- O entregador gerencia apenas o proprio cadastro.
create policy "entregador_select_dono" on public.entregadores
  for select to authenticated using (user_id = auth.uid());
create policy "entregador_insert_dono" on public.entregadores
  for insert to authenticated with check (user_id = auth.uid());
create policy "entregador_update_dono" on public.entregadores
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- View publica (sem CPF/Stripe): comerciante e cliente veem nome/foto/telefone
-- do entregador atribuido sem acessar a tabela base (RLS).
drop view if exists public.entregadores_publicos;
create view public.entregadores_publicos
  with (security_invoker = false) as
  select id, nome, foto_url, telefone from public.entregadores;
grant select on public.entregadores_publicos to authenticated;

-- Bucket de fotos dos entregadores.
insert into storage.buckets (id, name, public)
values ('entregadores', 'entregadores', true)
on conflict (id) do update set public = true;

drop policy if exists "entregadores_public_read" on storage.objects;
create policy "entregadores_public_read" on storage.objects
  for select to public using (bucket_id = 'entregadores');
drop policy if exists "entregadores_auth_insert" on storage.objects;
create policy "entregadores_auth_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'entregadores');
drop policy if exists "entregadores_auth_update" on storage.objects;
create policy "entregadores_auth_update" on storage.objects
  for update to authenticated using (bucket_id = 'entregadores');
drop policy if exists "entregadores_auth_delete" on storage.objects;
create policy "entregadores_auth_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'entregadores');

-- ===========================================================================
-- 2. PARCERIAS entregador <-> loja
-- ===========================================================================
create table if not exists public.entregador_parcerias (
  id uuid primary key default gen_random_uuid(),
  entregador_id uuid not null references public.entregadores(id) on delete cascade,
  loja_id uuid not null references public.lojas(id) on delete cascade,
  status text not null default 'pendente'
    check (status in ('pendente', 'aceita', 'recusada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entregador_id, loja_id)
);

create index if not exists idx_parcerias_loja on public.entregador_parcerias (loja_id, status);
create index if not exists idx_parcerias_entregador on public.entregador_parcerias (entregador_id, status);

-- Mantem updated_at; o entregador so cria (pendente) e o comerciante muda status.
create or replace function public.entregador_parcerias_touch()
returns trigger language plpgsql security invoker as $$
begin
  if tg_op = 'INSERT' then new.status := 'pendente'; end if;
  new.updated_at := now();
  return new;
end; $$;
drop trigger if exists trg_parcerias_touch on public.entregador_parcerias;
create trigger trg_parcerias_touch before insert or update on public.entregador_parcerias
  for each row execute function public.entregador_parcerias_touch();

alter table public.entregador_parcerias enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='entregador_parcerias'
  loop execute format('drop policy if exists %I on public.entregador_parcerias', pol.policyname); end loop;
end $$;

grant select, insert, update on public.entregador_parcerias to authenticated;

-- Entregador cria a solicitacao (para si) e ve as proprias parcerias.
create policy "parceria_insert_entregador" on public.entregador_parcerias
  for insert to authenticated with check (
    exists (select 1 from public.entregadores e where e.id = entregador_id and e.user_id = auth.uid())
  );
create policy "parceria_select_entregador" on public.entregador_parcerias
  for select to authenticated using (
    exists (select 1 from public.entregadores e where e.id = entregador_id and e.user_id = auth.uid())
  );
-- Comerciante ve e decide (aceita/recusa) as solicitacoes da propria loja.
create policy "parceria_select_loja" on public.entregador_parcerias
  for select to authenticated using (
    exists (select 1 from public.lojas l where l.id = loja_id and l.user_id = auth.uid())
  );
create policy "parceria_update_loja" on public.entregador_parcerias
  for update to authenticated using (
    exists (select 1 from public.lojas l where l.id = loja_id and l.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.lojas l where l.id = loja_id and l.user_id = auth.uid())
  );

-- ===========================================================================
-- 3. PEDIDOS: colunas de entrega + guard reescrito
-- ===========================================================================
alter table public.pedidos_clientes
  add column if not exists entregador_id uuid references public.entregadores(id) on delete set null;
alter table public.pedidos_clientes
  add column if not exists valor_corrida numeric(10,2) not null default 0;
alter table public.pedidos_clientes
  add column if not exists codigo_confirmacao text;
alter table public.pedidos_clientes
  add column if not exists pagamento_corrida text not null default 'pendente'
    check (pagamento_corrida in ('pendente', 'pago'));

create index if not exists idx_pedidos_entregador on public.pedidos_clientes (entregador_id);

-- Guard reescrito: conteudo do pedido continua imutavel; libera os campos de
-- entrega (status, entregador_id, valor_corrida, codigo, pagamento). Gera o
-- codigo de 4 digitos ao sair para entrega e nunca o deixa ser reescrito.
create or replace function public.pedidos_clientes_guard()
returns trigger language plpgsql security invoker as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'recebido';
    new.entregador_id := null;
    new.valor_corrida := 0;            -- definido pelo comerciante depois
    new.codigo_confirmacao := null;
    new.pagamento_corrida := 'pendente';
    new.created_at := now();
    new.updated_at := now();
  elsif tg_op = 'UPDATE' then
    -- Conteudo do pedido: imutavel apos criado.
    new.loja_id := old.loja_id;
    new.cliente_id := old.cliente_id;
    new.itens := old.itens;
    new.total := old.total;
    new.taxa_entrega := old.taxa_entrega;
    new.endereco_entrega := old.endereco_entrega;
    new.observacao := old.observacao;
    new.cliente_nome := old.cliente_nome;
    new.cliente_telefone := old.cliente_telefone;
    new.created_at := old.created_at;
    new.updated_at := now();
    -- Codigo de confirmacao: gera ao sair para entrega; depois e imutavel.
    if old.codigo_confirmacao is not null and old.codigo_confirmacao <> '' then
      new.codigo_confirmacao := old.codigo_confirmacao;
    elsif new.status = 'saiu' then
      new.codigo_confirmacao := lpad((floor(random() * 10000))::int::text, 4, '0');
    else
      new.codigo_confirmacao := old.codigo_confirmacao;
    end if;
    -- status, entregador_id, valor_corrida, pagamento_corrida: passam livres.
  end if;
  return new;
end; $$;

drop trigger if exists trg_pedidos_clientes_guard on public.pedidos_clientes;
create trigger trg_pedidos_clientes_guard
  before insert or update on public.pedidos_clientes
  for each row execute function public.pedidos_clientes_guard();

-- Policy extra: entregador parceiro (aceito) ou ja atribuido VE os pedidos.
-- (Reivindicar/confirmar pedido e feito por API service role.)
drop policy if exists "pedidos_entregador_select" on public.pedidos_clientes;
create policy "pedidos_entregador_select" on public.pedidos_clientes
  for select to authenticated using (
    exists (select 1 from public.entregadores e where e.id = entregador_id and e.user_id = auth.uid())
    or exists (
      select 1 from public.entregador_parcerias pa
        join public.entregadores e on e.id = pa.entregador_id
       where pa.loja_id = pedidos_clientes.loja_id
         and pa.status = 'aceita'
         and e.user_id = auth.uid()
    )
  );

-- ===========================================================================
-- 4. GPS EM TEMPO REAL (uma posicao corrente por pedido -> upsert)
-- ===========================================================================
create table if not exists public.entregas_localizacao (
  pedido_id uuid primary key references public.pedidos_clientes(id) on delete cascade,
  entregador_id uuid not null references public.entregadores(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  updated_at timestamptz not null default now()
);

alter table public.entregas_localizacao enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='entregas_localizacao'
  loop execute format('drop policy if exists %I on public.entregas_localizacao', pol.policyname); end loop;
end $$;

grant select, insert, update on public.entregas_localizacao to authenticated;

-- Entregador escreve/atualiza a propria posicao.
create policy "loc_insert_entregador" on public.entregas_localizacao
  for insert to authenticated with check (
    exists (select 1 from public.entregadores e where e.id = entregador_id and e.user_id = auth.uid())
  );
create policy "loc_update_entregador" on public.entregas_localizacao
  for update to authenticated using (
    exists (select 1 from public.entregadores e where e.id = entregador_id and e.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.entregadores e where e.id = entregador_id and e.user_id = auth.uid())
  );
-- Entregador ve a propria; cliente ve a do proprio pedido; loja ve a dela.
create policy "loc_select_entregador" on public.entregas_localizacao
  for select to authenticated using (
    exists (select 1 from public.entregadores e where e.id = entregador_id and e.user_id = auth.uid())
  );
create policy "loc_select_cliente" on public.entregas_localizacao
  for select to authenticated using (
    exists (
      select 1 from public.pedidos_clientes p join public.clientes c on c.id = p.cliente_id
       where p.id = pedido_id and c.user_id = auth.uid()
    )
  );
create policy "loc_select_loja" on public.entregas_localizacao
  for select to authenticated using (
    exists (
      select 1 from public.pedidos_clientes p join public.lojas l on l.id = p.loja_id
       where p.id = pedido_id and l.user_id = auth.uid()
    )
  );

-- ===========================================================================
-- 5. AVALIACAO DO ENTREGADOR (produto/loja usa avaliacoes_lojas, ja existente)
-- ===========================================================================
create table if not exists public.avaliacoes_entregadores (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null unique references public.pedidos_clientes(id) on delete cascade,
  entregador_id uuid not null references public.entregadores(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nota int not null check (nota between 1 and 5),
  comentario text,
  created_at timestamptz not null default now()
);

create index if not exists idx_aval_entregador on public.avaliacoes_entregadores (entregador_id);

alter table public.avaliacoes_entregadores enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='avaliacoes_entregadores'
  loop execute format('drop policy if exists %I on public.avaliacoes_entregadores', pol.policyname); end loop;
end $$;

grant select, insert on public.avaliacoes_entregadores to authenticated;

-- Cliente avalia o entregador do proprio pedido.
create policy "aval_entregador_insert_cliente" on public.avaliacoes_entregadores
  for insert to authenticated with check (
    exists (select 1 from public.clientes c where c.id = cliente_id and c.user_id = auth.uid())
  );
-- Leitura liberada a authenticated (media do entregador aparece no painel dele
-- e para o cliente); nao ha dado sensivel aqui.
create policy "aval_entregador_select" on public.avaliacoes_entregadores
  for select to authenticated using (true);

-- ===========================================================================
-- 6. Verificacao (rode manualmente apos aplicar):
--   select table_name from information_schema.tables
--     where table_name in ('entregadores','entregador_parcerias',
--       'entregas_localizacao','avaliacoes_entregadores');
--   select column_name from information_schema.columns
--     where table_name='pedidos_clientes'
--       and column_name in ('entregador_id','valor_corrida','codigo_confirmacao','pagamento_corrida');
-- ===========================================================================
