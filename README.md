# ScopeFlow 6 — Proposal to Delivery


## ScopeFlow 6.1 polish update

This build adds a custom ScopeFlow icon system, lightweight loading animation, safer logo validation and self-service account deletion with an automatic final backup. The protected platform administrator cannot be deleted. No new Supabase schema migration is required for this update.

ScopeFlow is a focused workspace for independent professionals. Each registered user owns a completely separate business workspace. Clients never need accounts: they use secure proposal, invoice and project links.

## Complete workflow

`Proposal → Client selection/negotiation → Approved agreement → Invoice(s) → Payment confirmation → Delivery countdown → Review → Delivery`

### Proposals and agreements

- Four-step proposal editor with autosave and exact client preview.
- Reusable categorized services plus one-off services.
- Required scope, optional extras, adjustable quantities and controlled price requests.
- Hidden flexibility/minimum-price rules and an approximate client-facing acceptance likelihood.
- One owner-defined order incentive with a live progress bar.
- Default terms, payment instructions and document numbering.
- Secure client link, expiry, view tracking, version history and locked approval snapshot.
- Additional-work orders after approval, without altering the original agreement.
- Archive/restore for proposals and Trash for drafts.

### Multiple invoices

- Deposit, milestone, balance, full and custom invoices.
- Every invoice has its own number, secure read-only link, PDF, amount, due date and view history.
- Clients can report that payment was sent; only the business owner can confirm payment.
- Paid, unpaid, payment-reported and cancelled states.
- Archive/restore invoices and optionally disable an archived client link.
- Approved, invoiced, paid and remaining-to-invoice totals stay visible in the document centre.

### Payment-confirmed delivery countdown

Each proposal can use a delivery duration such as 7, 14 or 30 days.

- Calendar-day or business-day counting.
- Start after full payment, a required deposit or a manual owner action.
- Start automatically after payment confirmation or wait for the owner to click Start.
- Owner and client see the live remaining time and calculated delivery deadline.
- Default labels: On track, Due soon, Almost due and Overdue.
- Pause/resume while waiting for client materials or feedback.
- Extend the delivery window with a client notification.
- Ready for review, Delivered and Completed statuses.
- Current-project dashboard sorted by deadline.
- Downloadable `.ics` delivery milestone and Google Calendar link.

### Email delivery

With `RESEND_API_KEY` and `EMAIL_FROM`, ScopeFlow sends branded transactional emails for:

- Proposal ready.
- Invoice ready and invoice reminders.
- Payment confirmed and countdown started/scheduled.
- Project started, paused, resumed or extended.
- Ready for review and delivered.

Replies go to the business owner. If email delivery is not configured, the same action opens the owner's email application with a prepared message so the workflow does not fail.

### Backup and recovery

- Download a versioned JSON backup.
- Restore through Settings using Merge or Replace.
- Replace automatically downloads a safety backup first.
- Merge keeps current data, adds missing records and avoids overwriting a newer approved agreement.
- Authentication sessions, passwords and admin rights are never imported.

## Authentication and platform administration

- Supabase Auth registration, email confirmation, login, logout, forgotten-password and password-reset flows.
- Every account has isolated settings, services and proposals.
- Protected platform administrator: `oyekunleolalekan3168@gmail.com`.
- The `/admin` console can view account health and disable/reactivate non-admin businesses without reading private proposal content.

## Deliberately not included

- No payment gateway or card processing.
- No client login.
- No chat, CRM, time tracking or accounting ledger.
- Tax is optional and disappears completely when disabled.

## Supabase migration

Open the Supabase project used by Vercel, then run the complete contents of:

```text
supabase/schema.sql
```

The script is safe to run repeatedly. ScopeFlow 6 adds `invoice_tokens` to `sf_proposals`, creates the GIN index used by invoice links, and backfills legacy invoice tokens.

## Vercel environment variables

Required:

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_PRIVATE_SERVICE_ROLE_OR_SECRET_KEY
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
AUTH_SECRET=YOUR_LONG_RANDOM_SECRET
PLATFORM_ADMIN_EMAIL=oyekunleolalekan3168@gmail.com
```

Optional automatic emails:

```env
RESEND_API_KEY=re_your_key
EMAIL_FROM=ScopeFlow <updates@your-verified-domain.com>
```

Without the optional email values, ScopeFlow opens a prefilled email in the owner's email application.

## Supabase Auth URLs

Set the Site URL to the production Vercel domain and allow:

```text
https://YOUR-DOMAIN/auth/callback
https://YOUR-DOMAIN/reset-password
```

## Deploy to GitHub

The included script targets:

```text
https://github.com/damolax/scope-flow.git
```

From Git Bash in Windows Downloads:

```bash
cd ~/Downloads
rm -rf scope-flow-operations
unzip -q -o scope-flow-operations.zip -d scope-flow-operations
cd scope-flow-operations
chmod +x DEPLOY_ONCE.sh
./DEPLOY_ONCE.sh
```

Vercel will install dependencies and build the pushed `main` branch.

## Production acceptance test

1. Register and confirm a test owner account.
2. Add branding, terms and at least two services.
3. Create a proposal with one required service and one optional extra.
4. Open the client link in Incognito and approve it.
5. Create a deposit and a balance invoice; test both links.
6. Report payment from the client page, then confirm it as the owner.
7. Confirm the countdown and calculated deadline appear on both sides.
8. Pause, resume and extend the countdown.
9. Download the calendar file and PDFs.
10. Download a backup, add a temporary record, then test Merge restore.
11. Archive and restore both an invoice and proposal.
