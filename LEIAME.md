# Sistema de Atendimentos — Field (Firebase + GitHub Pages)

Versão web da planilha de atendimentos, sem servidor próprio:

- **GitHub Pages** hospeda o site (grátis).
- **Firebase Authentication** cuida do login por e-mail e senha: confirmação do e-mail, "esqueci minha senha" e troca de senha.
- **Cloud Firestore** guarda os atendimentos e os usuários.
- Quem protege os dados são as **regras do Firestore** (`firestore.rules`).

Já vem configurado para o domínio **@it2b.com.br**, com **emerson.araujo@it2b.com.br** como líder.

## Como funciona o acesso
1. A pessoa abre o link e clica em **Primeiro acesso? Criar conta**. Só aceita e-mail `@it2b.com.br`, e a senha é só deste sistema, não é a da Microsoft.
2. O Firebase manda um link de confirmação para o Outlook da pessoa, que clica nele.
3. A conta fica **Aguardando liberação** até o líder liberar em **Usuários**.
4. O líder (e-mail em `ADMINS_INICIAIS`) já entra liberado e como administrador.

| Perfil | Pode |
|---|---|
| Técnico | Registrar, editar e excluir **os próprios** atendimentos. Ver os da equipe (somente leitura), a agenda e o painel. |
| Líder / admin | Tudo acima, editar qualquer atendimento, liberar/bloquear pessoas, mudar perfil, importar a planilha antiga. |

---

## Passo a passo para publicar

### 1. Criar o projeto e o banco no Firebase
1. Acesse https://console.firebase.google.com e clique em **Adicionar projeto**, por exemplo "atendimentos-field". Pode desligar o Analytics.
2. **Firestore Database → Criar banco de dados**. Escolha o local `southamerica-east1 (São Paulo)` e o **modo de produção**.

### 2. Ativar o login por e-mail e senha
1. **Authentication → Vamos começar → Método de login → E-mail/senha → Ativar** (deixe "link de e-mail sem senha" desligado) → **Salvar**.
2. Em **Authentication → Modelos**, troque o idioma para **Português (Brasil)**.

### 3. Registrar o app web e copiar a configuração
**⚙ Configurações do projeto → Seus apps → ícone `</>` (Web)**. Registre o app sem marcar o Hosting, copie o bloco `firebaseConfig` e cole no **`config.js`**, no lugar do exemplo.
Se o líder for outra pessoa, troque também o `ADMINS_INICIAIS`.

### 4. Publicar as regras de segurança
**Firestore Database → Regras**: apague o conteúdo, cole todo o `firestore.rules` e clique em **Publicar**.
O arquivo já vem com `@it2b.com.br` e o e-mail do líder. Se mudar o líder no `config.js`, mude também na função `adminInicial()` das regras.

### 5. Subir o site no GitHub
1. No github.com, clique em **+ → New repository**, dê o nome `atendimentos` e marque **Public**. É exigência do Pages no plano grátis. No repositório fica só o código, nenhum dado.
2. Clique em **uploading an existing file** e arraste **todos os arquivos de dentro da pasta**, inclusive o `.nojekyll`, que é um arquivo oculto. Depois clique em **Commit changes**.

### 6. Ligar o GitHub Pages
**Settings → Pages → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
Em 1 ou 2 minutos aparece o endereço: `https://seu-usuario.github.io/atendimentos/`.

### 7. Autorizar o endereço no Firebase
**Authentication → Configurações → Domínios autorizados → Adicionar domínio** → `seu-usuario.github.io`. Coloque sem `https://` e sem `/atendimentos`.

### 8. Primeiro acesso
1. Abra o site, clique em **Primeiro acesso? Criar conta** com o e-mail do líder e confirme pelo link que chega no Outlook. **Veja também o lixo eletrônico.**
2. Na aba **Usuários**, use **Copiar convite** e mande o convite para a equipe. Libere cada pessoa quando ela aparecer como "Aguardando liberação".
3. (Opcional) **Importar planilha antiga**: cada aba vai para o técnico com o mesmo nome. Importe depois que todos tiverem conta. Importar de novo não duplica.

---

## Problemas comuns
| Mensagem / sintoma | O que fazer |
|---|---|
| E-mail de confirmação não chega | Veja o lixo eletrônico do Outlook. O remetente é `noreply@<seu-projeto>.firebaseapp.com`. Se o filtro da empresa bloquear, peça para liberar esse remetente. |
| "Este endereço do site não está autorizado…" | Faltou o passo 7. |
| "O login por e-mail/senha não está ativado…" | Faltou o passo 2. |
| "Sem permissão" logo após confirmar o e-mail | Saia e entre de novo. Se continuar, confira se as regras foram publicadas (passo 4). |
| Mudei um arquivo no GitHub e nada mudou | Espere 1 a 2 minutos e recarregue a página com Ctrl+F5. |

## Teste das regras (recomendado)
No Firebase: **Firestore → Regras → Playground de regras**. Faça uma leitura em `/atendimentos/teste` **sem autenticação**. O resultado tem que ser **negado**.

## Custos
O Firebase no **plano gratuito (Spark)** atende uma equipe desse tamanho com folga (limites atuais: https://firebase.google.com/pricing). O GitHub Pages é grátis.

## Arquivos
```
index.html          página
app.js              telas e regras de negócio
firebase.js         conexão com o Firebase (login + banco)
config.js           ← você cola o firebaseConfig (domínio e líder já preenchidos)
firestore.rules     ← você publica no console
style.css           visual
.nojekyll           faz o GitHub Pages servir os arquivos como estão
firebase.json, firestore.indexes.json   só para quem usar a Firebase CLI (opcional)
```

### Dados no Firestore
- `usuarios/{uid}`: nome, email, perfil (`admin`/`tecnico`), ativo, bloqueado, criado_em
- `atendimentos/{id}`: uid, tecnico, smax, comarca, inicio, termino, ticket_softplan, status, encaminhado_para, home_local, agendamento, usuario_atendido, obs, data_ref, mes, criado_em, atualizado_em
