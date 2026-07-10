-- ============================================================================
-- Modo Festa (#8, sem pagamento online) + backfill nutricional (#9) +
-- peso obrigatório para drone (#14)                                2026-07-16
--
-- DECISÕES QUE VALEM DINHEIRO:
--
--  1. TAXA DE ENTREGA. Uma festa é UMA viagem: o entregador passa nas lojas e
--     entrega tudo num endereço só. Se cada participante pagasse a taxa cheia
--     do próprio pedido, cobraríamos 2 ou 3 vezes pela mesma corrida. Então a
--     taxa da festa é calculada uma vez (soma das pernas loja->endereço) e
--     RATEADA pelo número de participantes. O cálculo é do servidor, dentro do
--     guard — o cliente não envia valor nenhum.
--
--  2. BÔNUS DE 20%. O `valor_corrida` de cada pedido da festa sai com +20%
--     sobre a taxa rateada. Somando os pedidos, o entregador recebe a taxa
--     total da viagem + 20%. Esse acréscimo é subsídio da plataforma: ele não
--     é cobrado do cliente nem do comerciante. Como ainda não existe repasse
--     automático (pagamento_corrida nasce 'pendente' e nenhum entregador tem
--     Stripe Connect), o bônus fica registrado e é pago junto com a corrida,
--     pelo mesmo caminho manual de hoje.
--
--  3. Pagamento é SEMPRE na entrega enquanto o Stripe não aceitar BRL.
-- ============================================================================
begin;

-- ============================================================================
-- 1. FESTAS
-- ============================================================================
create table if not exists public.festas (
  id uuid primary key default gen_random_uuid(),
  criador_cliente_id uuid not null references public.clientes(id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 2 and 60),
  -- Código do link de convite. Curto, sem 0/O/1/I (o convidado digita ou cola).
  codigo text not null unique,
  status text not null default 'aberta'
    check (status in ('aberta', 'fechada', 'despachada', 'cancelada')),
  -- Endereço ÚNICO de entrega da festa (definido por quem cria).
  endereco_entrega text not null,
  entrega_latitude double precision not null,
  entrega_longitude double precision not null,
  -- Snapshot no fechamento: taxa total da viagem e rateio por pessoa.
  taxa_total numeric(10,2),
  taxa_por_pessoa numeric(10,2),
  bonus_pct integer not null default 20 check (bonus_pct between 0 and 100),
  fechada_em timestamptz,
  expira_em timestamptz not null default (now() + interval '6 hours'),
  created_at timestamptz not null default now()
);

create index if not exists festas_codigo_idx on public.festas (codigo);
create index if not exists festas_criador_idx on public.festas (criador_cliente_id, created_at desc);

-- Lojas participantes (até 3, dentro de 2 km umas das outras).
create table if not exists public.festa_lojas (
  festa_id uuid not null references public.festas(id) on delete cascade,
  loja_id uuid not null references public.lojas(id) on delete cascade,
  primary key (festa_id, loja_id)
);

-- Participantes e seus carrinhos.
create table if not exists public.festa_participantes (
  id uuid primary key default gen_random_uuid(),
  festa_id uuid not null references public.festas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  -- [{produto_id, loja_id, nome, preco, quantidade}]
  itens jsonb not null default '[]'::jsonb,
  pronto boolean not null default false,
  -- Pedido gerado no fechamento (um por participante que tinha itens).
  pedido_id uuid references public.pedidos_clientes(id) on delete set null,
  entrou_em timestamptz not null default now(),
  unique (festa_id, cliente_id)
);

create index if not exists festa_participantes_festa_idx on public.festa_participantes (festa_id);

-- ============================================================================
-- 2. REGRAS DE INTEGRIDADE DAS LOJAS DA FESTA (máx 3, raio de 2 km entre si)
--
--    Um CHECK não consegue expressar isto (envolve outras linhas e outra
--    tabela). Trigger, então — e no banco, não só na API, porque a API não é
--    a única porta.
-- ============================================================================
create or replace function public.festa_lojas_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  total int;
  lat double precision; lng double precision;
  dist_max numeric;
begin
  select count(*) into total from public.festa_lojas where festa_id = new.festa_id;
  if total >= 3 then
    raise exception 'Uma festa aceita no maximo 3 lojas.' using errcode = 'P0001';
  end if;

  select latitude, longitude into lat, lng from public.lojas where id = new.loja_id;
  if lat is null or lng is null then
    raise exception 'Esta loja nao tem localizacao cadastrada e nao pode entrar numa festa.' using errcode = 'P0001';
  end if;

  -- Distância até a loja mais distante já na festa.
  select max(public.haversine_km(lat, lng, l.latitude, l.longitude)) into dist_max
    from public.festa_lojas fl join public.lojas l on l.id = fl.loja_id
   where fl.festa_id = new.festa_id;

  if dist_max is not null and dist_max > 2 then
    raise exception 'As lojas da festa precisam estar a ate 2 km umas das outras (esta esta a % km).', round(dist_max, 2)
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists festa_lojas_guard_trg on public.festa_lojas;
create trigger festa_lojas_guard_trg before insert on public.festa_lojas
  for each row execute function public.festa_lojas_guard();

-- ============================================================================
-- 3. PEDIDOS E OFERTAS GANHAM `festa_id`
-- ============================================================================
alter table public.pedidos_clientes add column if not exists festa_id uuid references public.festas(id) on delete set null;
create index if not exists pedidos_festa_idx on public.pedidos_clientes (festa_id) where festa_id is not null;

-- A oferta de Combo Festa cobre VÁRIOS pedidos, então `pedido_id` deixa de ser
-- obrigatório e a oferta passa a poder apontar para a festa inteira.
alter table public.corrida_ofertas alter column pedido_id drop not null;
alter table public.corrida_ofertas add column if not exists festa_id uuid references public.festas(id) on delete cascade;
alter table public.corrida_ofertas add column if not exists bonus_pct integer not null default 0;
alter table public.corrida_ofertas add column if not exists valor_total numeric(10,2);

alter table public.corrida_ofertas drop constraint if exists corrida_ofertas_alvo_chk;
alter table public.corrida_ofertas add constraint corrida_ofertas_alvo_chk
  check ((pedido_id is not null and festa_id is null) or (pedido_id is null and festa_id is not null));

-- `unique (pedido_id, entregador_id)` já existe e continua valendo para corridas
-- normais (em Postgres, NULLs não colidem). Para festa, o par equivalente:
create unique index if not exists corrida_ofertas_festa_entregador_uidx
  on public.corrida_ofertas (festa_id, entregador_id) where festa_id is not null;
create index if not exists idx_ofertas_festa on public.corrida_ofertas (festa_id, status);

-- ============================================================================
-- 4. PESO OBRIGATÓRIO EM LOJA COM DRONE (#14)
--
--    O teto de 2 kg do drone era inócuo: produto sem peso conta como 0 kg, e
--    NENHUM produto tinha peso. Agora, se a loja aceita drone, todo produto
--    dela precisa de peso. Vale nos dois sentidos: cadastrar produto sem peso
--    numa loja com drone falha, e ligar o drone numa loja com produto sem peso
--    também falha (com a contagem, para o comerciante saber o tamanho do
--    trabalho).
-- ============================================================================
create or replace function public.produtos_peso_drone_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare aceita boolean;
begin
  select coalesce(aceita_drone, false) into aceita from public.lojas where id = new.loja_id;
  if aceita and (new.peso_kg is null or new.peso_kg <= 0) then
    raise exception 'Sua loja aceita entrega por drone: informe o peso (kg) do produto "%".', new.nome
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists produtos_peso_drone_trg on public.produtos;
create trigger produtos_peso_drone_trg before insert or update on public.produtos
  for each row execute function public.produtos_peso_drone_guard();

create or replace function public.lojas_drone_exige_peso()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare faltando int;
begin
  if new.aceita_drone and not coalesce(old.aceita_drone, false) then
    select count(*) into faltando from public.produtos
      where loja_id = new.id and (peso_kg is null or peso_kg <= 0);
    if faltando > 0 then
      raise exception 'Cadastre o peso de % produto(s) antes de aceitar entrega por drone.', faltando
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists lojas_drone_exige_peso_trg on public.lojas;
create trigger lojas_drone_exige_peso_trg before update on public.lojas
  for each row execute function public.lojas_drone_exige_peso();

-- ============================================================================
-- 5. GUARD DE PEDIDOS RESPEITA A FESTA
--
--    O `pedidos_clientes_guard` SEMPRE recalculava a taxa pela distância e fazia
--    `valor_corrida = taxa_entrega`. Isso apagaria o rateio da festa e o bônus
--    de 20% (ver decisões 1 e 2 no topo). Agora, quando o pedido nasce com
--    `festa_id`, o guard CONFIA na taxa e no valor_corrida que o servidor já
--    calculou (dentro do guard de /api/festa/fechar) e pula a checagem de área
--    (a festa entrega num endereço só, validado no fechamento). Fora de festa,
--    o comportamento é idêntico ao de antes.
-- ============================================================================
create or replace function public.pedidos_clientes_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  loja_lat double precision; loja_lng double precision; max_dist numeric;
  loja_tempo int;
  dist numeric; subtotal numeric; desconto_pts numeric; saldo_atual integer;
begin
  if tg_op = 'INSERT' then
    new.status := 'recebido'; new.entregador_id := null;
    new.codigo_confirmacao := null; new.pagamento_corrida := 'pendente';
    new.created_at := now(); new.updated_at := now();
    select coalesce(sum((e->>'preco')::numeric * (e->>'quantidade')::numeric), 0) into subtotal
      from jsonb_array_elements(coalesce(new.itens, '[]'::jsonb)) e;
    select latitude, longitude, distancia_maxima_entrega, tempo_preparo_min
      into loja_lat, loja_lng, max_dist, loja_tempo
      from public.lojas where id = new.loja_id;
    new.tempo_preparo_min := coalesce(new.tempo_preparo_min, loja_tempo, 30);
    dist := public.haversine_km(loja_lat, loja_lng, new.entrega_latitude, new.entrega_longitude);
    new.distancia_km := dist;

    if new.festa_id is not null then
      -- Festa: a taxa é o rateio calculado pelo servidor e o valor_corrida já
      -- vem com o bônus. Confiamos nos dois; não recobramos nem barramos área.
      new.taxa_entrega := coalesce(new.taxa_entrega, 0);
      new.valor_corrida := coalesce(new.valor_corrida, new.taxa_entrega);
      new.desconto_pontos := 0;
      new.pontos_usados := 0;
      new.total := subtotal + new.taxa_entrega;
      return new;
    end if;

    new.taxa_entrega := public.calcular_taxa_entrega(dist);
    if public.eh_horario_pico(now()) then
      new.taxa_entrega := round(new.taxa_entrega * 1.3, 2);
    end if;
    new.valor_corrida := new.taxa_entrega;
    if dist is not null and max_dist is not null and dist > max_dist then
      raise exception 'Endereco fora da area de entrega. Esta loja entrega ate % km.', max_dist using errcode = 'P0001';
    end if;
    if coalesce(new.pontos_usados, 0) > 0 then
      select coalesce(sum(pontos), 0) into saldo_atual
        from public.pontos_clientes where cliente_id = new.cliente_id;
      if saldo_atual < new.pontos_usados then raise exception 'Saldo de pontos insuficiente.' using errcode = 'P0001'; end if;
      if (new.pontos_usados % 100) <> 0 then raise exception 'Use multiplos de 100 pontos.' using errcode = 'P0001'; end if;
      desconto_pts := (new.pontos_usados / 100.0) * 5.0;
      if desconto_pts > subtotal then desconto_pts := subtotal; end if;
      new.desconto_pontos := desconto_pts;
    else new.desconto_pontos := 0; end if;
    new.total := subtotal + new.taxa_entrega - coalesce(new.desconto_pontos, 0);
  elsif tg_op = 'UPDATE' then
    new.loja_id := old.loja_id; new.cliente_id := old.cliente_id; new.itens := old.itens;
    new.total := old.total; new.taxa_entrega := old.taxa_entrega; new.valor_corrida := old.valor_corrida;
    new.distancia_km := old.distancia_km; new.entrega_latitude := old.entrega_latitude; new.entrega_longitude := old.entrega_longitude;
    new.endereco_entrega := old.endereco_entrega; new.observacao := old.observacao;
    new.cliente_nome := old.cliente_nome; new.cliente_telefone := old.cliente_telefone;
    new.pontos_usados := old.pontos_usados; new.desconto_pontos := old.desconto_pontos;
    new.created_at := old.created_at; new.updated_at := now();
    new.pagamento_metodo := old.pagamento_metodo; new.pagamento_status := old.pagamento_status;
    new.stripe_session_id := old.stripe_session_id; new.stripe_payment_intent := old.stripe_payment_intent;
    new.festa_id := old.festa_id;
    if old.codigo_confirmacao is not null and old.codigo_confirmacao <> '' then new.codigo_confirmacao := old.codigo_confirmacao;
    elsif new.status = 'saiu' then new.codigo_confirmacao := lpad((floor(random() * 10000))::integer::text, 4, '0');
    else new.codigo_confirmacao := old.codigo_confirmacao; end if;
  end if;
  return new;
end;
$$;

commit;

-- ============================================================================
-- VERIFICAÇÃO (rode manualmente):
--   select count(*) from public.festas;
--   -- oferta precisa apontar para pedido XOR festa:
--   -- insert into corrida_ofertas(pedido_id, festa_id, ...) values (null, null, ...); -- deve falhar
--   -- loja com drone e produto sem peso:
--   -- update lojas set aceita_drone = true where id = '<loja com produtos sem peso>';  -- deve falhar
-- ============================================================================
