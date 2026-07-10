-- ============================================================================
-- 12 features (2026-07-15)
--   #1  Commerly Vision (identificar prato)      -> usa produtos.descricao
--   #2  Clone de cardápio (OCR)                  -> usa produtos.descricao
--   #3  IA que cria cardápio                     -> usa produtos.descricao
--   #4  Realce de foto (client-side)             -> sem schema
--   #5  Preço dinâmico                           -> lojas.preco_dinamico
--   #6  Modo invisível                           -> pedidos_clientes.anonimo
--   #7  Integridade das avaliações (HMAC+cadeia) -> hash/hash_anterior/seq
--   #9  IA Nutricionista                         -> produtos.tags_nutri
--   #10 Commerly Garantia                        -> pedidos_clientes.eta_em
--   #12 Radar de tendências                      -> sem schema (agrega pedidos)
--   #13 Flash Sale                               -> tabela flash_sales
--   #14 Drone de delivery                        -> veiculo_tipo 'drone'
--
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================================
begin;

-- ============================================================================
-- 1. PRODUTOS — descrição, tags nutricionais, peso (restrição do drone)
-- ============================================================================
alter table public.produtos add column if not exists descricao text;
alter table public.produtos add column if not exists tags_nutri text[] not null default '{}';
alter table public.produtos add column if not exists nutri_analisado_em timestamptz;
-- Peso do item; usado para barrar entrega por drone acima de 2kg.
alter table public.produtos add column if not exists peso_kg numeric(6,3);

-- Busca por tag nutricional (`tags_nutri @> '{vegetariano}'`).
create index if not exists produtos_tags_nutri_idx on public.produtos using gin (tags_nutri);

