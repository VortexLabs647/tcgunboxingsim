# Activate email accounts and cloud saves

The game is prepared for Supabase. It does not include a preconfigured backend. You own the project and players' accounts.

## 1. Create your project

Go to https://supabase.com/dashboard and create a project. Store your database password privately. Under Authentication, enable the Email provider and keep email confirmation enabled. Set the minimum password length to 12 characters to match the game.

## 2. Set the website URLs

In Authentication > URL Configuration, set Site URL to:

https://vortexlabs647.github.io/tcgunboxingsim/

Add that exact URL to Redirect URLs as well. If you switch to your own domain, add its HTTPS root URL here and use that URL in cloud-config.js. Do not remove an old URL while players still use it.

For production email delivery, configure your own SMTP provider under Authentication email settings. Supabase's built-in mail service is limited and is intended for testing. Review the project dashboard's current restrictions before inviting public users.

## 3. Create the save database

Open SQL Editor > New query. Copy the entire contents of supabase-setup.sql, paste it, and run it as the project owner. It creates game_saves, row-level security for each player's own row, a revision-checked save function and an account deletion function. Never disable row-level security.

## 4. Add the public connection settings

Find the Project URL and publishable key in the project's Connect/API settings. A legacy anon key also works. Edit cloud-config.js:

```js
window.TCG_CLOUD_CONFIG = {
  url: 'https://YOUR-PROJECT.supabase.co',
  publishableKey: 'YOUR-PUBLISHABLE-KEY',
  redirectUrl: 'https://vortexlabs647.github.io/tcgunboxingsim/'
};
```

Only these public settings belong in the website. Never use a service_role key, sb_secret key, database password, access token or signing password. Database policies protect users' save rows; a publishable key alone does not provide authorization.

Upload the edited cloud-config.js along with all files from this package to GitHub. Wait for Pages deployment and refresh. Profile should now show Create account and Sign in.

## 5. Test before inviting players

Create a test account from Profile, confirm its email, then sign in. If signup and confirmation happen on the same browser, its current guest progress is attached to a brand-new account. Confirmation in another browser starts from a new save; existing cloud accounts always load their existing progress. Guest saves are not automatically merged into existing accounts.

Open a pack or change your collector name. Wait until Profile says Cloud save up to date. Sign into the same account on another device and check balance and collection. Test password reset, sign out and sign in. The Android app has separate browser storage, so sign in there to load cloud progress.

Play on one device at a time. If both devices save the same revision, one is blocked from overwriting the other. Profile offers Load latest cloud save; this intentionally replaces the unsynced device copy. Offline or failed saves remain in that device's storage, but gameplay pauses until syncing succeeds. Do not clear storage while you have pending saves.

Delete cloud account requires its explicit checkbox and deletes the auth user and saved game. Guest deletion only affects that device. Referral rewards are tracked in the game save; this is not a production anti-cheat or real-money economy.

## Troubleshooting

- Accounts still unavailable: confirm cloud-config.js is uploaded with both fields filled, then refresh after deployment.
- Permission/table/function error: run the full SQL file in the correct project; check the URL/key pair points to that project.
- Confirmation/reset links fail: check exact Redirect URLs and SMTP settings; request a fresh link.
- No email arrives: check spam, provider restrictions and SMTP delivery logs.
- Save changed elsewhere: return to Profile and load the latest cloud save after reviewing the replacement notice.
- Android shows old game: upload the website files first. The APK uses the live website; no APK rebuild is needed for ordinary website changes. A domain change requires updating MainActivity's allowed URL and rebuilding with the SAME private signing key.

Official references:
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/auth/auth-smtp
