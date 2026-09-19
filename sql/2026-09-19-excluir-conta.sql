-- ============================================================================
-- EXCLUSÃO DE CONTA (Google Play + LGPD art. 18) — 2026-09-19
-- ----------------------------------------------------------------------------
-- STATUS: APLICADO em produção em 2026-09-19 via MCP (migração `excluir_conta`).
--         md5 do guard depois desta migração: a1d037681d40e228297f081f3858e982
--
-- Fluxo aprovado (ver conversa de 2026-09-19):
--   1. O titular pede a exclusão (no app ou pela página pública /excluir-conta).
--      Efeito IMEDIATO e reversível: a conta some do público, sai do pool de
--      entrega, perde push, a assinatura Stripe é cancelada (isso é feito na
--      rota, antes de chamar o SQL) e fica 30 dias de carência.
--   2. Se a pessoa entrar de novo nesses 30 dias, só vê "Conta agendada para
--      exclusão — Reativar / Sair". Reativar desfaz o passo 1 (menos a
--      assinatura, que não volta sozinha).
--   3. Depois de 30 dias o cron diário (/api/conta/purgar-cron) apaga o
--      Storage, chama `purgar_conta()` e por fim apaga o usuário no Auth.
--
-- O QUE FICA depois da purga (e por quê) — está prometido na Política de
-- Privacidade §6, então mudar aqui exige mudar lá:
--   * pedidos_clientes / pedidos (B2B) / kit_pedidos: registro da transação em
--     que a Commerly é parte (split, corrida, estorno, assinatura) — 5 anos,
--     fiscal e defesa em processo. PII do titular é anonimizada; o resto fica.
--   * avaliações FEITAS pelo titular: nota e comentário ficam (cadeia de hash
--     de app/lib/integridade.ts inclui o comentário — apagar quebraria as
--     seguintes); o autor vira o tombstone "Cliente removido". Foto sai.
--   * mensagens (loja↔cliente, loja↔fornecedor): ficam para a OUTRA parte,
--     autor anonimizado (decisão 3).
--   * indicacoes / beneficios_indicacao do INDICADOR: o desconto que ele
--     ganhou não pode sumir porque o indicado saiu.
--   * exclusoes_conta: registro de conformidade. `email` some após 6 meses;
--     `hash_documento` (antifraude: bloqueia trial e indicação para o mesmo
--     CPF/CNPJ) some após 2 anos. Ver limpar_exclusoes_antigas().
--
-- A linha-raiz do papel (lojas/clientes/entregadores/fornecedores) NÃO é
-- apagada: vira TOMBSTONE (user_id null, nome genérico, todo o resto nulo).
-- Apagar cascatearia em cima de dado de terceiros (avaliacoes_lojas,
-- pontos_clientes de TODOS os clientes da loja, pedidos do fornecedor...).
--
-- ARMADILHA: `pedidos_clientes_guard` congela cliente_nome/telefone/endereço
-- em TODO update, inclusive do service role. A anonimização só passa com a
-- GUC `commerly.anonimizar = '1'` na transação (ver o guard abaixo — corpo
-- puxado VIVO do banco em 2026-09-19, md5 b8cec215… antes desta mudança).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colunas novas nas 4 tabelas-raiz
-- ----------------------------------------------------------------------------
-- exclusao_solicitada_em: pedido em carência OU já executado (fica no tombstone).
-- excluido_em: só depois da purga. Tombstone = user_id null + excluido_em.
alter table public.lojas
  add column if not exists exclusao_solicitada_em timestamptz,
  add column if not exists excluido_em timestamptz;
alter table public.clientes
  add column if not exists exclusao_solicitada_em timestamptz,
  add column if not exists excluido_em timestamptz;
alter table public.entregadores
  add column if not exists exclusao_solicitada_em timestamptz,
  add column if not exists excluido_em timestamptz;
alter table public.fornecedores
  add column if not exists exclusao_solicitada_em timestamptz,
  add column if not exists excluido_em timestamptz;

-- Tombstone precisa de user_id nulo (o usuário do Auth deixa de existir). Os
-- índices únicos de user_id aceitam vários NULL; a RLS `user_id = auth.uid()`
-- dá falso para NULL, então ninguém "vira dono" de um tombstone.
alter table public.lojas        alter column user_id drop not null;
alter table public.clientes     alter column user_id drop not null;
alter table public.entregadores alter column user_id drop not null;
alter table public.fornecedores alter column user_id drop not null;
-- CPF do entregador era NOT NULL; o tombstone não pode guardar CPF.
alter table public.entregadores alter column cpf drop not null;

-- ----------------------------------------------------------------------------
-- 2. Registro de conformidade
-- ----------------------------------------------------------------------------
create table if not exists public.exclusoes_conta (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null,
  papel            text check (papel in ('comerciante','cliente','entregador','fornecedor')),
  perfil_id        uuid,
  email            text,
  origem           text not null default 'app' check (origem in ('app','web','admin')),
  solicitado_em    timestamptz not null default now(),
  executa_apos     timestamptz not null,
  reativado_em     timestamptz,
  executado_em     timestamptz,            -- purga do banco concluída
  auth_apagado_em  timestamptz,            -- usuário do Auth apagado (feito na rota)
  snapshot         jsonb not null default '{}'::jsonb,  -- o que reativar() restaura
  hash_documento   text,                   -- HMAC(CPF/CNPJ) — antifraude, 2 anos
  erro             text,
  created_at       timestamptz not null default now()
);
comment on table public.exclusoes_conta is
  'Pedidos de exclusão de conta (LGPD/Google Play). Só service role. email some após 6 meses, hash_documento após 2 anos (limpar_exclusoes_antigas).';