-- ============================================================================
-- 2. LOJAS — preço dinâmico (#5) e aceite de drone (#14)
-- ============================================================================
alter table public.lojas add column if not exists preco_dinamico boolean not null default false;
alter table public.lojas add column if not exists aceita_drone boolean not null default false;

-- ============================================================================
-- 3. PEDIDOS — modo invisível (#6), garantia (#10), drone (#14), preço dinâmico (#5)
-- ============================================================================
alter table public.pedidos_clientes add column if not exists anonimo boolean not null default false;
-- Prazo prometido ao cliente. A garantia dispara em now() > eta_em + 30min.
alter table public.pedidos_clientes add column if not exists eta_em timestamptz;
-- Preenchido quando a garantia já emitiu cupom, para não emitir duas vezes.
alter table public.pedidos_clientes add column if not exists garantia_cupom_id uuid references public.cupons(id) on delete set null;
alter table public.pedidos_clientes add column if not exists entrega_drone boolean not null default false;
-- Multiplicador de preço dinâmico congelado no ato do pedido (1.00 = sem ajuste).
-- Os preços unitários já vão congelados em `itens`; esta coluna é só auditoria.
alter table public.pedidos_clientes add column if not exists preco_dinamico_fator numeric(4,2) not null default 1.00;

-- Varredura da garantia: pedidos em rota, com ETA vencido e sem cupom emitido.
create index if not exists pedidos_garantia_idx
  on public.pedidos_clientes (eta_em)
  where garantia_cupom_id is null and status in ('recebido','preparando','saiu');

-- ============================================================================
-- 4. ENTREGADORES — drone (#14)
-- ============================================================================
alter table public.entregadores add column if not exists drone_serie text;
alter table public.entregadores add column if not exists drone_anac text;

-- O CHECK atual não conhece 'drone'; sem isto, o insert do onboarding falha.
alter table public.entregadores drop constraint if exists entregadores_veiculo_tipo_chk;
alter table public.entregadores add constraint entregadores_veiculo_tipo_chk
  check (veiculo_tipo is null or veiculo_tipo in ('moto','carro','bicicleta','a_pe','drone'));

-- Drone exige número de série e certificado ANAC.
alter table public.entregadores drop constraint if exists entregadores_drone_docs_chk;
alter table public.entregadores add constraint entregadores_drone_docs_chk
  check (
    veiculo_tipo is distinct from 'drone'
    or (drone_serie is not null and length(btrim(drone_serie)) > 0
        and drone_anac is not null and length(btrim(drone_anac)) > 0)
  );

-- ============================================================================
-- 5. NOTIFICAÇÕES — novo tipo 'flash_sale' (#13)
--    A garantia (#10) reusa o tipo 'cupom', que já existe.
-- ============================================================================
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('pedido_novo','pedido_status','parceria_aceita','corrida_oferta','cupom','post_novo','flash_sale'));

-- ============================================================================
-- 6. AVALIAÇÕES — integridade verificável (#7)
--
--    O hash é um HMAC-SHA256 (segredo só do servidor) sobre o conteúdo da
--    avaliação MAIS o hash da avaliação anterior — uma cadeia. Isso dá duas
--    propriedades que um SHA-256 simples na mesma linha NÃO dá:
--
--      a) o cliente não consegue forjar um hash válido (não tem o segredo);
--      b) editar ou apagar uma avaliação antiga quebra o hash de TODAS as
--         seguintes, então a adulteração fica detectável.
--
--    Para (b) valer, o log precisa ser append-only: as políticas de INSERT/
--    UPDATE/DELETE do cliente saem, e toda escrita passa por /api/avaliacoes,
--    que usa a service role. Editar uma avaliação insere uma nova linha
--    apontando para a anterior via `substitui_id`; a original continua na
--    cadeia. As leituras usam as views `*_atuais`, que só mostram a última.
-- ============================================================================

-- O hash inclui created_at. `timestamp without time zone` não faz round-trip
-- estável (a leitura depende do fuso de quem lê) e a verificação da cadeia
-- falharia de forma intermitente. A view é derrubada e recriada mais abaixo.
drop view if exists public.avaliacoes_lojas_atuais;
alter table public.avaliacoes_lojas
  alter column created_at type timestamptz using created_at at time zone 'UTC';

-- `seq` dá ordem total determinística à cadeia (created_at pode empatar).
alter table public.avaliacoes_lojas        add column if not exists seq bigint generated by default as identity;
alter table public.avaliacoes_lojas        add column if not exists hash text;
alter table public.avaliacoes_lojas        add column if not exists hash_anterior text;
alter table public.avaliacoes_lojas        add column if not exists substitui_id uuid references public.avaliacoes_lojas(id) on delete restrict;

alter table public.avaliacoes_entregadores add column if not exists seq bigint generated by default as identity;
alter table public.avaliacoes_entregadores add column if not exists hash text;
alter table public.avaliacoes_entregadores add column if not exists hash_anterior text;
alter table public.avaliacoes_entregadores add column if not exists substitui_id uuid references public.avaliacoes_entregadores(id) on delete restrict;

create unique index if not exists avaliacoes_lojas_seq_uidx        on public.avaliacoes_lojas (seq);
create unique index if not exists avaliacoes_entregadores_seq_uidx on public.avaliacoes_entregadores (seq);
-- Uma avaliação só pode ser substituída por uma outra.
create unique index if not exists avaliacoes_lojas_substitui_uidx        on public.avaliacoes_lojas (substitui_id) where substitui_id is not null;
create unique index if not exists avaliacoes_entregadores_substitui_uidx on public.avaliacoes_entregadores (substitui_id) where substitui_id is not null;

-- Concorrência: dois inserts simultâneos calculam o mesmo `seq`; o índice único
-- acima faz o segundo falhar (23505) e a API retenta. Estes garantem além disso
-- que um hash só possa ser predecessor de uma única linha.
create unique index if not exists avaliacoes_lojas_hash_ant_uidx
  on public.avaliacoes_lojas (hash_anterior) where hash_anterior is not null;
create unique index if not exists avaliacoes_entregadores_hash_ant_uidx
  on public.avaliacoes_entregadores (hash_anterior) where hash_anterior is not null;

-- Append-only: cliente não escreve direto (a API usa service role, que ignora RLS).
drop policy if exists aval_lojas_insert            on public.avaliacoes_lojas;
drop policy if exists aval_lojas_update            on public.avaliacoes_lojas;
drop policy if exists aval_lojas_delete            on public.avaliacoes_lojas;
drop policy if exists aval_entregador_insert_cliente on public.avaliacoes_entregadores;

-- Leitura continua pública (as policies de SELECT ficam como estão).

-- Views "atuais": a última versão de cada avaliação (a que ninguém substituiu).
drop view if exists public.avaliacoes_lojas_atuais;
create view public.avaliacoes_lojas_atuais
  with (security_invoker = true) as
  select a.*
  from public.avaliacoes_lojas a
  where not exists (select 1 from public.avaliacoes_lojas b where b.substitui_id = a.id);

drop view if exists public.avaliacoes_entregadores_atuais;
create view public.avaliacoes_entregadores_atuais
  with (security_invoker = true) as
  select a.*
  from public.avaliacoes_entregadores a
  where not exists (select 1 from public.avaliacoes_entregadores b where b.substitui_id = a.id);

grant select on public.avaliacoes_lojas_atuais        to anon, authenticated;
grant select on public.avaliacoes_entregadores_atuais to anon, authenticated;

-- ============================================================================
-- 7. FLASH SALES (#13)
-- ============================================================================
create table if not exists public.flash_sales (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references public.fornecedores(id) on delete cascade,
  produto_id uuid references public.fornecedor_produtos(id) on delete cascade,
  titulo text not null,
  desconto_percentual integer not null check (desconto_percentual between 1 and 90),
  inicia_em timestamptz not null default now(),
  termina_em timestamptz not null,
  created_at timestamptz not null default now(),
  constraint flash_sales_janela_chk check (termina_em > inicia_em)
);

create index if not exists flash_sales_janela_idx on public.flash_sales (termina_em, inicia_em);

alter table public.flash_sales enable row level security;

drop policy if exists flash_sales_select_public on public.flash_sales;
create policy flash_sales_select_public on public.flash_sales
  for select using (true);

drop policy if exists flash_sales_insert_dono on public.flash_sales;
create policy flash_sales_insert_dono on public.flash_sales
  for insert with check (
    exists (select 1 from public.fornecedores f where f.id = fornecedor_id and f.user_id = auth.uid())
  );

drop policy if exists flash_sales_update_dono on public.flash_sales;
create policy flash_sales_update_dono on public.flash_sales
  for update using (
    exists (select 1 from public.fornecedores f where f.id = fornecedor_id and f.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.fornecedores f where f.id = fornecedor_id and f.user_id = auth.uid())
  );

drop policy if exists flash_sales_delete_dono on public.flash_sales;
create policy flash_sales_delete_dono on public.flash_sales
  for delete using (
    exists (select 1 from public.fornecedores f where f.id = fornecedor_id and f.user_id = auth.uid())
  );

-- ============================================================================
-- 8. VIEW PÚBLICA lojas_publicas — recriada com as colunas novas (#5, #14)
-- ============================================================================
drop view if exists public.lojas_publicas;
create view public.lojas_publicas
  with (security_invoker = false) as
  select id, nome, tipo, localizacao, telefone, instagram, horario,
         latitude, longitude, fotos_fachada, taxa_entrega, website_url, created_at,
         (stripe_onboarded and stripe_account_id is not null) as aceita_pagamento_online,
         distancia_maxima_entrega,
         preco_dinamico,
         aceita_drone
  from public.lojas;

grant select on public.lojas_publicas to anon, authenticated;

commit;

-- ============================================================================
-- VERIFICAÇÃO (rode manualmente após aplicar):
--   select preco_dinamico, aceita_drone from public.lojas_publicas limit 1;
--   -- 'drone' aceito:
--   select 'drone' = any(array['moto','carro','bicicleta','a_pe','drone']);
--   -- cliente NÃO deve mais conseguir inserir avaliação direto (como authenticated):
--   -- insert into public.avaliacoes_lojas (cliente_id, loja_id, nota) values (...);  -- deve falhar
--   select count(*) from public.avaliacoes_lojas_atuais;
--   select count(*) from public.flash_sales;
-- ============================================================================

-- ============================================================================
-- 9. GUARD DOS PEDIDOS — preço autoritativo (#5), ETA (#10), anônimo (#6), drone (#14)
--
--    ATENÇÃO: antes desta migração o subtotal do pedido saía de `itens.preco`,
--    ou seja, do valor que o CLIENTE enviava. Um cliente podia montar a
--    requisição com preco = 0.01. Agora o preço vem de `produtos.preco_venda`
--    (join restrito à própria loja) e o fator dinâmico é decidido no servidor.
--
--    Aplicado via migração `guard_preco_autoritativo_eta_anonimo_drone`.
--    Ver o corpo completo em: supabase migrations list.
-- ============================================================================
-- Peso do pedido congelado no insert (o produto pode ser apagado depois).
alter table public.pedidos_clientes add column if not exists peso_total_kg numeric(7,3) not null default 0;

-- Janela diurna do drone, no fuso de Brasília (espelha lib/drone.ts).
create or replace function public.eh_horario_diurno(ts timestamptz)
returns boolean language sql stable set search_path to 'public' as $$
  select extract(hour from (ts at time zone 'America/Sao_Paulo'))::int between 6 and 17;
$$;

-- (A função pedidos_clientes_guard() completa está na migração do Supabase;
--  ela é grande e não é reproduzida aqui para não divergir das duas cópias.)

-- ============================================================================
-- 10. AVALIAÇÕES — unicidade só sobre a versão ATUAL (#7)
--
--     A tabela tinha `unique (cliente_id, loja_id)`: uma avaliação por cliente
--     por loja. Isso é incompatível com o log append-only, onde editar insere
--     uma segunda linha. `substituida` é um flag denormalizado de "alguém me
--     aponta via substitui_id"; ele NÃO entra no hash, então marcá-lo não
--     invalida a cadeia — e é o único jeito de expressar o predicado num índice
--     parcial, que não aceita subconsulta.
-- ============================================================================
alter table public.avaliacoes_lojas        add column if not exists substituida boolean not null default false;
alter table public.avaliacoes_entregadores add column if not exists substituida boolean not null default false;

update public.avaliacoes_lojas a set substituida = true
  where exists (select 1 from public.avaliacoes_lojas b where b.substitui_id = a.id) and not a.substituida;
update public.avaliacoes_entregadores a set substituida = true
  where exists (select 1 from public.avaliacoes_entregadores b where b.substitui_id = a.id) and not a.substituida;

alter table public.avaliacoes_lojas        drop constraint if exists avaliacoes_lojas_cliente_id_loja_id_key;
alter table public.avaliacoes_entregadores drop constraint if exists avaliacoes_entregadores_pedido_id_key;
drop index if exists public.avaliacoes_lojas_cliente_id_loja_id_key;
drop index if exists public.avaliacoes_entregadores_pedido_id_key;

create unique index if not exists avaliacoes_lojas_atual_uidx
  on public.avaliacoes_lojas (cliente_id, loja_id) where not substituida;
create unique index if not exists avaliacoes_entregadores_atual_uidx
  on public.avaliacoes_entregadores (pedido_id) where not substituida and pedido_id is not null;

drop view if exists public.avaliacoes_lojas_atuais;
create view public.avaliacoes_lojas_atuais with (security_invoker = true) as
  select * from public.avaliacoes_lojas where not substituida;

drop view if exists public.avaliacoes_entregadores_atuais;
create view public.avaliacoes_entregadores_atuais with (security_invoker = true) as
  select * from public.avaliacoes_entregadores where not substituida;

grant select on public.avaliacoes_lojas_atuais        to anon, authenticated;
grant select on public.avaliacoes_entregadores_atuais to anon, authenticated;

-- ============================================================================
-- 11. PREÇO DINÂMICO — o fator exibido é TETO do cobrado (#5)
-- ============================================================================
alter table public.pedidos_clientes  add column if not exists fator_exibido numeric(4,2);
alter table public.pedidos_pendentes add column if not exists fator_exibido numeric(4,2);
alter table public.pedidos_pendentes add column if not exists anonimo boolean not null default false;

-- Preço efetivo respeita promoção ativa (o guard lê produtos, não o preço do cliente).
create or replace function public.preco_efetivo(p_produto_id uuid, p_loja_id uuid, p_preco_venda numeric)
returns numeric language sql stable set search_path to 'public' as $$
  select coalesce(
    (select pr.preco_promocional
       from public.promocoes pr
      where pr.produto_id = p_produto_id and pr.loja_id = p_loja_id and pr.ativa
        and (pr.expira_em is null or pr.expira_em > now()) and pr.preco_promocional > 0
      order by pr.preco_promocional asc limit 1),
    p_preco_venda);
$$;
