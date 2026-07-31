# ScopeFlow 6.1 polish and account update

## Added

- Custom ScopeFlow document-check brand mark and browser icon
- Consistent Lucide action icons throughout the existing workspace
- Lightweight animated loading state for workspace, admin, client proposal and invoice pages
- Reduced-motion support for accessibility
- Safe self-service account deletion for non-admin users
- Automatic final JSON backup before account deletion
- Exact account-email confirmation before deletion
- Complete removal of Supabase Auth user, workspace, proposals and invoices
- Protected platform administrator account
- Stronger PNG, JPG and WebP logo validation
- Friendly confirmation message after deletion

## Deliberately excluded

- Proposal access codes
- Heavy page transitions
- Complex animation libraries
- Additional navigation sections

No database migration is required for this update.
