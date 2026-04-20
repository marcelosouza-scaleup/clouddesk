# CloudDesk Widget — Guia de Instalação

## Como funciona

O widget verifica automaticamente se o usuário logado tem **exclusivamente o plano Cloud Starter** via Airtable. Se sim, aparece no canto inferior direito. Se não (Advanced, Ultra, Max), fica invisível e o Intercom continua normalmente.

---

## O que o dev precisa fazer no cloudfy.space

### 1. Expor o objeto do usuário logado

Inserir no `<head>` ou antes do `</body>`, **depois do login** e **antes do script do widget**:

```html
<script>
  window.CloudfyUser = {
    id:    "{{ user.supabase_id }}",   // UUID do Supabase Auth
    email: "{{ user.email }}",         // Email do usuário
    name:  "{{ user.name }}"           // Nome completo
  };
</script>
```

### 2. Incluir o script do widget

```html
<!-- Antes do </body> -->
<script src="https://clouddesk.cloudfy.live/widget.js" defer></script>
```

---

## O que acontece automaticamente

1. Script carrega → lê `window.CloudfyUser`
2. Se não há usuário logado → para aqui (sem erros, sem efeitos)
3. Chama Edge Function `check-widget-eligibility` com o email
4. Edge Function consulta Airtable: todos os registros desse email
   - Nenhum registro → `eligible: false`
   - Todos com `Products = "Cloud Starter"` → `eligible: true`
   - Qualquer outro plano → `eligible: false`
5. Se `eligible: false` → para aqui (Intercom continua)
6. Se `eligible: true` → monta o widget React no canto inferior direito

---

## Variáveis de template

Substituir `{{ user.* }}` pelos valores reais do sistema de templates do cloudfy.space.

| Placeholder | Valor |
|---|---|
| `{{ user.supabase_id }}` | UUID do usuário no Supabase Auth |
| `{{ user.email }}` | Email do usuário |
| `{{ user.name }}` | Nome completo |

---

## Importante

- **NÃO incluir** em páginas públicas (landing page, `/login`, `/signup`)
- **Incluir APENAS** em páginas autenticadas (dashboard, infraestrutura, configurações)
- O script é seguro para incluir sempre — verifica o plano internamente antes de renderizar qualquer coisa
- Não polui o namespace global além de `window.CloudDeskWidget` (usado apenas para `destroy()` de emergência)

---

## Comandos para deploy

```bash
# 1. Deploy da Edge Function (sem verificação de JWT pois é chamada sem auth)
npx supabase functions deploy check-widget-eligibility --no-verify-jwt

# 2. Build do bundle do widget
npm run build:widget
# Gera: dist-widget/widget.js

# 3. Fazer upload do widget.js para o CDN/servidor de assets
# Deve ficar acessível em: https://clouddesk.cloudfy.live/widget.js
```

---

## Secrets necessários na Edge Function

Configurar no Supabase Dashboard (Settings → Edge Functions → Secrets):

```
AIRTABLE_API_KEY   = pat_xxxxxxxxxxxx
AIRTABLE_BASE_ID   = appXXXXXXXXXXXXXX
AIRTABLE_TABLE_NAME = Purchases          # ou o nome real da tabela
```

---

## Troubleshooting

**Widget não aparece para usuário Starter:**
- Verificar se `window.CloudfyUser` está definido antes do script carregar
- Verificar se o campo `Products` no Airtable é exatamente `"Cloud Starter"` (case-sensitive)
- Abrir DevTools → Network → filtrar por `check-widget-eligibility` para ver a resposta

**Widget aparece para usuário não-Starter:**
- Verificar se algum registro no Airtable ainda tem `Products = "Cloud Starter"` junto com outros planos

**Erro de CORS:**
- A Edge Function já tem `Access-Control-Allow-Origin: *` — verificar se a URL da função está correta no `.env`
