# Confirmar Usuário para Testes

## Opção 1: Via Script (Recomendado)

1. **Obtenha a chave de service role:**
   - Vá para: https://app.supabase.com → seu projeto → Settings → API
   - Copie: **Service Role key** (a chave com acesso total)

2. **Crie um arquivo `.env.local` na raiz do projeto:**
   ```
   VITE_SUPABASE_URL=https://feralcheet-supabase.cloudfy.live/
   SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key-aqui
   ```

3. **Instale ts-node (se não tiver):**
   ```bash
   npm install -g ts-node
   ```

4. **Rode o script:**
   ```bash
   npx ts-node scripts/confirm-user.ts marcelobtzr@gmail.com
   ```

5. **Se funcionar, você verá:**
   ```
   ✓ User marcelobtzr@gmail.com confirmed successfully!
   ```

6. **Agora pode fazer login normalmente!**

---

## Opção 2: Teste Direto (Sem Confirmação)

Se o script não funcionar, tente:

1. Recarregue o app: `npm run dev`
2. Teste login com:
   - Email: `marcelobtzr@gmail.com`
   - Senha: (a senha que você criou)

O `signInWithPassword` funciona mesmo sem confirmar email!

---

## Opção 3: Desabilitar Confirmação (Se conseguir acessar o painel)

Settings → Authentication → Email → Desmarque "Confirm email" → Save

