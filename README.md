# LedgerFlow — multi-tenant accounting SaaS

Responsive accounting-practice and customer portal hosted on Render Static Sites with Supabase Auth, PostgreSQL, RLS, and private Storage.

## Tenant model

- Every accounting practice creates its own firm workspace from an email-verified user account.
- Owners/admins can invite team members and customer accounts by verified email. Customers are mapped **only** to specifically approved client companies.
- The current invitation workflow records invites in the database. It **does not send invitation emails**; an administrator must send customers the portal URL through their usual secure channel.
- Customers have read-only views of ITR, GST, balance-sheet status and documents explicitly shared with them. Staff can manage their own firm's records. Every table uses RLS.
- The public website uses only the Supabase publishable key, never a service-role/secret key.

## Deploy on Render

Static Site:
- Repository: `https://github.com/trucompare-art/theta-accounting-portal`
- Branch: `main`
- Build command: `echo 'Static site ready'`
- Publish directory: `.`
- Auto deploy: enabled

Supabase project: `gwrfebfvcfqcbjlbabnv` (Theta Digimarketing, **not** Sage Pro).

After deploying, configure Supabase Authentication > URL Configuration:
- Site URL = exact Render HTTPS URL
- Additional Redirect URLs = same Render HTTPS URL (and your future custom domain)
- Enable and test email confirmation for new signups
- Configure reliable outbound authentication email before inviting customers

## Usage

1. On the site, **Create your free practice account** and verify your email.
2. Sign in, create your accounting practice, and add a client.
3. Record returns/due dates, upload private documents, and explicitly share selected files.
4. Create a customer invitation using the customer's email; they verify an account using the *same* email address.
5. The customer signs in to see only their approved companies and shared records.

Staff roles: owner/admin/staff/viewer. One verified user can join more than one practice through administrator-issued invitations.

## Security and production caveats

- Never publish real tax filings until invitation email delivery, MFA, backups, RLS, recovery, and document-access testing have been completed.
- No automated return filing, GST portal connection, invoicing, payment collection, recurring subscriptions, or usage billing is included in this MVP.
- Supabase is currently on the Free plan. For multi-practice production usage, review resource limits, backups, storage growth and paid plan requirements.
- Documents are private by default; the storage bucket restricts formats and file size (10 MB).
- Open signup is required to let new accounting firms self-register, but firm and client data cannot be read without authenticated, explicitly granted database permissions.
- Test the phone layout at 320–430 px width. Table rows become cards on narrow screens.

## Development

No build required: serve this repository with a static HTTP server:
```bash
python -m http.server 8080
```
Open `http://localhost:8080`.

## Files

- `index.html`: app shell and navigation
- `assets/app.js`: Supabase authentication and tenant-aware application
- `assets/styles.css`: responsive design system

**Never commit secrets, a service role key, customer data or actual accounting documents.**
