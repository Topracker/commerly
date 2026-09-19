-- ============================================================================
-- L2: CPF/CNPJ único entre lojas
-- ----------------------------------------------------------------------------
-- `lojas.documento` só tinha índice comum. O onboarding checa duplicidade via
-- /api/cadastro/checar (soft, TOCTOU, fail-open), a tela de configurações não
-- checava nada — e foi assim que o CPF 173.939.936-60 acabou em DUAS lojas:
--
--   Bebidas Express  4a386cbb…  criada 21/04  user_id SEM auth.users (órfã),
--                               0 vendas, 0 pedidos, 6 produtos, sem trial
--   Brasa Burger     b0cb694f…  criada 24/05  dono real (logou), 9 vendas,
--                               4 pedidos, 7 produtos, trial até 26/09
--
-- Brasa Burger fica com o documento. Bebidas Express é apagada: não tem dono
-- (ninguém consegue logar nela, nunca mais) e só `produtos` a referencia sem
-- cascade — por isso os 6 produtos saem antes. Tudo o mais está em zero.
--
-- Depois, índice ÚNICO sobre o documento NORMALIZADO (só dígitos): a máscara
-- não importa e nulo/vazio não colide. Só `lojas` — CPF de cliente × CPF de
-- loja continua soft em /api/cadastro/checar (uma pessoa ser cliente e
-- comerciante é legítimo).
--
-- Aplicado em produção via MCP em 2026-09-19.
-- ============================================================================

-- 1. Limpeza da órfã (snapshot de rollback no fim do arquivo).
delete from public.produtos where loja_id = '4a386cbb-0978-43c0-b908-3ca7742b6f7f';
delete from public.lojas    where id      = '4a386cbb-0978-43c0-b908-3ca7742b6f7f';

-- 2. Índice único funcional. `regexp_replace` é IMMUTABLE, então pode indexar.
create unique index if not exists lojas_documento_uidx
  on public.lojas ((regexp_replace(documento, '\D', '', 'g')))
  where nullif(regexp_replace(documento, '\D', '', 'g'), '') is not null;

-- Conferência:
--   select count(*) from lojas where documento is not null
--    group by regexp_replace(documento, '\D', '', 'g') having count(*) > 1;   -- 0 linhas
--   select indexdef from pg_indexes where indexname = 'lojas_documento_uidx';

