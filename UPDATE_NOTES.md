Pack prices now use $1, $2, $5, $10, $15, $25, $50, $75 and $100 virtual currency in every category. New sneaker pulls have fictional simulator values suited to those packs. Existing vault item values are preserved during save migration.

The leaderboard lists the top 50 signed-in collectors in two rankings: packs opened and total virtual currency spent buying packs. Players explicitly join in Profile or Ranks and can leave at any time. Scores sync through game_saves; guest progress joins when attached to a new account and opted in. Email addresses, complete saves and account IDs are not public. Totals come from client game saves and are not cheat-proof or suitable for real-money competitions.

For a new Supabase project, run supabase-setup.sql, then leaderboard-setup.sql. Both are already applied to the connected production project. The leaderboard trigger is private; clients cannot write ranking rows directly. Account deletion cascades leaderboard entries.


## Audio, Profile and Android update
- Cancel scheduled sound sources when opening phases end, the player navigates away, or the app is hidden. Selling plays one cash effect; controls with dedicated sounds no longer layer a generic click over them.
- Add decorative coins, chips and banknotes around the pack room, with compact ornaments on mobile.
- Keep collector name and sign-in visible; move stats, leaderboard, APK download, referral and about information into expandable sections.
- Remove the category symbol medallion from pack artwork.
- Android 1.2.0 includes the current game as a fallback for unavailable website HTTPS. It retains the same app ID, signing certificate and game storage origin, and has no address bar.
