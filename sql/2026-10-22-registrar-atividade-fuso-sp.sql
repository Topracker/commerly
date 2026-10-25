-- registrar_atividade(): "hoje" no fuso da loja, não em UTC.
--
-- O banco roda em UTC; `current_date` vira o dia às 21h de São Paulo. Quem
-- usava o app entre 21h e 24h tinha a atividade gravada no dia SEGUINTE
-- (atividade_dias.dia e streaks.ultimo_dia), e a streak contava errado.
-- Agora: (now() at time zone 'America/Sao_Paulo')::date — o mesmo dia de
-- diaLoja() em app/lib/datas.ts (e de atualizarStreak em gamificacaoServer.ts).
--
-- `=` → `>=` no "já contou hoje": linhas gravadas antes desta migração podem
-- estar 1 dia à frente (dia UTC). Sem isso, a primeira atividade depois da
-- troca cairia no `else` e ZERARIA a streak de quem usou o app à noite.
--
-- Aplicado sobre o CORPO VIVO com replace() (regra 5 do CLAUDE.md), travado
-- pelo md5 de pg_get_functiondef conferido em 2026-10-22:
--   antes:  5e0c0747ec3af7195cedd8ff52beefc4
--   depois: 4a24f2aff4499e2b3ed5a379a392127f
--
-- STATUS: APLICADO em produção em 2026-10-25 (via MCP), md5 antes e depois conferidos.

do $$
declare
  v_def  text := pg_get_functiondef('public.registrar_atividade(uuid)'::regprocedure);
  v_novo text;
begin
  if md5(v_def) <> '5e0c0747ec3af7195cedd8ff52beefc4' then
    raise exception 'registrar_atividade mudou desde a revisão (md5 %) — revise antes de aplicar', md5(v_def);
  end if;

  v_novo := replace(v_def,
    'v_hoje date := current_date;',
    'v_hoje date := (now() at time zone ''America/Sao_Paulo'')::date;');
  v_novo := replace(v_novo,
    'if v_ultimo = v_hoje then return; end if;',
    'if v_ultimo >= v_hoje then return; end if;');

  if v_novo = v_def
     or position('current_date' in v_novo) > 0
     or position('v_ultimo >= v_hoje' in v_novo) = 0 then
    raise exception 'replace() não casou nos dois pontos — nada foi alterado';
  end if;

  execute v_novo;
end $$;

-- Conferência:
-- select md5(pg_get_functiondef('public.registrar_atividade(uuid)'::regprocedure)),
--        pg_get_functiondef('public.registrar_atividade(uuid)'::regprocedure);