-- ----------------------------------------------------------------------------
-- ROLLBACK da órfã (snapshot tirado em 2026-09-19, antes do delete).
-- O user_id não existe em auth.users, então o INSERT bate na FK
-- lojas_user_id_fkey: rode dentro de `set session_replication_role = replica`
-- (desliga FK e triggers na sessão) e volte para 'origin' depois. E o índice
-- único precisa sair antes (`drop index lojas_documento_uidx`), senão o CPF
-- colide com Brasa Burger de novo.
-- ----------------------------------------------------------------------------
--   insert into public.lojas select * from json_populate_record(null::public.lojas, '{"id": "4a386cbb-0978-43c0-b908-3ca7742b6f7f", "user_id": "77015e3c-988c-4535-af21-8e2bca2a714d", "nome": "Bebidas Express", "tipo": "Distribuidora de bebidas", "localizacao": "Goiânia ", "telefone": "28761552893", "instagram": "Comerlly_app", "horario": "10:00--20:00", "created_at": "2026-04-21T00:50:03.255243", "documento": "173.939.936-60", "meta_mensal": 5000, "plano": "inativo", "trial_expira_em": null, "fundador": false, "mp_assinatura_id": null, "assinatura_ciclos": 0, "stripe_subscription_id": null, "latitude": -16.680882, "longitude": -49.2532691, "foto_fachada_url": null, "fotos_fachada": [], "taxa_entrega": 0.0, "stripe_account_id": null, "stripe_onboarded": false, "distancia_maxima_entrega": 10.0, "website_url": null, "tempo_preparo_min": 30, "destaque_ate": null, "stripe_ads_subscription_id": null, "regime": "mei", "mei_atividade": "comercio", "whatsapp_business": null, "preco_dinamico": false, "aceita_drone": false, "cidade_slug": "goiania", "uf": "GO", "delivery_ativo": true}');
--   insert into public.produtos select * from json_populate_record(null::public.produtos, '{"id": "72a84a9c-5378-4367-a1ea-e4dbce1c37a3", "loja_id": "4a386cbb-0978-43c0-b908-3ca7742b6f7f", "nome": "Coca-Cola 2L", "preco_venda": 12.9, "custo": 8.5, "quantidade": 120, "quantidade_minima": 24, "categoria": "Refrigerantes", "imagem_url": null, "created_at": "2026-07-27T02:09:31.868362", "descricao": "Refrigerante de cola, garrafa PET de 2 litros. Entregue gelada.", "tags_nutri": [], "nutri_analisado_em": null, "peso_kg": null}');
--   insert into public.produtos select * from json_populate_record(null::public.produtos, '{"id": "dfa3fa6b-278f-498d-93f8-ff3ef2367be5", "loja_id": "4a386cbb-0978-43c0-b908-3ca7742b6f7f", "nome": "Guaraná Antarctica 2L", "preco_venda": 10.9, "custo": 7.2, "quantidade": 100, "quantidade_minima": 24, "categoria": "Refrigerantes", "imagem_url": null, "created_at": "2026-07-27T02:09:31.868362", "descricao": "Refrigerante de guaraná, garrafa PET de 2 litros.", "tags_nutri": [], "nutri_analisado_em": null, "peso_kg": null}');
--   insert into public.produtos select * from json_populate_record(null::public.produtos, '{"id": "cc65c924-2536-4ab0-9360-688e5ea3f605", "loja_id": "4a386cbb-0978-43c0-b908-3ca7742b6f7f", "nome": "Heineken Long Neck 330ml", "preco_venda": 8.9, "custo": 5.6, "quantidade": 200, "quantidade_minima": 48, "categoria": "Cervejas", "imagem_url": null, "created_at": "2026-07-27T02:09:31.868362", "descricao": "Cerveja puro malte, garrafa long neck 330ml. Venda proibida para menores de 18 anos.", "tags_nutri": [], "nutri_analisado_em": null, "peso_kg": null}');
--   insert into public.produtos select * from json_populate_record(null::public.produtos, '{"id": "550f3300-02af-4d87-a70d-b2ae477d53a3", "loja_id": "4a386cbb-0978-43c0-b908-3ca7742b6f7f", "nome": "Água Mineral sem Gás 1,5L", "preco_venda": 4.5, "custo": 2.1, "quantidade": 180, "quantidade_minima": 36, "categoria": "Águas", "imagem_url": null, "created_at": "2026-07-27T02:09:31.868362", "descricao": "Água mineral natural, garrafa de 1,5 litro.", "tags_nutri": [], "nutri_analisado_em": null, "peso_kg": null}');
--   insert into public.produtos select * from json_populate_record(null::public.produtos, '{"id": "a098c56c-871b-403c-96d9-423a1328c4fe", "loja_id": "4a386cbb-0978-43c0-b908-3ca7742b6f7f", "nome": "Suco de Laranja Integral 1L", "preco_venda": 14.9, "custo": 9.3, "quantidade": 60, "quantidade_minima": 12, "categoria": "Sucos", "imagem_url": null, "created_at": "2026-07-27T02:09:31.868362", "descricao": "Suco de laranja 100% integral, sem açúcar e sem conservantes. Refrigerado.", "tags_nutri": [], "nutri_analisado_em": null, "peso_kg": null}');
--   insert into public.produtos select * from json_populate_record(null::public.produtos, '{"id": "13b3a929-a9bc-419e-bf9a-a99afa83ba75", "loja_id": "4a386cbb-0978-43c0-b908-3ca7742b6f7f", "nome": "Red Bull Energy Drink 250ml", "preco_venda": 11.9, "custo": 7.8, "quantidade": 90, "quantidade_minima": 18, "categoria": "Energéticos", "imagem_url": null, "created_at": "2026-07-27T02:09:31.868362", "descricao": "Energético em lata de 250ml.", "tags_nutri": [], "nutri_analisado_em": null, "peso_kg": null}');
