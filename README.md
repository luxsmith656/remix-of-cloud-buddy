# Cloud Buddy

Cloud Buddy is a React, Vite, TypeScript, Tailwind, shadcn/ui, and Supabase inventory management app for products, ingredients, recipes, batch production, defects, stock movements, alerts, reports, and audit logs.

## Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- A Supabase project
- Supabase CLI for local database work or Dashboard SQL editor access for hosted setup

This project uses npm only. Do not add Bun, Yarn, or pnpm lockfiles.

## Local Setup

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Fill `.env.local` with:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-key
```

Never commit `.env`, `.env.local`, service-role keys, JWT secrets, or database URLs. A real Supabase anon key was previously committed, so rotate the exposed anon key/JWT secret in Supabase before treating the project as production-safe.

## Supabase Setup

Apply migrations in order from `supabase/migrations`:

```bash
supabase db push
```

For hosted Supabase without CLI, run the SQL migrations in Dashboard SQL editor in filename order.

The latest hardening migration adds:

- Atomic `produce_batch(product_id_value, quantity_value)` RPC.
- Atomic `log_defect(batch_id_value, quantity_value, reason_value)` RPC.
- Product status trigger derived from quantity, minimum stock, and expiration date.
- Defensive inventory constraints and indexes.
- Admin-only image upload/update/delete storage policies.
- Storage MIME allowlist limited to PNG, JPG, and WEBP.

The operations hardening migration adds:

- Product and ingredient barcode fields.
- Role Management support through `set_user_role`.
- Inventory adjustment request and approval workflow.
- Immutable audit-log protection.
- Manual alert refresh for low-stock and expiration notifications.

The role helper grant migration allows signed-in clients to call `has_role(uuid, app_role)`, which the frontend uses to resolve admin access and which RLS/storage policies rely on.

If you use Lovable for Supabase changes, paste the prompt in `LOVABLE-SUPABASE-PROMPT.md`.

## Admin Account Setup

Create a user through Supabase Auth or the app signup screen, then assign the admin role:

```sql
insert into public.user_roles (user_id, role)
values ('USER_UUID_HERE', 'admin')
on conflict do nothing;
```

Only admins can mutate protected inventory data under the current RLS model.

## Verification Commands

```bash
npm run lint
npm run typecheck
npm test
npm audit --audit-level=moderate
npm run build
```

All of these should pass before deployment.

## Deployment

1. Set production environment variables in the host, not in Git.
2. Apply Supabase migrations to production.
3. Rotate any previously exposed Supabase keys/JWT secret.
4. Run `npm ci`, `npm run build`, and deploy the generated `dist` folder.
5. Confirm storage bucket policies and RLS policies in Supabase Dashboard.

## Known Limitations

- Broader end-to-end tests for authenticated CRUD flows still need a seeded Supabase test project.
- Broader import workflows, backup automation, external monitoring, scheduled alert jobs, email/SMS notifications, and barcode scanner hardware testing are recommended next improvements.