-- Um pedido pendente por usuário.
create unique index if not exists exclusoes_conta_pendente_uidx
  on public.exclusoes_conta (user_id)
  where reativado_em is null and executado_em is null;
create index if not exists exclusoes_conta_hash_idx on public.exclusoes_conta (hash_documento)
  where hash_documento is not null;

alter table public.exclusoes_conta enable row level security;
-- Sem policy nenhuma de propósito: só o service role lê/escreve.
revoke all on public.exclusoes_conta from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Hash antifraude do documento (pepper no Vault)
-- ----------------------------------------------------------------------------
-- CPF tem 10^9 combinações válidas: sha256 puro seria quebrado em segundos.
-- HMAC com um pepper que só o postgres lê (supabase_vault) resolve.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'exclusao_pepper') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'exclusao_pepper',
                                'Pepper do hash_documento de exclusoes_conta');
  end if;
end $$;

create or replace function public.hash_documento(p_doc text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_pepper text; v_digitos text;
begin
  v_digitos := nullif(regexp_replace(coalesce(p_doc, ''), '\D', '', 'g'), '');
  if v_digitos is null then return null; end if;
  select decrypted_secret into v_pepper from vault.decrypted_secrets where name = 'exclusao_pepper';
  if v_pepper is null then raise exception 'exclusao_pepper ausente no Vault'; end if;
  return encode(extensions.hmac(v_digitos::bytea, v_pepper::bytea, 'sha256'), 'hex');
end $$;
revoke all on function public.hash_documento(text) from public, anon, authenticated;

-- Este CPF/CNPJ pertenceu a uma conta excluída nos últimos 2 anos?
-- Chamado pelo trigger de lojas (roda como `authenticated`), por isso o
-- EXECUTE para authenticated. Só devolve um booleano.
create or replace function public.documento_em_quarentena(p_doc text)
returns boolean
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare v_hash text;
begin
  v_hash := public.hash_documento(p_doc);
  if v_hash is null then return false; end if;
  return exists (
    select 1 from public.exclusoes_conta
     where hash_documento = v_hash
       and reativado_em is null
       and solicitado_em > now() - interval '2 years'
  );
end $$;
revoke all on function public.documento_em_quarentena(text) from public;
grant execute on function public.documento_em_quarentena(text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. Contas de teste ficam fora (decisão 5 — lista fixa, espelhada em
--    app/lib/exclusaoConta.ts)
-- ----------------------------------------------------------------------------
create or replace function public.email_protegido_exclusao(p_email text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(p_email, '')) = any (array[
    'matheus@teste.com', 'cliente@teste.com', 'entregador@teste.com', 'fornecedor@teste.com'
  ])
$$;

-- ----------------------------------------------------------------------------
-- 5. O que a sessão vê de si mesma (proxy.ts e tela /conta/agendada)
-- ----------------------------------------------------------------------------
create or replace function public.minha_exclusao()
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'id', id, 'papel', papel, 'solicitado_em', solicitado_em, 'executa_apos', executa_apos)
    from public.exclusoes_conta
   where user_id = auth.uid() and reativado_em is null and executado_em is null
   limit 1
$$;
revoke all on function public.minha_exclusao() from public;
grant execute on function public.minha_exclusao() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. Pré-checagem: papel, bloqueios e avisos
-- ----------------------------------------------------------------------------
-- Bloqueio = coisa que a pessoa precisa resolver ANTES (a Google permite,
-- desde que a tela diga o quê). Aviso = consequência que ela só precisa saber.
create or replace function public.checar_exclusao_conta(p_user_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_papel text; v_perfil uuid; v_nome text;
  v_bloqueios jsonb := '[]'::jsonb; v_avisos jsonb := '{}'::jsonb;
  n int; v_plano text; v_sub text; v_ads text; v_pontos int;
begin
  select id, nome, plano, stripe_subscription_id, stripe_ads_subscription_id
    into v_perfil, v_nome, v_plano, v_sub, v_ads
    from public.lojas where user_id = p_user_id and excluido_em is null;
  if found then
    v_papel := 'comerciante';
    select count(*) into n from public.pedidos_clientes
     where loja_id = v_perfil and status in ('recebido','preparando','saiu');
    if n > 0 then v_bloqueios := v_bloqueios || jsonb_build_object('codigo','pedidos_abertos','quantidade',n); end if;
    select count(*) into n from public.pedidos
     where loja_id = v_perfil and status in ('pendente','aceito');
    if n > 0 then v_bloqueios := v_bloqueios || jsonb_build_object('codigo','pedidos_b2b_abertos','quantidade',n); end if;
    v_avisos := v_avisos || jsonb_build_object(
      'assinatura_ativa', v_plano = 'ativo' or v_sub is not null,
      'ads_ativo', v_ads is not null);
  else
    select id, nome into v_perfil, v_nome from public.clientes where user_id = p_user_id and excluido_em is null;
    if found then
      v_papel := 'cliente';
      select count(*) into n from public.pedidos_clientes
       where cliente_id = v_perfil and status in ('recebido','preparando','saiu');
      if n > 0 then v_bloqueios := v_bloqueios || jsonb_build_object('codigo','pedidos_abertos','quantidade',n); end if;
      select coalesce(sum(pontos), 0) into v_pontos from public.pontos_clientes where cliente_id = v_perfil;
      v_avisos := v_avisos || jsonb_build_object('pontos_clube', v_pontos);
    else
      select id, nome into v_perfil, v_nome from public.fornecedores where user_id = p_user_id and excluido_em is null;
      if found then
        v_papel := 'fornecedor';
        select count(*) into n from public.pedidos
         where fornecedor_id = v_perfil and status in ('pendente','aceito');
        if n > 0 then v_bloqueios := v_bloqueios || jsonb_build_object('codigo','pedidos_b2b_abertos','quantidade',n); end if;
      else
        select id, nome into v_perfil, v_nome from public.entregadores where user_id = p_user_id and excluido_em is null;
        if found then
          v_papel := 'entregador';
          select count(*) into n from public.pedidos_clientes
           where entregador_id = v_perfil and status in ('recebido','preparando','saiu');
          if n > 0 then v_bloqueios := v_bloqueios || jsonb_build_object('codigo','corridas_abertas','quantidade',n); end if;
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'papel', v_papel, 'perfil_id', v_perfil, 'nome', v_nome,
    'bloqueios', v_bloqueios, 'avisos', v_avisos,
    'pendente', (select jsonb_build_object('id', id, 'executa_apos', executa_apos)
                   from public.exclusoes_conta
                  where user_id = p_user_id and reativado_em is null and executado_em is null
                  limit 1));
end $$;
revoke all on function public.checar_exclusao_conta(uuid) from public, anon, authenticated;
grant execute on function public.checar_exclusao_conta(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- 7. Solicitar (efeitos imediatos e reversíveis)
-- ----------------------------------------------------------------------------
-- A rota cancela a Stripe ANTES de chamar isto (se a Stripe falhar, nada aqui
-- roda). Erros saem como exception com um código curto na mensagem — a rota
-- traduz. Só service role executa.
create or replace function public.solicitar_exclusao_conta(p_user_id uuid, p_email text, p_origem text default 'app')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c jsonb; v_papel text; v_perfil uuid; v_doc text;
  v_snapshot jsonb := '{}'::jsonb; v_id uuid;
  v_executa timestamptz := now() + interval '30 days';
begin
  if public.email_protegido_exclusao(p_email) then
    raise exception 'conta_protegida' using errcode = 'P0001';
  end if;

  c := public.checar_exclusao_conta(p_user_id);
  if c->'pendente' is not null and jsonb_typeof(c->'pendente') <> 'null' then
    raise exception 'ja_pendente' using errcode = 'P0001';
  end if;
  if jsonb_array_length(c->'bloqueios') > 0 then
    raise exception 'bloqueado:%', (c->'bloqueios')::text using errcode = 'P0001';
  end if;

  v_papel  := c->>'papel';
  v_perfil := nullif(c->>'perfil_id', '')::uuid;

  if v_papel = 'comerciante' then
    select jsonb_build_object('delivery_ativo', delivery_ativo, 'plano', plano,
                              'trial_expira_em', trial_expira_em),
           documento
      into v_snapshot, v_doc
      from public.lojas where id = v_perfil;
    -- Some da vitrine (lojas_publicas.disponivel) e do delivery. O trigger
    -- trg_loja_delivery_off expira as ofertas de corrida pendentes.
    update public.lojas
       set exclusao_solicitada_em = now(), delivery_ativo = false,
           plano = 'inativo', trial_expira_em = null
     where id = v_perfil;

  elsif v_papel = 'cliente' then
    select cpf into v_doc from public.clientes where id = v_perfil;
    update public.clientes set exclusao_solicitada_em = now() where id = v_perfil;
    -- Festa ainda aberta (sem pedido) morre junto; as fechadas já viraram pedido.
    update public.festas set status = 'cancelada'
     where criador_cliente_id = v_perfil and status = 'aberta';

  elsif v_papel = 'entregador' then
    select cpf into v_doc from public.entregadores where id = v_perfil;
    -- Sai do pool (trg_entregador_offline expira ofertas) e o GPS some já.
    update public.entregadores
       set exclusao_solicitada_em = now(), disponivel = false,
           latitude = null, longitude = null, localizacao_at = null
     where id = v_perfil;
    update public.corrida_ofertas set status = 'expirada'
     where entregador_id = v_perfil and status = 'pendente';

  elsif v_papel = 'fornecedor' then
    select cnpj into v_doc from public.fornecedores where id = v_perfil;
    update public.fornecedores set exclusao_solicitada_em = now() where id = v_perfil;
  end if;

  -- Push morre já: quem pediu para sair não quer ser cutucado.
  delete from public.push_subscriptions where user_id = p_user_id;

  insert into public.exclusoes_conta (user_id, papel, perfil_id, email, origem, executa_apos, snapshot, hash_documento)
  values (p_user_id, v_papel, v_perfil, lower(p_email), p_origem, v_executa, v_snapshot, public.hash_documento(v_doc))
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'papel', v_papel, 'executa_apos', v_executa);
end $$;
revoke all on function public.solicitar_exclusao_conta(uuid, text, text) from public, anon, authenticated;
grant execute on function public.solicitar_exclusao_conta(uuid, text, text) to service_role;

-- ----------------------------------------------------------------------------
-- 8. Reativar (dentro da carência)
-- ----------------------------------------------------------------------------
create or replace function public.reativar_conta(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.exclusoes_conta%rowtype;
begin
  select * into r from public.exclusoes_conta
   where user_id = p_user_id and reativado_em is null and executado_em is null
   for update;
  if not found then raise exception 'nada_pendente' using errcode = 'P0001'; end if;

  if r.papel = 'comerciante' then
    -- plano NÃO volta: a assinatura foi cancelada na Stripe na hora do pedido.
    -- O trial volta como estava (pode já ter vencido — aí é /planos).
    update public.lojas
       set exclusao_solicitada_em = null,
           delivery_ativo = coalesce((r.snapshot->>'delivery_ativo')::boolean, delivery_ativo),
           trial_expira_em = (r.snapshot->>'trial_expira_em')::timestamptz
     where id = r.perfil_id;
  elsif r.papel = 'cliente' then
    update public.clientes set exclusao_solicitada_em = null where id = r.perfil_id;
  elsif r.papel = 'entregador' then
    -- disponivel continua false: ele fica online quando quiser.
    update public.entregadores set exclusao_solicitada_em = null where id = r.perfil_id;
  elsif r.papel = 'fornecedor' then
    update public.fornecedores set exclusao_solicitada_em = null where id = r.perfil_id;
  end if;

  update public.exclusoes_conta set reativado_em = now() where id = r.id;
  return jsonb_build_object('id', r.id, 'papel', r.papel);
end $$;
revoke all on function public.reativar_conta(uuid) from public, anon, authenticated;
grant execute on function public.reativar_conta(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- 9. Purga (parte do banco). O Storage e o Auth ficam com a rota do cron.
-- ----------------------------------------------------------------------------
create or replace function public.purgar_conta(p_exclusao_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.exclusoes_conta%rowtype; v_nome text;
begin
  select * into r from public.exclusoes_conta
   where id = p_exclusao_id and reativado_em is null and executado_em is null
   for update;
  if not found then raise exception 'nada_a_purgar' using errcode = 'P0001'; end if;
  if r.executa_apos > now() then raise exception 'carencia_em_curso' using errcode = 'P0001'; end if;

  -- Libera a anonimização em pedidos_clientes (ver guard). Vale só nesta transação.
  perform set_config('commerly.anonimizar', '1', true);

  -- ---- comum a todos os papéis (tabelas por user_id, sem FK) ----
  delete from public.notificacoes        where user_id = r.user_id;
  delete from public.push_subscriptions  where user_id = r.user_id;
  delete from public.xp_usuarios         where user_id = r.user_id;
  delete from public.medalhas_usuarios   where user_id = r.user_id;
  delete from public.missoes_usuarios    where user_id = r.user_id;
  delete from public.streaks             where user_id = r.user_id;
  delete from public.atividade_dias      where user_id = r.user_id;
  delete from public.retencao_log        where user_id = r.user_id;
  delete from public.codigos_indicacao   where user_id = r.user_id;
  delete from public.beneficios_indicacao where user_id = r.user_id;   -- os DELE; os do indicador ficam
  delete from public.kit_interesse       where user_id = r.user_id;
  if r.email is not null then
    delete from public.expansao_interesse where lower(email) = r.email;
  end if;
  -- indicacoes: fica (uuid só; o indicador mantém o desconto).
  -- creditos_mov: fica (crédito concedido pela Commerly = registro financeiro).

  if r.papel = 'comerciante' then
    select nome into v_nome from public.lojas where id = r.perfil_id;

    -- Dado de balcão: é do comerciante, não da Commerly. Já foi oferecido
    -- para exportar. Ordem respeita as FKs NO ACTION (vendas → produtos).
    delete from public.vendas              where loja_id = r.perfil_id;
    delete from public.gastos              where loja_id = r.perfil_id;
    delete from public.fiado               where loja_id = r.perfil_id;   -- nome de terceiros
    delete from public.funcionarios        where loja_id = r.perfil_id;
    delete from public.promocoes           where loja_id = r.perfil_id;
    delete from public.promocao_regras     where loja_id = r.perfil_id;
    delete from public.combos              where loja_id = r.perfil_id;
    delete from public.posts               where loja_id = r.perfil_id;   -- cascateia likes/comentários/eventos
    delete from public.stories             where loja_id = r.perfil_id;
    delete from public.produtos            where loja_id = r.perfil_id;
    delete from public.agendamentos        where loja_id = r.perfil_id;
    delete from public.servicos            where loja_id = r.perfil_id;
    delete from public.cupons              where loja_id = r.perfil_id;
    delete from public.campanhas_retorno   where loja_id = r.perfil_id;
    delete from public.insights_semanais   where loja_id = r.perfil_id;
    delete from public.academy_progresso   where loja_id = r.perfil_id;
    delete from public.assistente_conversas where loja_id = r.perfil_id;
    delete from public.conquistas          where loja_id = r.perfil_id;
    delete from public.feedbacks           where loja_id = r.perfil_id;
    delete from public.loja_seguidores     where loja_id = r.perfil_id;
    delete from public.entregador_parcerias where loja_id = r.perfil_id;
    delete from public.mercadopago_conexoes where loja_id = r.perfil_id;  -- tokens OAuth
    delete from public.pagbank_conexoes    where loja_id = r.perfil_id;
    delete from public.fundadores          where loja_id = r.perfil_id;
    delete from public.corrida_ofertas     where loja_id = r.perfil_id;
    delete from public.pedidos_pendentes   where loja_id = r.perfil_id;
    if v_nome is not null and length(v_nome) >= 3 then
      delete from public.feed_conquistas where tipo = 'entrou' and texto like '%' || v_nome || '%';
    end if;
    -- FICAM: pedidos_clientes, pedidos (B2B), avaliacoes_lojas (recebidas),
    -- pontos_clientes/clube_movimentos (saldo dos CLIENTES), mensagens,
    -- mensagens_clientes, festa_lojas.

    update public.lojas set
      user_id = null, nome = 'Loja removida', localizacao = null, telefone = null,
      instagram = null, horario = null, documento = null, meta_mensal = 0,
      plano = 'inativo', trial_expira_em = null, mp_assinatura_id = null,
      stripe_subscription_id = null, stripe_ads_subscription_id = null,
      stripe_account_id = null, stripe_onboarded = false,
      latitude = null, longitude = null, foto_fachada_url = null, fotos_fachada = '{}',
      website_url = null, whatsapp_business = null, destaque_ate = null,
      cidade_slug = null, uf = null, delivery_ativo = false, aceita_drone = false,
      excluido_em = now()
    where id = r.perfil_id;

  elsif r.papel = 'cliente' then
    delete from public.pontos_clientes     where cliente_id = r.perfil_id;
    delete from public.clube_movimentos    where cliente_id = r.perfil_id;
    delete from public.cupons              where cliente_id = r.perfil_id;
    delete from public.campanhas_retorno   where cliente_id = r.perfil_id;
    delete from public.loja_seguidores     where cliente_id = r.perfil_id;
    delete from public.post_likes          where cliente_id = r.perfil_id;
    delete from public.post_comentarios    where cliente_id = r.perfil_id;
    delete from public.post_eventos        where cliente_id = r.perfil_id;
    delete from public.pedidos_pendentes   where cliente_id = r.perfil_id;
    -- Pedidos ficam (5 anos), sem quem/onde. endereco_entrega é NOT NULL.
    update public.pedidos_clientes set
      cliente_nome = null, cliente_telefone = null, endereco_entrega = '[removido]',
      entrega_latitude = null, entrega_longitude = null, observacao = null
    where cliente_id = r.perfil_id;
    update public.festas set
      endereco_entrega = '[removido]', entrega_latitude = null, entrega_longitude = null
    where criador_cliente_id = r.perfil_id;
    -- Avaliações ficam (cadeia de hash); só a foto sai (não entra no hash).
    update public.avaliacoes_lojas set foto_url = null where cliente_id = r.perfil_id;
    -- FICAM: avaliacoes_lojas/entregadores (nota+comentário), mensagens_clientes,
    -- festa_participantes, pedidos_clientes.

    update public.clientes set
      user_id = null, nome = 'Cliente removido', cpf = null, telefone = null,
      perfil_privado = true, uf = null, excluido_em = now()
    where id = r.perfil_id;

  elsif r.papel = 'entregador' then
    delete from public.corrida_ofertas      where entregador_id = r.perfil_id;
    delete from public.entregas_localizacao where entregador_id = r.perfil_id;
    delete from public.entregador_parcerias where entregador_id = r.perfil_id;
    delete from public.kit_interesse        where entregador_id = r.perfil_id;
    -- FICAM: pedidos_clientes.entregador_id (corrida paga), kit_pedidos
    -- (compra), avaliacoes_entregadores (recebidas).

    update public.entregadores set
      user_id = null, nome = 'Entregador removido', cpf = null, telefone = null,
      foto_url = null, stripe_account_id = null, stripe_onboarded = false,
      data_nascimento = null, documento_tipo = null, documento_numero = null,
      documento_foto_url = null, veiculo_tipo = null, cnh_numero = null,
      cnh_categoria = null, cnh_foto_url = null, disponivel = false,
      latitude = null, longitude = null, localizacao_at = null,
      drone_serie = null, drone_anac = null, uf = null,
      tem_bolsa = false, bolsa_foto_url = null, bolsa_confirmada_em = null,
      excluido_em = now()
    where id = r.perfil_id;

  elsif r.papel = 'fornecedor' then
    delete from public.fornecedor_produtos      where fornecedor_id = r.perfil_id;  -- cascateia flash_sales
    delete from public.contatos_fornecedor      where fornecedor_id = r.perfil_id;
    delete from public.visualizacoes_fornecedor where fornecedor_id = r.perfil_id;
    -- FICAM: pedidos (B2B), mensagens, avaliacoes_fornecedores (recebidas).

    update public.fornecedores set
      user_id = null, nome = 'Fornecedor removido', localizacao = null, telefone = null,
      instagram = null, descricao = null, cnpj = null, latitude = null, longitude = null,
      stripe_account_id = null, stripe_onboarded = false, excluido_em = now()
    where id = r.perfil_id;
  end if;

  update public.exclusoes_conta set executado_em = now(), erro = null where id = r.id;
  return jsonb_build_object('id', r.id, 'papel', r.papel, 'perfil_id', r.perfil_id, 'user_id', r.user_id);
end $$;
revoke all on function public.purgar_conta(uuid) from public, anon, authenticated;
grant execute on function public.purgar_conta(uuid) to service_role;

-- Retenção do próprio registro: e-mail 6 meses, hash 2 anos.
create or replace function public.limpar_exclusoes_antigas()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare n int := 0; m int := 0;
begin
  update public.exclusoes_conta set email = null
   where email is not null and executado_em is not null and executado_em < now() - interval '6 months';
  get diagnostics n = row_count;
  update public.exclusoes_conta set hash_documento = null
   where hash_documento is not null and solicitado_em < now() - interval '2 years';
  get diagnostics m = row_count;
  return n + m;
end $$;
revoke all on function public.limpar_exclusoes_antigas() from public, anon, authenticated;
grant execute on function public.limpar_exclusoes_antigas() to service_role;

-- ----------------------------------------------------------------------------
-- 10. Trial não renasce para CPF/CNPJ em quarentena
-- ----------------------------------------------------------------------------
-- Corpo VIVO puxado em 2026-09-19 + uma linha (documento_em_quarentena).
create or replace function public.lojas_bloqueia_cobranca_cliente()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if tg_op = 'INSERT' then
    new.plano := 'inativo';
    new.stripe_subscription_id := null;
    new.mp_assinatura_id := null;
    new.assinatura_ciclos := 0;
    -- Trial é de fábrica: 3 dias a partir de agora, mande o cliente o que mandar.
    -- Exceto para documento de conta excluída há menos de 2 anos: apagar e
    -- recriar não zera o teste (exclusoes_conta.hash_documento).
    if public.documento_em_quarentena(new.documento) then
      new.trial_expira_em := now();
    else
      new.trial_expira_em := now() + interval '3 days';
    end if;
  elsif tg_op = 'UPDATE' then
    new.plano := old.plano;
    new.stripe_subscription_id := old.stripe_subscription_id;
    new.mp_assinatura_id := old.mp_assinatura_id;
    new.assinatura_ciclos := old.assinatura_ciclos;
    -- Só service role estende ou encerra o teste.
    new.trial_expira_em := old.trial_expira_em;
  end if;
  return new;
end; $$;

-- ----------------------------------------------------------------------------
-- 11. Guard de pedidos: abre UMA fresta para anonimizar (service role + GUC)
-- ----------------------------------------------------------------------------
-- Corpo VIVO puxado em 2026-09-19 (md5 b8cec215… — V2b). A única mudança é o
-- bloco no início do ramo UPDATE. Depois de aplicar: rode o teste do webhook
-- (regra 23 do CLAUDE.md) e registre o md5 novo na memória.
create or replace function public.pedidos_clientes_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  loja_lat double precision; loja_lng double precision; max_dist numeric;
  loja_tempo int; loja_dinamico boolean; loja_drone boolean;
  dist numeric; subtotal numeric; desconto_pts numeric; saldo_atual integer;
  abertos int; fator numeric; fator_real numeric; peso numeric; eta_min int;
  ent_veiculo text; ordem_old int; ordem_new int;
  pago_online boolean;
begin
  if tg_op = 'INSERT' then
    new.status := 'recebido'; new.entregador_id := null;
    new.codigo_confirmacao := null; new.pagamento_corrida := 'pendente';
    new.created_at := now(); new.updated_at := now();
    new.garantia_cupom_id := null;
    new.entrega_drone := false;

    pago_online := (auth.role() = 'service_role'
                    and nullif(new.stripe_session_id, '') is not null);

    select latitude, longitude, distancia_maxima_entrega, tempo_preparo_min,
           coalesce(preco_dinamico, false), coalesce(aceita_drone, false)
      into loja_lat, loja_lng, max_dist, loja_tempo, loja_dinamico, loja_drone
      from public.lojas where id = new.loja_id;

    new.tempo_preparo_min := coalesce(new.tempo_preparo_min, loja_tempo, 30);

    if jsonb_typeof(coalesce(new.itens, '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(new.itens, '[]'::jsonb)) = 0 then
      raise exception 'Pedido sem itens.' using errcode = 'P0001';
    end if;

    if exists (
      select 1 from jsonb_array_elements(new.itens) e
       where e->>'quantidade' is null
          or (e->>'quantidade') !~ '^[0-9]+$'
          or (e->>'quantidade')::numeric <= 0
          or (e->>'quantidade')::numeric > 500
    ) then
      raise exception 'Quantidade invalida no pedido (use inteiros de 1 a 500).' using errcode = 'P0001';
    end if;

    if exists (
      select 1
        from jsonb_array_elements(new.itens) e
        left join public.produtos p
               on p.id = nullif(e->>'produto_id', '')::uuid
              and p.loja_id = new.loja_id
       where p.id is null
    ) then
      raise exception 'Item invalido no pedido: produto inexistente nesta loja.' using errcode = 'P0001';
    end if;

    fator_real := 1.0;
    if loja_dinamico and new.festa_id is null then
      select count(*) into abertos
        from public.pedidos_clientes
        where loja_id = new.loja_id and status in ('recebido','preparando');
      if public.eh_horario_pico(now()) then fator_real := fator_real + 0.10; end if;
      if abertos >= 5                 then fator_real := fator_real + 0.05; end if;
    end if;

    if new.fator_exibido is not null and new.fator_exibido >= 1.0 then
      fator := least(fator_real, new.fator_exibido);
    else
      fator := fator_real;
    end if;

    new.preco_dinamico_fator := case
      when pago_online and coalesce(new.preco_dinamico_fator, 0) >= 1.0
        then new.preco_dinamico_fator
      else fator
    end;

    with linhas as (
      select e,
             (e->>'quantidade')::numeric as qtd,
             nullif(e->>'produto_id', '')::uuid as pid
        from jsonb_array_elements(new.itens) e
    ),
    resolvidas as (
      select l.e, l.qtd,
             public.preco_efetivo(p.id, new.loja_id, p.preco_venda) as base,
             coalesce(p.peso_kg, 0) as peso_unit,
             case
               when pago_online
                    and jsonb_typeof(l.e->'preco') = 'number'
                    and (l.e->>'preco')::numeric > 0
                 then round((l.e->>'preco')::numeric, 2)
             end as preco_cobrado
        from linhas l
        join public.produtos p on p.id = l.pid and p.loja_id = new.loja_id
    )
    select
      coalesce(jsonb_agg(r.e
        || jsonb_build_object('preco', coalesce(r.preco_cobrado, round(r.base * fator, 2)))
        || jsonb_build_object('preco_base', r.base)), '[]'::jsonb),
      coalesce(sum(coalesce(r.preco_cobrado, round(r.base * fator, 2)) * r.qtd), 0),
      coalesce(sum(r.peso_unit * r.qtd), 0)
      into new.itens, subtotal, peso
      from resolvidas r;

    new.peso_total_kg := peso;

    dist := public.haversine_km(loja_lat, loja_lng, new.entrega_latitude, new.entrega_longitude);
    new.distancia_km := dist;

    if new.festa_id is not null then
      new.taxa_entrega := coalesce(new.taxa_entrega, 0);
      new.valor_corrida := coalesce(new.valor_corrida, new.taxa_entrega);
      new.desconto_pontos := 0;
      new.pontos_usados := 0;
      new.total := subtotal + new.taxa_entrega;
    else
      if pago_online then
        new.taxa_entrega := round(coalesce(new.taxa_entrega, public.calcular_taxa_entrega(dist)), 2);
      else
        new.taxa_entrega := public.calcular_taxa_entrega(dist);
        if public.eh_horario_pico(now()) then
          new.taxa_entrega := round(new.taxa_entrega * 1.3, 2);
        end if;
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
    end if;

    eta_min := new.tempo_preparo_min + ceil(coalesce(dist, 0) * 5)::int;
    new.eta_em := now() + make_interval(mins => eta_min);

    if coalesce(new.anonimo, false) then
      new.cliente_nome := null;
      new.cliente_telefone := null;
    end if;

  elsif tg_op = 'UPDATE' then
    -- ANONIMIZAÇÃO (exclusão de conta, 2026-09-19): purgar_conta() roda como
    -- service role com a GUC `commerly.anonimizar` ligada na transação. Nesse
    -- caso — e só nesse — o update pode anular o QUEM/ONDE do pedido; todo o
    -- resto (preço, status, entregador, pagamento, updated_at) fica como estava.
    if auth.role() = 'service_role'
       and current_setting('commerly.anonimizar', true) = '1' then
      new := old;
      new.cliente_nome := null;
      new.cliente_telefone := null;
      new.endereco_entrega := '[removido]';
      new.entrega_latitude := null;
      new.entrega_longitude := null;
      new.observacao := null;
      return new;
    end if;

    new.loja_id := old.loja_id; new.cliente_id := old.cliente_id; new.itens := old.itens;
    new.total := old.total; new.taxa_entrega := old.taxa_entrega; new.valor_corrida := old.valor_corrida;
    new.distancia_km := old.distancia_km; new.entrega_latitude := old.entrega_latitude; new.entrega_longitude := old.entrega_longitude;
    new.endereco_entrega := old.endereco_entrega; new.observacao := old.observacao;
    new.cliente_nome := old.cliente_nome; new.cliente_telefone := old.cliente_telefone;
    new.pontos_usados := old.pontos_usados; new.desconto_pontos := old.desconto_pontos;
    new.created_at := old.created_at; new.updated_at := now();
    new.stripe_session_id := old.stripe_session_id; new.stripe_payment_intent := old.stripe_payment_intent;
    new.festa_id := old.festa_id;
    new.pagamento_metodo := old.pagamento_metodo;

    new.anonimo := old.anonimo;
    new.eta_em := old.eta_em;
    new.preco_dinamico_fator := old.preco_dinamico_fator;
    new.fator_exibido := old.fator_exibido;
    new.peso_total_kg := old.peso_total_kg;

    if old.garantia_cupom_id is not null then
      new.garantia_cupom_id := old.garantia_cupom_id;
    end if;

    if new.status = 'cancelado' and old.status <> 'cancelado'
       and old.pagamento_metodo = 'online' and old.pagamento_status = 'pago'
       and auth.role() = 'authenticated' then
      raise exception 'Pedido pago online: cancele pelo painel para o cliente ser estornado.'
        using errcode = 'P0001';
    end if;

    if old.status in ('entregue', 'cancelado') then
      new.status := old.status;
      new.entregador_id := old.entregador_id;
      new.codigo_confirmacao := old.codigo_confirmacao;
      new.lote_entrega_id := old.lote_entrega_id;
      new.ordem_coleta := old.ordem_coleta;
      new.ordem_entrega := old.ordem_entrega;
      new.entrega_drone := old.entrega_drone;
      return new;
    end if;

    if new.status is distinct from old.status and new.status <> 'cancelado' then
      ordem_old := array_position(array['recebido','preparando','saiu','entregue'], old.status);
      ordem_new := array_position(array['recebido','preparando','saiu','entregue'], new.status);
      if ordem_old is null or ordem_new is null or ordem_new < ordem_old then
        raise exception 'Transicao de status invalida: % -> %.', old.status, new.status using errcode = 'P0001';
      end if;
    end if;

    if new.pagamento_status is distinct from old.pagamento_status
       and old.pagamento_status = 'pago' and new.pagamento_status = 'pendente' then
      new.pagamento_status := old.pagamento_status;
    end if;

    if new.entregador_id is not null then
      select veiculo_tipo into ent_veiculo from public.entregadores where id = new.entregador_id;
      new.entrega_drone := (ent_veiculo = 'drone');

      if new.entrega_drone and (old.entregador_id is null or old.entregador_id <> new.entregador_id) then
        select coalesce(aceita_drone, false) into loja_drone from public.lojas where id = new.loja_id;
        if not loja_drone then
          raise exception 'Esta loja nao aceita entrega por drone.' using errcode = 'P0001';
        end if;
        if old.distancia_km is null or old.distancia_km > 5 then
          raise exception 'Drone entrega ate 5 km (distancia: % km).', coalesce(old.distancia_km, -1) using errcode = 'P0001';
        end if;
        if old.peso_total_kg > 2 then
          raise exception 'Drone leva ate 2 kg (pedido: % kg).', old.peso_total_kg using errcode = 'P0001';
        end if;
        if not public.eh_horario_diurno(now()) then
          raise exception 'Drone so opera das 6h as 18h.' using errcode = 'P0001';
        end if;
      end if;
    else
      new.entrega_drone := false;
    end if;

    new.codigo_confirmacao := null;
  end if;
  return new;
end;
$function$;

-- ----------------------------------------------------------------------------
-- 12. Views públicas: conta em exclusão some na hora
-- ----------------------------------------------------------------------------
-- lojas_publicas: TODAS as colunas (regra 4 do CLAUDE.md — a view já perdeu
-- coluna duas vezes). A exclusão entra em `disponivel`, que as telas já
-- filtram; nada de WHERE na view.
create or replace view public.lojas_publicas as
select id,
       nome,
       tipo,
       localizacao,
       telefone,
       instagram,
       horario,
       latitude,
       longitude,
       fotos_fachada,
       taxa_entrega,
       website_url,
       created_at,
       stripe_onboarded and stripe_account_id is not null as aceita_pagamento_online,
       distancia_maxima_entrega,
       preco_dinamico,
       aceita_drone,
       destaque_ate is not null and destaque_ate > now() as destaque,
       whatsapp_business,
       (plano = 'ativo' or (trial_expira_em is not null and trial_expira_em > now()))
         and exclusao_solicitada_em is null
         as disponivel
  from public.lojas;
alter view public.lojas_publicas set (security_invoker = off);
grant select on public.lojas_publicas to anon, authenticated;

-- Fornecedores não têm `disponivel`; a área /fornecedor/* lê `fornecedores`
-- direto (policy de dono), então filtrar aqui não cega o próprio fornecedor.
create or replace view public.fornecedores_publicos as
select id, user_id, nome, categoria, localizacao, telefone, instagram, descricao,
       latitude, longitude, created_at
  from public.fornecedores
 where exclusao_solicitada_em is null;
alter view public.fornecedores_publicos set (security_invoker = off);
grant select on public.fornecedores_publicos to anon, authenticated;

create or replace view public.fornecedor_produtos_publicos as
select fp.id, fp.fornecedor_id, f.nome as fornecedor_nome, fp.nome, fp.descricao,
       fp.preco, fp.unidade, fp.minimo_pedido, fp.ativo, fp.created_at,
       fp.estoque > 0 as em_estoque
  from public.fornecedor_produtos fp
  join public.fornecedores f on f.id = fp.fornecedor_id
 where f.exclusao_solicitada_em is null;
alter view public.fornecedor_produtos_publicos set (security_invoker = off);
grant select on public.fornecedor_produtos_publicos to anon, authenticated;

-- Ranking não mostra "Entregador removido".
create or replace view public.ranking_entregadores_semana as
select e.id as entregador_id, e.nome, e.foto_url,
       coalesce(p.entregas, 0::bigint) as entregas,
       coalesce(p.ganhos, 0::numeric)::numeric(12,2) as ganhos,
       coalesce(av.media_nota, 0::numeric)::numeric(3,2) as media_nota
  from public.entregadores e
  left join (select pedidos_clientes.entregador_id, count(*) as entregas,
                    sum(pedidos_clientes.valor_corrida) as ganhos
               from public.pedidos_clientes
              where pedidos_clientes.status = 'entregue'
                and pedidos_clientes.updated_at >= (now() - '7 days'::interval)
              group by pedidos_clientes.entregador_id) p on p.entregador_id = e.id
  left join (select avaliacoes_entregadores.entregador_id, avg(avaliacoes_entregadores.nota) as media_nota
               from public.avaliacoes_entregadores
              group by avaliacoes_entregadores.entregador_id) av on av.entregador_id = e.id
 where e.exclusao_solicitada_em is null;
-- Era security_invoker=on antes desta migração; mantém.
alter view public.ranking_entregadores_semana set (security_invoker = on);

-- ----------------------------------------------------------------------------
-- CONFERÊNCIA depois de aplicar (migração parcial já aconteceu antes):
--   select column_name from information_schema.columns where table_name in
--     ('lojas','clientes','entregadores','fornecedores') and column_name like 'exclu%';
--   select count(*) from vault.secrets where name='exclusao_pepper';   -- 1
--   select proname from pg_proc where proname in ('solicitar_exclusao_conta',
--     'reativar_conta','purgar_conta','checar_exclusao_conta','minha_exclusao',
--     'hash_documento','documento_em_quarentena','limpar_exclusoes_antigas');
--   select md5(pg_get_functiondef('public.pedidos_clientes_guard'::regproc));
-- ----------------------------------------------------------------------------
