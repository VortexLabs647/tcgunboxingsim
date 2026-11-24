Pack prices now use $1, $2, $5, $10, $15, $25, $50, $75 and $100 virtual currency in every category. New sneaker pulls have fictional simulator values suited to those packs. Existing vault item values are preserved during save migration.

The leaderboard lists the top 50 signed-in collectors in two rankings: packs opened and total virtual currency spent buying packs. Players explicitly join in Profile or Ranks and can leave at any time. Scores sync through game_saves; guest progress joins when attached to a new account and opted in. Email addresses, complete saves and account IDs are not public. Totals come from client game saves and are not cheat-proof or suitable for real-money competitions.

For a new Supabase project, run supabase-setup.sql, then leaderboard-setup.sql. Both are already applied to the connected production project. The leaderboard trigger is private; clients cannot write ranking rows directly. Account deletion cascades leaderboard entries.


## Audio, Profile and Android update
- Cancel scheduled sound sources when opening phases end, the player navigates away, or the app is hidden. Selling plays one cash effect; controls with dedicated sounds no longer layer a generic click over them.
- Add decorative coins, chips and banknotes around the pack room, with compact ornaments on mobile.
- Keep collector name and sign-in visible; move stats, leaderboard, APK download, referral and about information into expandable sections.
- Remove the category symbol medallion from pack artwork.
- Android 1.2.0 includes the current game as a fallback for unavailable website HTTPS. It retains the same app ID, signing certificate and game storage origin, and has no address bar.


## Pack lounge and collection expansion (v40)
- Removed the About the game Profile section.
- Replaced basic money ornaments with a card showcase, detailed casino chips, foil treatments, gold opening controls and a smoked-glass pack room.
- Fixed mobile mode button spacing, long collectible names, price labels, collection descriptions, Profile controls and wrapped footer text. Checked 320px, 390px and 768px layouts in the browser with no horizontal page overflow or clipped pack controls.
- Added 320 collectibles: 80 each for Creatures, Sneakers, Football and Basketball. Four new collections include 64 new original illustrations and five finishes each. Total catalog: 771. Existing card IDs and saved vault values are preserved.
- Updated offline cache and Android 1.2.1 (version code 4) with the same expanded catalog and artwork.


## Casino Royale theme (v41)
- Replaced the purple/black palette throughout the game with emerald felt, champagne gold and ruby lacquer.
- Added marquee lighting, layered gold rails, a felt pack table and illuminated pack stands.
- Restyled the navigation, opening controls, vault, collection, wallet, Profile, rankings and reveal screens in the same palette.
- Retained the responsive layout, current collectibles, pack prices and odds.
- Updated the offline cache and Android 1.2.2 (version code 5).


## Compact neon layout and simpler odds (v42)
- Brightened the app with violet, cyan, pink and luminous gold surfaces.
- Moved pack controls alongside the carousel on desktop and removed the empty leading carousel space. Added a compact desktop collection spotlight.
- Made wrapper typography scale with pack width, removed tiny card labels inside pack artwork, shortened the wrapper category label, and paired each pack name with its price.
- Corrected automatic carousel scrolling so choosing the last pack preserves the intended selection.
- Simplified View odds into rarity names and per-card percentages. Displayed overall percentages include the Wild roll; base odds and card values remain available under Values & detailed odds. Actual drawing probabilities are unchanged.
- Updated Android 1.2.3 (version code 6) and the offline cache.
