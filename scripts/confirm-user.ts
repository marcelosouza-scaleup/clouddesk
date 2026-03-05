import { createClient } from '@supabase/supabase-js';

// Run: npx ts-node scripts/confirm-user.ts

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function confirmUser(email: string) {
  try {
    console.log(`Confirming user: ${email}`);

    // Get user by email
    const { data: users, error: fetchError } = await supabase.auth.admin.listUsers();

    if (fetchError) throw fetchError;

    const user = users.users.find(u => u.email === email);
    if (!user) {
      console.error(`User ${email} not found`);
      process.exit(1);
    }

    // Confirm email
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      email_confirm: true,
    });

    if (updateError) throw updateError;

    console.log(`✓ User ${email} confirmed successfully!`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Get email from command line or use default
const email = process.argv[2] || 'marcelobtzr@gmail.com';
confirmUser(email);
