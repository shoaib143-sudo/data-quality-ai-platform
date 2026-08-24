# Data Quality Platform — Supabase Auth Foundation v3

This version hardens the Next.js App Router + Supabase SSR authentication foundation before application modules are connected.

## Environment

Create `.env.local` beside `package.json`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Never commit `.env.local` or a Supabase secret/service-role key.

## Supabase URL configuration

For local development, configure:

- Site URL: `http://localhost:3000`
- Redirect URL: `http://localhost:3000/auth/callback`

## Run

```bash
npm install
npm run dev
```

## Authentication flow

- `/signup` — create an account; confirmation uses `/auth/callback`
- `/login` — password login
- `/forgot-password` — password reset email
- `/auth/callback` — PKCE code exchange and safe internal redirect
- `/reset-password` — authenticated password update
- `/dashboard` — protected page
- `/datasets`, `/profiling`, `/data-quality`, `/observability` — protected scaffolds
- `POST /auth/signout` — server-side sign out

The proxy is responsible for session refresh/navigation protection. Server pages independently call `requireUser()`. Database authorization will be enforced by Supabase RLS once the application data model is connected.
