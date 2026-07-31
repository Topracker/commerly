# Checklist de Testes — Commerly

> **Para o testador:** você não precisa conhecer o código. Cada item abaixo é uma
> ação concreta: faça exatamente o que está escrito e veja se o app se comporta
> como o item descreve. Se não se comportar, **isso é um bug** — reporte usando o
> modelo da seção 1.

**O que é o Commerly:** um sistema para pequenos comércios. Ele tem **4 áreas
diferentes**, cada uma com seu próprio login:

| Área | Quem usa | Onde entra |
|---|---|---|
| Painel do comerciante | dono da loja | `/login` |
| App do cliente | quem compra / pede delivery | `/cliente/login` |
| App do entregador | quem entrega | `/entregador-delivery/login` |
| Painel do fornecedor | quem vende para as lojas (B2B) | `/fornecedor/login` |

**Endereço do app:** `https://commerly.app`

**Sugestão de divisão dos 2 dias:**
- **Dia 1:** seções 4 (Dinheiro), 5 (Segurança), 6 (Delivery ponta a ponta), 7 (Festa)
- **Dia 2:** seções 8 (Painel do comerciante), 9 (IA), 10 (Celular), 11 (Visual)

Se o tempo acabar, **priorize sempre Dinheiro e Segurança** — são os bugs que
custam caro.

---

## 1. Como reportar um bug

Abra um item por bug (não junte vários no mesmo relato). Copie e preencha este
modelo:

```
TÍTULO: (uma frase curta, ex: "Resgate de pontos não desconta do total")

O QUE EU FIZ:
1.
2.
3.

O QUE EU ESPERAVA QUE ACONTECESSE:

O QUE ACONTECEU DE VERDADE:

ONDE:
- Aparelho: (ex: PC Windows 11 / iPhone 13 / Samsung A34)
- Navegador e versão: (ex: Chrome 126, Safari do iOS, app instalado na tela inicial)
- Endereço da página (URL completa da barra do navegador):
- Conta usada: (qual dos 4 papéis: comerciante / cliente / entregador / fornecedor)
- Hora aproximada:

GRAVIDADE: (ver tabela abaixo)

PRINT / VÍDEO: (anexar sempre — print da tela inteira, com a URL visível)

ACONTECE SEMPRE? (sim / não / só na primeira vez / só no celular)
```

### Tabela de gravidade

| Nível | Quando usar |
|---|---|
| **Crítico** | Perdeu dinheiro, cobrou errado, deu para ver dado de outra pessoa, ou o app ficou inutilizável |
| **Alto** | Uma função principal não funciona (não consigo fazer pedido, não consigo cadastrar produto) |
| **Médio** | Funciona, mas errado ou confuso (número errado na tela, mensagem de erro sem sentido) |
| **Baixo** | Visual, texto, alinhamento, erro de português |

### Dicas que fazem o relato valer 3x mais

- [ ] Antes de reportar, **tente repetir o bug do zero**. Diga se repetiu ou não.
- [ ] No PC, abra o **Console** do navegador (tecla `F12` → aba `Console`) e
      **printe as linhas em vermelho** que aparecerem quando o bug acontecer.
- [ ] Se a tela travou em "Carregando...", espere **30 segundos** antes de
      reportar — e diga quanto tempo esperou.
- [ ] Anote a URL exata. `/cliente/pedidos` e `/pedidos` são telas diferentes.

---

## 2. Contas de teste e avisos

### Contas

> ⚠️ **Os e-mails e as senhas não estão neste arquivo de propósito** — ele fica
> no repositório público do projeto. **Peça a tabela preenchida ao Matheus por
> mensagem privada** e anote aqui na sua cópia:

| Papel | E-mail | Senha | Onde loga |
|---|---|---|---|
| Comerciante | `____________` | `____________` | `/login` |
| Cliente | `____________` | `____________` | `/cliente/login` |
| Entregador | `____________` | `____________` | `/entregador-delivery/login` |
| Fornecedor | `____________` | `____________` | `/fornecedor/login` |

A loja de teste do comerciante se chama **"Burger House"** (hamburgueria, com
delivery ligado).

### ⚠️ Avisos importantes — leia antes de começar

1. **Delivery só funciona em Goiânia (GO).** É de propósito. Se você estiver em
   outra cidade, ou o navegador der uma localização de outra cidade, o app vai
   dizer que ainda não atende sua região — **isso não é bug**. Para testar
   delivery você precisa estar em Goiânia ou usar um endereço de Goiânia.
   Só reporte se o app disser que atende e depois não deixar pedir (ou o
   contrário).

2. **Uma sessão por navegador.** As 4 áreas compartilham o mesmo login do
   navegador. Se você entrar como cliente, **você saiu como comerciante**. Para
   testar 2 papéis ao mesmo tempo, use:
   - navegador normal + **janela anônima**, ou
   - Chrome + Firefox, ou
   - PC + celular.

3. **Dinheiro de verdade.** O checkout da assinatura está ligado à Stripe.
   **Antes de clicar em "Assinar", confirme com o Matheus se o ambiente está em
   modo de teste ou em modo real.** Se for modo real, o cartão é cobrado de
   verdade. Nunca use cartão de terceiros.

4. **Você vai sujar os dados.** Pedidos, produtos e avaliações que você criar
   ficam no sistema. Tudo bem — mas **coloque "TESTE" no nome** do que criar
   (ex: produto "TESTE - Pizza") para o Matheus limpar depois.

5. **Não é bug:** páginas públicas que abrem sem login. A loja pública
   (`/loja/{id}`), o cardápio digital (`/cardapio/{id}`), o perfil do fornecedor
   (`/fornecedor/{id}`) e os perfis públicos (`/comerciante/{slug}`,
   `/cliente/{slug}`, `/entregador/{slug}`) **devem** abrir para qualquer um.

---

## 3. Aquecimento (15 minutos, faça primeiro)

