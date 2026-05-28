# Cloud Buddy

Cloud Buddy is a React, Vite, TypeScript, Tailwind, shadcn/ui, and Supabase inventory management app for products, ingredients, suppliers, recipes, ingredient receiving, batch production, product dispatch, defects, stock movements, adjustment approvals, alerts, reports, activity history, roles, and audit logs.

<!-- GitHub sync verification: 2026-05-28 -->

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

The browser publishable Supabase key is not a service-role secret and is included in frontend builds, but it still must be provided through `.env.local`, Vercel, or Lovable environment variables. The app intentionally shows a configuration-required screen when those variables are missing.

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

The real-life inventory flow migration adds:

- `receive_ingredient` RPC for atomic inbound stock receiving.
- `dispatch_product` RPC for atomic outbound finished-goods dispatch.
- `ingredient_receipts`, `product_dispatches`, and `inventory_activity` tables.
- Unit cost fields for ingredients and unit price/estimated cost fields for products.
- Receiving and dispatch reports for CSV/PDF export.
- RLS policies so authenticated users can read operational history and only admins can create protected inventory transactions.

The batch barcode migration adds:

- Required per-batch `batch_code`, `barcode_token`, `barcode_value`, `manufactured_date`, and batch `price`.
- Unique indexes so the same batch barcode/token cannot be reused.
- `produce_batch(product_id_value, quantity_value, expiration_date_value, batch_code_value, production_date_value)` so production date, editable expiration date, batch creation, ingredient deduction, finished-goods stock, stock movements, alerts, and audit log are committed atomically.
- Barcode-aware `log_defect` and `dispatch_product` RPCs so defect and dispatch movements keep the related batch barcode.
- `find_batch_by_barcode(barcode_value_value)` for the scanner page. The barcode stores only the internal token; product details are fetched from Supabase after authenticated lookup.
- Shelf-life updates based on the readable bottle labels: Banana Ketchup and Sweet Sauce use 210 days; Soy Sauce, Vinegar, and Fish Sauce use 240 days.

The label seed migration adds label-informed products, ingredients, and editable demo recipes:

- Label-readable ingredients are used for Fish Sauce, Soy Sauce, Vinegar, Sweet Sauce, and Banana Ketchup.
- Tomato Sauce, Spaghetti Sauce, Hot Sauce, and Oyster Sauce are added as estimated placeholders because label photos were not available.
- Recipe quantities in seed data are demo placeholders only and should be reviewed by an admin before real production use.

The PWA/security hardening migration adds:

- Revocation of anonymous `has_role` execute access.
- Reconfirmation that storage image uploads are limited to PNG, JPG, and WEBP at 5 MB.

## PWA And Offline

Cloud Buddy is configured as a PWA through `vite-plugin-pwa`, with app icons, a web manifest, service-worker precaching, stale chunk recovery after deploys, and a status bar for offline/update states.

Offline support is intentionally read-only for inventory safety. The barcode scanner syncs batch lookup records into IndexedDB while online, supports manual sync, refreshes on reconnect, and can resolve synced batch tokens offline. Stock-changing actions such as production, receiving, dispatch, defects, and adjustments still require Supabase so inventory transactions stay atomic and conflict-free.

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

Only describe Cloud Buddy as fully deployed on Vercel after the live URL loads with valid Supabase variables:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-key
```

If the Vercel site still shows missing configuration or "configuration required," it is deployed but still needs final environment configuration and redeploy.

## Known Limitations

- Broader end-to-end tests for authenticated CRUD flows still need a seeded Supabase test project.
- Camera scanning depends on browser support for the BarcodeDetector API. USB scanners and manual barcode search are supported as fallback paths.
- Batch-level FEFO allocation is possible through dispatch batch selection, but automatic FEFO picking is still a recommended improvement.
- Broader import/export workflows, backup automation, external monitoring, scheduled alert jobs, email/SMS notifications, barcode hardware testing, audit dashboards, and approval workflows for high-value dispatches are recommended next improvements.

<!-- force-test-push: 2026-05-28T12:39:06Z -->
