# Authentication and administrator setup

## Administrator

The protected platform administrator email is:

```text
oyekunleolalekan3168@gmail.com
```

Create this account through the normal ScopeFlow signup screen. After email confirmation and sign-in, the account receives access to `/admin`.

## Required Supabase actions

1. Run `supabase/schema.sql` in SQL Editor.
2. Enable the Email authentication provider.
3. Set the production Site URL.
4. Add `/auth/callback` and `/reset-password` redirect URLs.
5. Copy the project URL, service-role/secret key and anon/publishable key into Vercel.

## Required Vercel variables

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
AUTH_SECRET
PLATFORM_ADMIN_EMAIL
```

## Authentication test

1. Register a normal test business.
2. Confirm its email.
3. Sign in and create a service and proposal.
4. Sign out.
5. Use Forgot password and set a new password.
6. Sign in as the administrator.
7. Open `/admin`, disable the test account and confirm it can no longer access `/app`.
8. Re-enable it and confirm access returns.
