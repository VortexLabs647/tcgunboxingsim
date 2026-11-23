# TCG Unboxing Sim — accounts and mobile update

1. Extract this ZIP on your computer.
2. Read SUPABASE_SETUP.md to activate email accounts and cloud saves. Without that setup, the game remains playable with device-only guest saves.
3. In your GitHub repository, click Add file > Upload files. Select ALL extracted files, including the PNGs, fonts, JavaScript, cloud-config.js and TCG_Unboxing_Sim.apk. Upload the files themselves, not the ZIP or its enclosing folder. Everything goes beside index.html in the repository root.
4. Click Commit changes. In Actions, wait for the Pages deployment to finish. Your Pages source should be the main branch, /(root), unless you already use a working Pages workflow.
5. Open https://vortexlabs647.github.io/tcgunboxingsim/ and refresh with Ctrl+Shift+R. If an old version persists, close all game tabs and reopen. Do not clear browser storage if you need your guest save.

Profile includes the Android APK download. The APK must be uploaded alongside index.html for that button to work. Android 8+ is supported. The app loads the live GitHub website and needs internet; this is not an offline native game or Play Store release. iPhone/iPad players use the website.

Gamble mode now has 90% Common and 10% Grail odds per card, with Wild disabled. Other modes retain their existing Wild behavior. Each draw is independent; a Grail is not guaranteed every ten cards.

451 entries now feature 64 original cartoon designs across creatures, sneakers, football and basketball, with multiple finish editions. Existing item IDs and virtual values are retained for save compatibility. All artwork is local. Existing cloud setup remains required for accounts.

Keep the separately supplied PRIVATE Android signing backup somewhere safe. Never upload that private backup to GitHub. It contains the key needed to release compatible app updates.

Verification for cartoon update: JavaScript syntax, all 180 pack/mode combinations, 451 catalog records, 64 artwork tiles and local asset references. Browser visual verification was unavailable in this environment. Account configuration and Android wrapper are unchanged.

An independent fan-made affiliation notice now appears in the footer and Profile. It identifies third-party ownership and clarifies that no endorsement is implied. A disclaimer does not itself provide an image/trademark license or guarantee legal protection.

Cartoon art update: upload and replace all extracted files. The Android app loads the live website and receives the same artwork once the website is updated.
