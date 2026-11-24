# Android app 1.2.4

The Android app displays the game in an embedded WebView with no browser address bar. Android 8 or later is required.

Version 1.2.4 first tries the live HTTPS website. If the page fails, returns a server error, or does not finish loading in ten seconds, it serves the included game files inside the app. The included copy uses the same game origin, so existing WebView local progress and account sessions remain available. Cloud saves and email sign-in require an internet connection. Website certificate checks and HTTPS-only traffic remain enabled.

Install the new `TCG_Unboxing_Sim.apk` over the old app. The package and signing certificate are unchanged, and the version code is now 7. Uninstalling or clearing app data can erase guest progress.

The public `android/` folder contains the Activity, manifest, theme and build script. The script requires Android SDK build tools 35, platform 35 extension 15, ECJ and Java. Copy the website runtime files into `assets/game` before building. Release signing keys and passwords are kept outside the repository. Do not create a new signing key for future updates.

Validation: Java compilation, APK alignment and APK signature verification. Device testing still needs to be completed on an Android phone.

The app explicitly disables automatic WebView darkening so the illustrated cards and authored neon palette retain their intended colors.