- [ ] Abrir `https://commerly.app` no PC e conferir se a home carrega sem erro.
- [ ] Fazer login com as 4 contas, uma de cada vez, e confirmar que cada uma cai
      no painel/dashboard certo.
- [ ] Deslogar de cada uma e confirmar que voltou para a tela de login.
- [ ] Repetir o login das 4 contas **no celular**.

---

## 4. DINHEIRO (prioridade máxima)

> Qualquer coisa errada aqui é **Crítico**. Anote valores exatos (com centavos) em
> tudo que reportar.

### 4.1 Assinatura do comerciante

Logado como **comerciante**, vá em `/planos`.

- [ ] Conferir se o preço mostrado na tela é `R$ 54,90/mês` — ou `R$ 29,90/mês`
      se a conta for do programa **Fundadores**. Qualquer outro valor é bug.
- [ ] Conferir se o preço que aparece no **botão** ("Assinar por R$ XX,XX/mês via
      Stripe") é o **mesmo** preço mostrado no card acima dele.
- [ ] Clicar em "Assinar" e confirmar que abre a página de pagamento da Stripe,
      **com o mesmo valor** e em **reais (R$)**.
- [ ] Na tela da Stripe, clicar em "voltar" (seta do navegador) sem pagar, e
      conferir que o app não diz que a assinatura foi feita.
- [ ] Recarregar `/planos` depois de voltar sem pagar: o plano **não** pode
      aparecer como ativo.

### 4.2 Pagamento aprovado

> Só faça se o Matheus confirmar que o ambiente é de **teste**. Em modo de teste,
> o cartão `4242 4242 4242 4242`, validade futura qualquer, CVC `123`, funciona.

- [ ] Concluir o pagamento e conferir que volta para `/planos` com a mensagem
      "Assinatura confirmada! Seu plano está ativo."
- [ ] Recarregar a página e conferir que **continua** ativo (não pode voltar a
      pedir pagamento).
- [ ] Entrar em `/configuracoes` → seção **"Faturas da mensalidade"** → clicar em
      "Ver faturas" e conferir que a fatura do pagamento aparece, com o valor
      correto, e que o PDF abre.

### 4.3 Cartão recusado

> Em modo de teste, o cartão `4000 0000 0000 0002` é sempre recusado.
> **Em modo real, pule este item** e avise que pulou.

- [ ] Tentar pagar com o cartão recusado e conferir que a Stripe mostra a recusa.
- [ ] Voltar ao app e conferir que aparece "Houve um problema com o pagamento.
      Tente novamente." **e que o plano continua inativo**.
- [ ] Tentar assinar de novo, agora com cartão que funciona, e conferir que
      consegue (não pode ficar travado depois de uma recusa).

### 4.4 Cancelamento

- [ ] Em `/planos`, com plano ativo, clicar em "Cancelar assinatura".
- [ ] Conferir que aparece uma confirmação avisando que o acesso continua até o
      fim do período já pago. Clicar em **Cancelar** na caixa (recusar) e
      conferir que **nada foi cancelado**.
- [ ] Repetir e confirmar de verdade. Conferir a mensagem de sucesso.
- [ ] **O mais importante:** depois de cancelar, conferir que você **ainda
      consegue** usar o painel (`/dashboard`, `/produtos`, `/pedidos`). Cancelar
      não pode expulsar na hora — o acesso vale até o fim do período pago.
- [ ] Recarregar `/planos` e conferir que a tela mostra o estado cancelado de
      forma clara (e não "ativo" como se nada tivesse acontecido).

### 4.5 Resgate de pontos (cliente)

Logado como **cliente**:

- [ ] Abrir `/cliente/clube` e anotar o **saldo de pontos** e o **nível**
      (Bronze / Prata / Ouro / Diamante).
- [ ] Conferir a regra do nível: Bronze a partir de 0, Prata 500, Ouro 2.000,
      Diamante 5.000 pontos acumulados. Se o saldo for 700 e disser "Bronze",
      é bug.
- [ ] Abrir uma loja em `/cliente/buscar`, montar um pedido e chegar na tela
      "Fazer pedido".
- [ ] **Com menos de 100 pontos:** conferir que a opção "Usar meus pontos"
      **não** aparece (o resgate mínimo é 100 pontos = R$ 5).
- [ ] **Com 100 pontos ou mais:** conferir que aparece "Usar meus pontos" com o
      texto do tipo "X pontos disponíveis · resgatar Y = R$ Z,00 de desconto".
- [ ] Ativar o resgate e conferir que o **total do pedido diminui exatamente**
      o valor do desconto (100 pontos = R$ 5,00; 250 pontos = R$ 10,00, porque
      resgata só em blocos de 100).
- [ ] Desativar o resgate e conferir que o total **volta ao valor original**.
- [ ] Conferir que o desconto **nunca fica maior que o valor dos produtos**
      (monte um pedido barato, de R$ 3,00, com saldo alto: o total não pode ficar
      negativo nem R$ 0,00 com desconto absurdo).
- [ ] Finalizar o pedido com resgate e conferir em `/cliente/clube` que os pontos
      usados **saíram do saldo**.
- [ ] Anotar quantos pontos você tinha antes de um pedido **sem** resgate. Depois
      que o pedido for marcado como **entregue**, conferir que ganhou
      **1 ponto por R$ 1 gasto em produtos** — a **taxa de entrega não pontua**.
      (Pedido de R$ 40 em produtos + R$ 8 de taxa = 40 pontos, não 48.)
- [ ] Fazer um pedido, cancelá-lo, e conferir que **não ganhou pontos** por ele.

### 4.6 Indicação / desconto

Logado como **comerciante**, vá em `/embaixador`.

- [ ] Conferir que a página mostra um **código de indicação** e um link de convite.
- [ ] Copiar o link e abrir em **janela anônima**. Conferir que a página
      `/convite/{código}` carrega, mostra "Você foi convidado!" com o código, e
      oferece as 4 portas (Cliente, Comerciante, Entregador, Fornecedor).
- [ ] Inventar um código que não existe (ex: `/convite/ZZZZ99`) e conferir que a
      página **não quebra** — deve mostrar a boas-vindas genérica.
- [ ] Clicar em "Sou Comerciante" pelo link de convite e conferir que, na tela de
      cadastro, o **campo de convite já vem preenchido** com o código.
- [ ] Em `/planos`, conferir a explicação do desconto: **10% por indicação que
      efetivamente assinar, até no máximo 40%**. Se a tela prometer outro
      percentual (ou desconto por indicação que só se cadastrou), reporte.
- [ ] Se a conta já tiver indicações confirmadas, conferir que o preço do botão
      "Assinar" **já vem com o desconto aplicado** e que a conta bate:
      1 indicação = 10% off, 2 = 20%, 3 = 30%, 4 ou mais = 40% (nunca mais que isso).

---

## 5. SEGURANÇA (prioridade máxima)

> Tudo aqui é **Crítico** se falhar. Se você conseguir ver ou fazer algo que não
> devia, **printe imediatamente** (a tela e a URL).

### 5.1 Acessar rota protegida sem login

Abra uma **janela anônima** (sem nenhum login) e cole cada endereço abaixo na
barra. Cada um **deve** te jogar para uma tela de login — nenhum pode mostrar
dados nem ficar carregando para sempre.

Painel do comerciante (deve ir para `/login`):
- [ ] `/dashboard`
- [ ] `/produtos`
- [ ] `/vendas`
- [ ] `/financeiro`
- [ ] `/clientes`
- [ ] `/pedidos`
- [ ] `/configuracoes`
- [ ] `/gastos`
- [ ] `/fiado`
- [ ] `/promocoes`
- [ ] `/academy`

Área do cliente (deve ir para `/cliente/login`):
- [ ] `/cliente/dashboard`
- [ ] `/cliente/pedidos`
- [ ] `/cliente/clube`
- [ ] `/cliente/festa`
- [ ] `/cliente/mensagens`
- [ ] `/cliente/favoritas`

Área do entregador (deve ir para `/entregador-delivery/login`):
- [ ] `/entregador-delivery/dashboard`
- [ ] `/entregador-delivery/notificacoes`

Área do fornecedor (deve ir para `/fornecedor/login`):
- [ ] `/fornecedor/dashboard`
- [ ] `/fornecedor/produtos`
- [ ] `/fornecedor/avaliacoes`
- [ ] `/fornecedor/configuracoes`

Páginas pessoais (deve ir para `/login`):
- [ ] `/embaixador`
- [ ] `/marketing`
- [ ] `/commerly-ai`
- [ ] `/certificado/embaixador`

> **Atenção ao detalhe:** o bug aqui geralmente é **a tela aparecer por meio
> segundo antes de redirecionar**. Se você conseguir ver qualquer dado real
> piscando na tela antes do redirecionamento, **reporte com vídeo/print**.

### 5.2 Logar com o papel errado

- [ ] Logado como **cliente**, tentar abrir `/dashboard` (painel do comerciante).
      Não pode mostrar o painel de nenhuma loja.
- [ ] Logado como **entregador**, tentar abrir `/produtos` e `/financeiro`.
- [ ] Logado como **fornecedor**, tentar abrir `/cliente/pedidos`.
- [ ] Logado como **comerciante**, tentar abrir `/entregador-delivery/dashboard`.

### 5.3 Trocar o ID na URL (ver dado dos outros)

Este é o teste mais valioso da lista. A ideia: pegar um endereço que tem um
código (ID) e trocar esse código pelo de outra pessoa.

- [ ] Logado como **comerciante**, entre em qualquer tela que mostre um ID na URL
      e **troque o ID** por outro. Anote o que apareceu.
- [ ] Abra `/loja/{id}` da loja de teste. Agora **troque o id** por outro id de
      loja (pegue um em `/cliente/buscar`, clicando em outra loja). Ver a loja
      pública de outro **não é bug** — mas se aparecer **telefone privado, CPF,
      CNPJ, faturamento, lista de clientes ou dados financeiros**, é Crítico.
- [ ] `/cardapio/{id}` de outra loja: deve mostrar só produtos, preços e contato
      público. Qualquer dado financeiro ali é bug.
- [ ] Logado como **cliente**, tente abrir a página de um pedido/festa que não é
      seu, trocando o código na URL (ex: `/cliente/festa/{id}` com um id
      inventado ou de outra festa). Você **não** pode ver o carrinho e o endereço
      dos outros.
- [ ] Entre numa festa com o código correto, saia, e tente voltar pela URL direta
      depois. Reporte se conseguir ver conteúdo de festa da qual não participa.
- [ ] `/fornecedor/{id}`: trocar o id. É uma página pública de catálogo — mas
      **e-mail, CNPJ e telefone privados do fornecedor** ali seriam bug.

### 5.4 Criar conta e usar sem pagar (paywall)

- [ ] Criar uma **conta nova de comerciante** pelo cadastro normal e completar o
      onboarding. Anote se conseguiu criar sem pagar nada (isso é esperado — há
      um período de teste).
- [ ] Com essa conta nova, conferir se consegue entrar no painel. Anote o que a
      tela diz sobre o período de teste / prazo.
- [ ] Se o app disser em algum lugar que o plano está **vencido/inativo** e ainda
      assim deixar você usar `/produtos`, `/pedidos`, `/financeiro`, `/clientes`,
      `/promocoes`, `/combos` ou `/ads` normalmente — **isso é bug (Alto)**.
      Teste cada uma dessas telas digitando o endereço direto na barra, não só
      pelo menu.
- [ ] Com o plano vencido, conferir que o app te leva para `/planos` com uma
      mensagem clara — e **não** para uma tela em branco ou um erro cru.

### 5.5 Reset de senha

- [ ] Abrir `/recuperar-senha`, digitar o e-mail de uma conta de teste e enviar.
- [ ] Conferir que a tela responde alguma coisa (sucesso ou erro), **sem travar**.
- [ ] Conferir que o e-mail chega (veja também o spam). Anote quanto tempo levou.
- [ ] Clicar no link do e-mail e conferir que abre a tela de nova senha
      (`/nova-senha`).
- [ ] Tentar salvar uma senha **fraca** (ex: `123456`) e conferir que o app
      recusa com uma mensagem que dá para entender.
- [ ] Salvar uma senha **forte e inventada** e conferir que consegue logar com
      ela. **Anote a senha nova e avise o Matheus** (a conta é compartilhada).
- [ ] Voltar ao e-mail e **clicar no mesmo link de novo**. Um link já usado
      **não** pode permitir trocar a senha uma segunda vez.
- [ ] Pedir reset para um e-mail **inventado, que não existe no sistema**, e
      conferir que a resposta **não revela** se a conta existe ou não.
- [ ] Tentar abrir `/nova-senha` direto, sem vir de um link de e-mail. Não pode
      deixar trocar a senha.

---

## 6. FLUXO DE DELIVERY PONTA A PONTA

> **Precisa de 2 ou 3 pessoas** (ou 3 navegadores/aparelhos diferentes), porque
> cada papel usa uma conta e o navegador só guarda um login por vez.
>
> **Precisa ser em Goiânia**, com endereço de Goiânia.

**Quem faz o quê (importante, não é óbvio):**
- O **comerciante** é quem avança **todos** os status: `recebido → preparando →
  saiu → entregue`. **Não existe status "pronto"**.
- Ao marcar **"saiu"**, o sistema gera um **código de 4 dígitos** que aparece
  para o cliente.
- O **entregador** só aceita a corrida e, no fim, **confirma a entrega digitando
  esse código**. Antes do "saiu", o card dele mostra "Aguardando a loja liberar
  para entrega" — **isso é o comportamento certo**.

### Preparação

- [ ] **Entregador:** abrir `/entregador-delivery/dashboard` no **celular**,
      **permitir a localização** quando o navegador pedir, e colocar o botão em
      **Online**.
- [ ] **Comerciante:** conferir em `/configuracoes` que a loja tem endereço com o
      **pino certo no mapa** (sem coordenada, a busca de entregador falha).
- [ ] **Comerciante:** conferir que a loja tem pelo menos 1 produto com estoque.

### O pedido

- [ ] **Cliente:** abrir `/cliente/buscar`, achar a loja e abrir.
- [ ] **Cliente:** montar o pedido, preencher o endereço de entrega e conferir
      que aparece um **mini mapa com o pino** para ajustar.
- [ ] **Cliente:** conferir que a **taxa de entrega é calculada automaticamente
      pela distância** (até 2 km R$ 5 · 2–5 km R$ 8 · 5–10 km R$ 12 · acima de
      10 km R$ 15). Se a taxa for R$ 5 para um endereço a 8 km, é bug.
- [ ] **Cliente:** testar um endereço **muito longe** e conferir que o app avisa
      "fora da área de entrega" **em vez** de aceitar o pedido.
- [ ] **Cliente:** escolher **"Pagar na entrega"**, confirmar e conferir que o
      pedido aparece em `/cliente/pedidos` com status **"recebido"**.
- [ ] **Comerciante:** conferir que o pedido chegou em `/pedidos` — e se tocou o
      **som/notificação** de pedido novo.

### O despacho

- [ ] **Comerciante:** avançar o pedido para **"preparando"**.
- [ ] **Cliente:** conferir que o status mudou na tela dele **sozinho**, sem
      recarregar a página (dê até 30 segundos).
- [ ] **Comerciante:** clicar em **"Buscar entregador"** (ou equivalente) e
      **cronometrar**: a oferta chega no celular do entregador?
- [ ] **Entregador:** conferir que aparece o **modal da oferta** com o valor da
      corrida e que ele tem **cerca de 30 segundos** para aceitar. Deixe expirar
      uma vez de propósito e confira que a tela volta ao normal sem travar.
- [ ] **Entregador:** aceitar a corrida na segunda tentativa.
- [ ] **Comerciante:** conferir que o pedido agora mostra o entregador atribuído.

### A entrega

- [ ] **Comerciante:** marcar **"saiu"**.
- [ ] **Cliente:** conferir que aparece o **código de 4 dígitos** bem visível na
      tela do pedido.
- [ ] **Cliente:** conferir que aparece o **mapa ao vivo** com a posição do
      entregador, e que o pino **se move** quando o entregador anda (peça para
      ele caminhar uns metros com o celular na mão).
- [ ] **Entregador:** tentar confirmar a entrega com um **código errado** (ex:
      `0000`) e conferir que o app **recusa** com mensagem clara.
- [ ] **Entregador:** confirmar com o código certo e conferir que o pedido vai
      para **"entregue"** nas três telas (cliente, comerciante, entregador).
- [ ] **Cliente:** conferir em `/cliente/clube` que **ganhou os pontos** do pedido
      (1 por R$ 1 de produtos, sem contar a taxa).

### Avaliação e cancelamento

- [ ] **Cliente:** avaliar a **loja** em `/cliente/pedidos`, com estrelas e
      **anexando uma foto**. Conferir que a foto sobe e aparece.
- [ ] **Cliente:** avaliar o **entregador**. Conferir que a nota aparece no perfil
      dele (`/entregador-delivery/dashboard`, seção de avaliações).
- [ ] **Cliente:** tentar avaliar o **mesmo pedido duas vezes** e ver o que
      acontece (deve editar a avaliação, não criar duas).
- [ ] Fazer um **novo pedido** e, **antes** de o comerciante marcar "preparando",
      conferir que o botão **"Cancelar pedido"** aparece para o cliente e
      funciona.
- [ ] Fazer outro pedido, deixar o comerciante marcar **"preparando"**, e conferir
      que o botão de cancelar **some** (o cliente não pode mais cancelar sozinho).
- [ ] **Comerciante:** conferir que o pedido cancelado sai da lista de ativos.

### Pagamento online (só se o Matheus liberar)

- [ ] **Cliente:** repetir o pedido escolhendo **"Pagar online agora"** e conferir
      que abre o checkout da Stripe com o **valor total certo (produtos + taxa −
      desconto de pontos)**.
- [ ] Abandonar o checkout sem pagar e conferir que o pedido **não** foi criado.
- [ ] Pagar e conferir que o pedido aparece em `/cliente/pedidos` **depois** do
      pagamento (pode levar alguns segundos).

---

## 7. MODO FESTA E MULTI-ENTREGA

### 7.1 Modo Festa

Modo Festa = várias pessoas pedem de **até 3 lojas próximas** para **um único
endereço**, e um entregador leva tudo numa viagem só. **Precisa de 2 clientes**
(2 contas / 2 aparelhos). **No Modo Festa o pagamento é sempre na entrega** —
não deve aparecer opção de pagar online.

- [ ] **Cliente A:** abrir `/cliente/festa` e clicar em **"Criar festa"**.
- [ ] Conferir que dá para escolher as lojas e o endereço único de entrega.
- [ ] Tentar adicionar uma **4ª loja** e conferir que o app impede (limite: 3).
- [ ] Tentar adicionar uma loja **muito distante** das outras e conferir que o app
      impede (as lojas precisam estar a até 2 km entre si).
- [ ] Conferir que a festa gera um **código de convite** (formato tipo `K7QP2M`).
- [ ] **Cliente B:** abrir `/cliente/festa`, digitar o código no campo "entrar" e
      conferir que entra na mesma sala.
- [ ] Testar um código **errado/inexistente** e conferir que dá erro claro, sem
      travar.
- [ ] **Cliente B:** adicionar itens ao carrinho e conferir que o **Cliente A vê o
      Cliente B aparecer** na lista de participantes (atualiza sozinho em até ~5
      segundos, sem recarregar).
- [ ] Conferir que a **taxa de entrega é rateada** entre quem tem itens — cada um
      paga uma fração, não a taxa cheia. Anote os valores exatos de cada
      participante.
- [ ] Conferir que a soma dos itens de cada pessoa **bate** com o que ela colocou
      no carrinho (ninguém pode pagar o item do outro).
- [ ] **Cliente B (não criador):** tentar **fechar** a festa. Só o **criador**
      pode fechar.
- [ ] **Cliente A (criador):** fechar a festa e conferir que os pedidos aparecem
      em `/pedidos` de **cada loja envolvida**.
- [ ] **Entregador:** conferir que chega **uma única oferta** cobrindo a festa
      inteira (não uma por loja), com o valor total.
- [ ] **Entregador:** aceitar e conferir que **todos** os pedidos da festa
      aparecem no painel dele de uma vez.
- [ ] Conferir que os pedidos da festa não aparecem com opção de pagamento online
      para o cliente.
- [ ] Testar entrar numa festa **já fechada** e conferir que o app avisa em vez de
      quebrar.

### 7.2 Multi-entrega (2 pedidos na mesma viagem)

- [ ] **Entregador:** com **uma** entrega em andamento, conferir que outro pedido
      da lista mostra o botão **"Aceitar junto — mesma rota"**.
- [ ] Clicar e conferir que os 2 pedidos ficam agrupados (aparecem destacados e
      com **ordem de coleta e ordem de entrega** numeradas).
- [ ] Conferir que a ordem faz sentido geográfico (coletar nas duas lojas, depois
      entregar) — se mandar entregar antes de coletar, é bug.
- [ ] Tentar aceitar um **terceiro** pedido junto e conferir que o app **recusa**
      (o limite é 2 por viagem).
- [ ] Concluir as duas entregas, cada uma com seu **próprio código de 4 dígitos**,
      e conferir que confirmar a primeira **não** fecha a segunda por engano.
- [ ] Conferir que o ganho do entregador soma as **duas** corridas.

---

## 8. PAINEL DO COMERCIANTE

Logado como **comerciante**.

### 8.1 Produtos com foto

- [ ] `/produtos` → cadastrar um produto novo chamado **"TESTE - Pizza"**, com
      preço, categoria, estoque e **uma foto**.
- [ ] Conferir que a foto aparece na lista depois de salvar.
- [ ] Tentar subir um arquivo que **não é imagem** (ex: um PDF ou `.txt`) e
      conferir que o app recusa com mensagem clara.
- [ ] Tentar subir uma imagem **maior que 5 MB** e conferir que o app avisa
      ("máximo 5 MB") em vez de travar.
- [ ] Subir uma foto e conferir se o app oferece uma versão **realçada** da
      imagem para escolher — e que a escolhida é a que fica salva.
- [ ] **Importante:** se a foto falhar ao subir, o app **deve perguntar** se você
      quer salvar sem imagem. Se ele disser "Produto cadastrado!" e a foto sumir
      calada, **é bug**.
- [ ] Editar o produto (mudar nome e preço) e conferir que salvou.
- [ ] Salvar um produto sem categoria / sem nome e conferir que o app valida.
- [ ] Colocar preço **negativo** ou com vírgula/ponto trocados (`10.50` vs
      `10,50`) e ver se o valor salvo está certo.
- [ ] Zerar o estoque e conferir que aparece o aviso de **"Estoque baixo"** ou que
      o produto some do cardápio público.
- [ ] Remover o produto de teste e conferir que ele some da lista **e** da loja
      pública (`/loja/{id}`).

### 8.2 Promoções

- [ ] `/promocoes` → conferir a **regra automática**: quantos "dias sem vender"
      disparam a promoção e qual o **desconto (%)**.
- [ ] Mudar os valores, salvar, recarregar a página e conferir que **persistiram**.
- [ ] Colocar desconto de **0%** e de **100%** e ver se o app aceita ou valida.
- [ ] Colocar "dias sem vender" negativo e ver se valida.
- [ ] Conferir que uma promoção ativa aparece **com o preço promocional** na loja
      pública e no cardápio digital — e que o preço riscado/original também
      aparece.

### 8.3 Financeiro

- [ ] `/financeiro` → conferir o bloco **"Como chegamos no lucro real deste mês"**
      e refazer a conta na calculadora: Receita − despesas = lucro mostrado.
      Qualquer divergência de centavos é bug (Alto).
- [ ] Registrar um gasto em `/gastos` e conferir que ele **aparece no financeiro**
      e **diminui o lucro** pelo valor exato.
- [ ] Registrar uma venda em `/vendas` e conferir que a receita sobe pelo valor
      exato.
- [ ] Na seção **Imposto**, escolher "Simples Nacional", preencher a atividade e
      conferir se o **DAS mensal** calculado é um número plausível (não `NaN`,
      não `R$ 0,00` com faturamento cheio, não negativo).
- [ ] Trocar de mês/período (se houver seletor) e conferir que os números mudam.
- [ ] Conferir que um mês **sem movimento** mostra zeros e não erro.

### 8.4 CRM (`/clientes`)

- [ ] Abrir `/clientes` e conferir que os clientes que já compraram aparecem.
- [ ] Para um cliente, conferir os 4 números: **Total gasto**, **Pedidos**,
      **Ticket médio** e **Última compra**.
- [ ] **Refazer a conta:** ticket médio deve ser Total gasto ÷ Pedidos. Se não
      bater, reporte com os 3 números.
- [ ] Fazer um pedido novo com a conta de **cliente** e conferir que o CRM
      atualiza (total, contagem e data da última compra).
- [ ] Usar o campo de busca/filtro e conferir que filtra de verdade — e que
      buscar por algo inexistente mostra "Nenhum cliente encontrado" em vez de
      lista vazia sem explicação.
- [ ] Testar o botão **"Campanha de retorno"** e anotar exatamente o que acontece
      (mensagem, envio, erro).

### 8.5 Cardápio digital

- [ ] `/configuracoes` → seção **"QR code do cardápio"**. Conferir que o QR
      aparece (não fica em "Gerando…" para sempre).
- [ ] Baixar o QR em **PNG**, em **SVG** e em **PDF**, e **abrir os 3 arquivos**
      no PC. Um arquivo de 0 KB ou que não abre é bug.
- [ ] Copiar o link do cardápio e abrir em **janela anônima** (sem login):
      `/cardapio/{id}` deve abrir para qualquer pessoa.
- [ ] Conferir que os produtos aparecem **agrupados por categoria**, com foto (ou
      emoji), nome, descrição e preço.
- [ ] Conferir que um produto **sem estoque não aparece** no cardápio.
- [ ] Conferir que o botão de **"Fazer pedido"** leva ao fluxo do cliente.
- [ ] Se a loja tiver WhatsApp cadastrado, testar o botão **"Pedir pelo
      WhatsApp"**: deve abrir o WhatsApp com a mensagem já escrita.
- [ ] Em `/configuracoes` → **"Minha loja pública"**: clicar em **Copiar** e colar
      em outro lugar para conferir que copiou o link certo; clicar em **Abrir** e
      conferir que a loja abre.

---

## 9. FEATURES DE IA

> A IA **erra às vezes de propósito** — errar o nome de um prato **não é bug**.
> O que é bug: travar, não responder, dar erro cru, publicar coisa errada sem
> você confirmar, ou cobrar/alterar dados sozinha.
> Em todos os itens, **anote quanto tempo demorou** para responder.

### 9.1 Commerly Vision (cliente fotografa um prato)

Logado como **cliente**, em `/cliente/buscar`:

- [ ] Achar o bloco do Vision ("Tire uma foto ou escolha da galeria") e enviar a
      **foto de um prato de comida**.
- [ ] Conferir que aparece "Analisando a foto..." e depois o que ele
      **"Identificou"**, com palavras-chave de busca.
- [ ] Conferir que ele mostra **lojas próximas** que têm algo parecido.
- [ ] Enviar uma foto que **não é comida** (uma parede, um sapato) e conferir que
      o app responde de forma educada em vez de inventar um prato ou quebrar.
- [ ] Enviar uma foto muito escura / desfocada e conferir que não trava.
- [ ] Repetir a análise **várias vezes seguidas** (10+) e conferir que, se houver
      limite, o app avisa com mensagem clara (e não com um erro cru).

### 9.2 Clone de cardápio (foto do cardápio de papel)

Logado como **comerciante**, em `/configuracoes` → bloco **"Montar cardápio com
IA"**:

- [ ] Fotografar (ou enviar a foto de) um **cardápio impresso** e conferir que a
      IA devolve uma **lista de itens para revisar** — nome, descrição, categoria
      e preço, todos **editáveis**.
- [ ] **Confirme que nada foi salvo ainda**: abra `/produtos` em outra aba antes
      de publicar. Se os itens já estiverem lá **antes de você clicar em
      publicar**, isso é bug (Alto).
- [ ] **Corrigir um preço** no rascunho, publicar, e conferir em `/produtos` que
      foi salvo o preço **corrigido**, não o que a IA leu.
- [ ] Enviar uma foto que não é cardápio e conferir a mensagem de erro.
- [ ] Repetir muitas vezes seguidas: existe um limite de ~20 digitalizações por
      hora. Conferir que a mensagem ao bater o limite é compreensível
      ("Muitas digitalizações seguidas...") e **não** um erro técnico.

### 9.3 IA cria cardápio (por texto)

Mesmo bloco, aba/campo de texto:

- [ ] Digitar algo como **"tenho hambúrguer, batata frita e refrigerante"** e
      conferir que a IA monta itens com nome, descrição, categoria e preço
      sugerido.
- [ ] Conferir que dá para **editar tudo antes de publicar**.
- [ ] Publicar e conferir que os itens aparecem em `/produtos` **e** no cardápio
      público.
- [ ] Mandar um texto sem sentido (`asdasdasd`) e conferir que não quebra.
- [ ] Mandar um texto **muito longo** (cole 3 parágrafos) e conferir que responde
      ou avisa, sem travar a tela.
- [ ] Publicar **duas vezes seguidas** o mesmo rascunho e conferir se cria
      produtos duplicados (anote o que aconteceu).

### 9.4 IA Nutricionista

Logado como **comerciante**, em `/configuracoes` → bloco **"Delivery avançado"**
→ **"Classificação nutricional"**:

- [ ] Clicar em **"Classificar meus produtos"** e conferir que mostra progresso e
      termina (não fica "Classificando..." para sempre).
- [ ] Conferir que os produtos ganharam **tags**: vegetariano, sem glúten, menos
      de 500 cal, low carb.
- [ ] Conferir que aparece o **aviso** de que a classificação é estimada por IA e
      não substitui informação nutricional oficial. Se esse aviso sumir, reporte.
- [ ] Clicar de novo e conferir que ele **não reprocessa tudo do zero** sem
      necessidade (deve pular o que já está classificado e não mudou).
- [ ] **Editar o texto de um produto** (mudar nome/descrição), classificar de novo
      e conferir que aquele produto **foi reclassificado**.
- [ ] Agora como **cliente**, em `/cliente/buscar`: usar os **filtros
      nutricionais** e conferir que só aparecem lojas com produto compatível.
- [ ] Marcar **duas tags ao mesmo tempo** e conferir que o filtro fica mais
      restrito (e não mais amplo).
- [ ] Desmarcar todas e conferir que a lista completa volta.

### 9.5 Copilot

Logado como **comerciante**, em `/dashboard`:

- [ ] Achar o card **"Copilot da semana"** e conferir que traz sugestões com
      título, texto e um **botão de ação**.
- [ ] Clicar em cada botão de ação e conferir que ele leva a uma **tela que
      existe** de verdade (produtos, vendas, gastos, clientes, promoções,
      financeiro, pedidos, etc.). Um botão que leva a página de erro é bug (Alto).
- [ ] Conferir que os **números citados na sugestão batem** com os do painel (se
      ele disser "você vendeu R$ X", confira em `/vendas`).
- [ ] Com uma conta **sem movimento nenhum**, conferir que ele mostra "Registre
      algumas vendas para o Copilot ter o que analisar." em vez de erro ou card
      vazio.
- [ ] Recarregar o dashboard várias vezes e conferir que o Copilot não deixa a
      página lenta nem trava o carregamento do resto.

---

## 10. CELULAR

> Faça esta seção **no celular de verdade**, não no modo responsivo do PC.
> Se possível, teste em **um Android e um iPhone**. Anote sempre o modelo.

### 10.1 PWA (instalar o app na tela inicial)

- [ ] Abrir `https://commerly.app` no navegador do celular.
- [ ] **Android/Chrome:** menu (⋮) → "Instalar app" / "Adicionar à tela inicial".
      **iPhone/Safari:** botão de compartilhar → "Adicionar à Tela de Início".
- [ ] Conferir que o **ícone do Commerly** aparece na tela inicial (ícone certo,
      não um genérico/quebrado).
- [ ] Conferir que o **nome embaixo do ícone** é "Commerly".
- [ ] Abrir pelo ícone e conferir que abre **sem a barra de endereço** do
      navegador (modo app).
- [ ] Conferir que abre em **modo retrato** e que a cor da barra de status
      combina com o app (fundo escuro).
- [ ] Fazer login **dentro do app instalado** e conferir que a sessão fica salva
      quando você fecha e reabre.
- [ ] Navegar por 4-5 telas dentro do app instalado e conferir que o **botão
      voltar do celular** funciona (não fecha o app do nada).
- [ ] **Colocar o celular em modo avião** e abrir o app: conferir que mostra algo
      compreensível, e não uma tela branca sem explicação.

### 10.2 Push (notificações)

- [ ] Logar no app instalado e conferir que o app **pede permissão** para enviar
      notificações. Aceitar.
- [ ] Como **comerciante** (celular) + **cliente** (outro aparelho/PC): fazer um
      pedido e conferir que a **notificação chega no celular do comerciante**,
      inclusive com o app **fechado**.
- [ ] Conferir o texto da notificação: diz o que aconteceu de forma clara?
- [ ] **Tocar na notificação** e conferir que ela abre a **tela certa** (o pedido,
      não só a home).
- [ ] Como **entregador**: conferir que a oferta de corrida chega por notificação
      (e não só quando a tela está aberta).
- [ ] Como **cliente**: conferir que a mudança de status do pedido gera
      notificação.
- [ ] **Negar** a permissão de notificação em uma conta e conferir que o app
      continua funcionando normalmente (só sem push).
- [ ] Conferir que **não chegam notificações duplicadas** para o mesmo evento.

### 10.3 QR do cardápio (escanear de verdade)

- [ ] Gerar o QR em `/configuracoes` (no PC) e **imprimir ou deixar na tela do PC**.
- [ ] **Escanear com a câmera do celular** (app de câmera nativo, não leitor
      especial) e conferir que ele reconhece e oferece abrir o link.
- [ ] Conferir que o link abre o **cardápio da loja certa**.
- [ ] Escanear **sem estar logado** e conferir que o cardápio abre mesmo assim.
- [ ] Imprimir a versão em **PDF** e escanear do papel: o QR do PDF precisa
      funcionar igual ao da tela.
- [ ] Escanear de longe (~1 metro) e num ambiente com pouca luz. Anote se falhar.
- [ ] Conferir que o cardápio **cabe na tela do celular** (sem precisar arrastar
      para os lados).

### 10.4 Câmera do Vision

- [ ] Como cliente, no **celular**, abrir `/cliente/buscar` e tocar no bloco do
      Vision.
- [ ] Conferir que ele oferece **abrir a câmera** (e que abre a câmera **traseira**,
      não a selfie).
- [ ] Tirar a foto na hora e conferir que a análise acontece.
- [ ] Voltar e testar a opção de **escolher da galeria**.
- [ ] **Negar** a permissão de câmera e conferir que o app avisa em vez de travar.
- [ ] Fotografar com o celular **na horizontal** e conferir que a imagem não vai
      girada/cortada.
- [ ] Testar com internet ruim (4G fraco) e conferir que ele não fica carregando
      para sempre sem mensagem.

---

## 11. VISUAL (modo claro e escuro)

O app tem um **controle de aparência** no cabeçalho de **todas as 4 áreas** — um
botão de sol/lua que abre um painel com: **claro/escuro**, **cor de destaque** e
**brilho**.

- [ ] Achar esse botão logado como **comerciante**, **cliente**, **entregador** e
      **fornecedor**. Se faltar em alguma área, reporte.
- [ ] Trocar para **modo claro** e conferir que a preferência **fica salva** ao
      recarregar a página e ao navegar para outra tela.
- [ ] Testar as **cores de destaque** e o **ajuste de brilho**.
- [ ] No celular, conferir que o painel de aparência **abre inteiro na tela**
      (não fica cortado embaixo nem inclicável).

### O teste que mais rende: passar tela por tela nos dois modos

Faça **duas passadas** por esta lista — uma em **modo escuro**, outra em **modo
claro** — procurando por: **texto que some no fundo** (cinza claro em fundo
branco, branco em fundo branco), **caixa branca em página escura** (ou o
contrário), botão que não dá para ler, ícone invisível.

Comerciante:
- [ ] `/dashboard`
- [ ] `/produtos` (inclusive a janela de novo produto)
- [ ] `/vendas`
- [ ] `/pedidos`
- [ ] `/clientes`
- [ ] `/financeiro`
- [ ] `/gastos`
- [ ] `/fiado`
- [ ] `/promocoes`
- [ ] `/combos`
- [ ] `/configuracoes` (é uma página longa — role até o fim)
- [ ] `/planos`
- [ ] `/academy`
- [ ] `/marketing`
- [ ] `/embaixador`

Cliente:
- [ ] `/cliente/dashboard`
- [ ] `/cliente/buscar` (lista **e** mapa)
- [ ] `/cliente/loja/{id}` + janela "Fazer pedido"
- [ ] `/cliente/pedidos`
- [ ] `/cliente/clube`
- [ ] `/cliente/festa`
- [ ] `/cliente/feed`
- [ ] `/cliente/favoritas`
- [ ] `/cliente/notificacoes`

Entregador:
- [ ] `/entregador-delivery/dashboard` (incluindo o **modal de oferta de corrida**)
- [ ] `/entregador-delivery/notificacoes`

Fornecedor:
- [ ] `/fornecedor/dashboard`
- [ ] `/fornecedor/produtos`
- [ ] `/fornecedor/avaliacoes`
- [ ] `/fornecedor/configuracoes`

Públicas (sem login):
- [ ] Home `/`
- [ ] `/loja/{id}`
- [ ] `/cardapio/{id}`
- [ ] `/planos`
- [ ] `/sobre`, `/termos`, `/privacidade`, `/suporte`
- [ ] `/para-clientes`, `/para-comerciantes`, `/para-entregadores`
- [ ] `/login`, `/cliente/login`, `/entregador-delivery/login`, `/fornecedor/login`
- [ ] `/recuperar-senha`

### Layout quebrado — larguras de tela

- [ ] Testar tudo em **celular** (tela pequena) e conferir que **nada obriga a
      rolar para os lados**. Rolagem horizontal é sempre bug.
- [ ] Testar em **tablet / janela pela metade** no PC (arraste a janela para
      metade da tela).
- [ ] Testar em **monitor grande** (tela cheia) e conferir que o conteúdo não fica
      esticado de forma estranha.
- [ ] Conferir **tabelas e listas longas** (CRM, financeiro, pedidos) no celular:
      elas devem ser roláveis por dentro, sem estourar a página.
- [ ] Conferir textos longos: nome de loja/produto muito comprido não pode vazar
      do card nem sumir sem "...".
- [ ] Conferir que os **botões dão para acertar com o dedo** no celular (nada
      minúsculo ou colado na borda).
- [ ] Aumentar o **zoom do navegador para 150%** e conferir que nada quebra.

### Textos e conteúdo

- [ ] Anotar qualquer **erro de português**, acento faltando ou frase truncada.
- [ ] Anotar qualquer **mensagem de erro técnica** aparecendo para o usuário
      (ex: `undefined`, `NaN`, `null`, `Error: ...`, `[object Object]`).
- [ ] Anotar qualquer **preço mal formatado** (`R$ 10.5`, `R$ 1050`, `R$ NaN`).
- [ ] Anotar qualquer **data mal formatada** ou "Invalid Date".
- [ ] Anotar telas que ficam em **"Carregando..." por mais de 30 segundos**.
- [ ] Anotar imagens quebradas (ícone de imagem faltando).

---

## 12. Ao final

- [ ] Enviar a lista completa de bugs, **ordenada por gravidade** (Críticos primeiro).
- [ ] Enviar a lista de itens deste checklist que você **não conseguiu testar** e
      o motivo (faltou gente, faltou permissão, estava fora de Goiânia, etc.).
- [ ] Enviar as **senhas novas** que você tiver criado em qualquer conta de teste.
- [ ] Enviar os nomes dos dados de teste que criou ("TESTE - ...") para limpeza.
