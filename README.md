# TCG Unboxing Sim — GitHub Pages + Namecheap setup

This folder is the complete browser game, including its images, fonts and sounds. It runs as a static website. You do not need a game server or paid Namecheap hosting for this setup.

**Extract the ZIP first. Upload its contents so that `index.html` sits directly in your repository's root. Uploading the ZIP itself will not publish the game.**

## 1. Upload the game to GitHub

GitHub Desktop can upload the complete extracted folder while keeping its files and artwork together. The steps below use that method.

1. Install [GitHub Desktop](https://desktop.github.com/) on your computer and sign in to your GitHub account.
2. On [GitHub](https://github.com/new), create a new repository named `tcg-unboxing-sim`. Choose **Public** to use GitHub Pages with a free GitHub account. Turn on **Add a README file**, then create the repository.
3. In that repository, choose **Code → Open with GitHub Desktop**. Confirm the local folder and click **Clone**.
4. In GitHub Desktop choose **Repository → Show in Explorer**. This opens the repository folder on Windows.
5. Open the extracted game folder. Copy **all the files and the assets folder inside it** into the repository folder. Replace the initial README when asked. The repository folder should now contain `index.html`, `app.js`, `engine.js`, `styles.css`, `catalog.json`, `assets/` and the other included files.
6. Return to GitHub Desktop. Leave the game files selected under **Changes**. Enter `Upload TCG Unboxing Sim` in Summary, then choose **Commit to main** and **Push origin**.
7. Refresh your repository on GitHub. Confirm that you see `index.html` at the top level and that `assets/original/` contains the eight original artwork atlases.

If you already have a repository for this game, clone that repository instead of creating another. Pull its latest changes before copying this update into it.

## 2. Turn on GitHub Pages

1. Open the repository on GitHub and go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Choose branch **main** and folder **/(root)**. Click **Save**.
4. Wait for publication, then use **Visit site** on the Pages settings screen. The initial address will usually be `https://YOUR-GITHUB-USERNAME.github.io/tcg-unboxing-sim/`.

Publishing can take up to 10 minutes. Confirm that the game loads here before connecting the domain.

## 3. Add your domain on GitHub

In the same **Settings → Pages** screen, enter your domain, such as `yourdomain.com`, under **Custom domain**, then click **Save**. Enter the domain name only, without `https://` or a path.

Do this before changing DNS. GitHub will add a `CNAME` file to the repository. Keep that file when uploading future game updates. After making this change online, use **Fetch origin / Pull origin** in GitHub Desktop before your next update.

## 4. Point your Namecheap domain to GitHub

Sign in to Namecheap. Open **Domain List → Manage** next to your domain, then **Advanced DNS → Host Records**. These instructions apply when the domain uses Namecheap BasicDNS, PremiumDNS or FreeDNS. If its nameservers point to another DNS provider, add the records at that provider instead.

Create these records. Set TTL to **Automatic**:

| Type | Host | Value |
| --- | --- | --- |
| A Record | @ | 185.199.108.153 |
| A Record | @ | 185.199.109.153 |
| A Record | @ | 185.199.110.153 |
| A Record | @ | 185.199.111.153 |
| CNAME Record | www | YOUR-GITHUB-USERNAME.github.io |

Replace `YOUR-GITHUB-USERNAME` with your actual GitHub username. The `www` value has no `https://`, repository name, slash or path.

Remove conflicting parking, redirect or old website records for `@` and `www`. Keep unrelated email and verification records. Save the new records.

## 5. Finish HTTPS

Return to the repository's **Settings → Pages**. Wait for the DNS check and certificate, then enable **Enforce HTTPS** when available. DNS changes can take up to 24 hours. Once ready, test both `https://yourdomain.com` and `https://www.yourdomain.com`.

GitHub hosts the game; Namecheap continues to manage your domain registration and DNS. You do not need to purchase a separate SSL certificate for GitHub Pages.

## Updating the game later

Pull the latest repository changes in GitHub Desktop, copy the replacement game files into that folder, keep your domain's `CNAME` file, then commit and push. GitHub Pages will publish the changes. If the browser still shows an older version, try Ctrl+Shift+R.

## Playing this version

- Start with $0 and add up to $10 in free virtual funds when your balance is below $1.
- Choose an original collection, pack edition, odds mode, and quantity. Open directly from the pack page; the numbered-pack picker has been removed.
- Tier percentages use the published Crown TCG pack tables across all four original collections, including 90% Common / 10% Grail in Max mode. Existing prices are unchanged; nearest-price reference profiles cover $2, $15 and $75. See ODDS.md for the full mapping and sources. Individual original-card chances vary within each tier and are shown under What’s inside. The displayed virtual return is computed from the same probabilities; it differs from Crown Cards and remains below 95% for all packs/modes.
- Buy a pack, then click or tap the wrapper to start the glowing sparkle line across its top seal. Keyboard players can use Enter or Space. The top seal separates subtly and the wrapper fades gently. The card turns slowly with a visible surface throughout the rotation, then finishes with the original card flipping face-up. The final rarity and artwork match the awarded card, with no second roll; batch openings feature their best card. Rarity words crossfade smoothly in place, as the card makes one continuous turn and slows directly onto the awarded rarity. There is no Grail pause or Revealing step. The pack carousel uses soft layered lighting that follows the selected pack color. Reveal now skips the sequence after the pack is activated. Sales animate coins into the balance without a sale-complete popup. Sell or vault a result to return to pack selection. Legendary/Grail pulls and cards worth at least 5× pack price play win music. Sound and supported haptics are enabled after interaction.
- Ultra’s maximum is 20× the pack price, including fallback cards. Original high-end card values are capped at $2,000 so all cards remain obtainable from the existing packs. Existing vaulted values are preserved.
- In Profile or Deposit, use **cccollectables** for a one-time **$100 virtual reward**. A claim is saved on that browser profile and remains used after Delete account.
- Progress is local to each browser and website address. Moving from the ChatGPT site to GitHub Pages or your domain starts a separate local save. This package does not include cloud accounts or cross-device referral enforcement.
- Delete account clears the current device's game profile after an in-game confirmation. It does not delete a GitHub or Namecheap account.

## If something does not work

- **404:** Check that `index.html` is in the repository root and Pages uses `main` / `/(root)`.
- **Missing art or loading error:** Upload the complete `assets` folder plus `catalog.json`, `app.js`, `engine.js` and `styles.css`. Keep names and capitalization unchanged.
- **Namecheap parking page:** Check old records for `@` and `www`, confirm where your nameservers point, and allow DNS time to update.
- **HTTPS unavailable:** Wait for the DNS check and certificate, then try Enforce HTTPS again.
- **Opening index.html directly does not load:** Publish it as above, or use a local HTTP server. This folder is the website edition.

## Official setup references

- [Upload limits](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)
- [Clone with GitHub Desktop](https://docs.github.com/en/desktop/adding-and-cloning-repositories/cloning-a-repository-from-github-to-github-desktop)
- [Commit and push changes](https://docs.github.com/en/desktop/making-changes-in-a-branch/committing-and-reviewing-changes-to-your-project-in-github-desktop)
- [Configure GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Connect a custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
- [Namecheap GitHub Pages instructions](https://www.namecheap.com/support/knowledgebase/article.aspx/9645/2208/how-do-i-link-my-domain-to-github-pages/)

Setup references checked November 22, 2026. Values and menus may change; use the official links above if they differ.

The game contains 800 2D NFT-style cards across TCG Packs, Football, Basketball and Sneakers: 200 per collection. Each collection has 50 original base designs with Base, Prism, Onyx and Aurum editions. Creature and sneaker editions include colorway variations; sports avatars use distinct card backgrounds and foil finishes. All athletes are fictional and all shoes are unbranded. Names, artwork, lore and virtual values were created for this game. Card art is original generated 2D cartoon illustration with solid fills, bold outlines and restrained expressions. Sneakers are footwear objects without faces or character features. All artwork is displayed in a custom card frame. The NFT-style label describes the visual design; these are virtual game collectibles. No real-world collectible card scans, sneaker photos, player photos, team logos or collectible-brand marks are included. There are no payments, cashouts or physical prizes. Existing local saves convert their held cards to the original collections while preserving currency, held-card values, favorites and used referral rewards.

Wild openings: a separate 10% roll per purchase makes all cards in that opening Grail. The Wild effect activates during the spin; the actual Grail cards are committed on purchase, preserving them through skip/navigation/reload. Wild uses the selected pack’s Normal Grail pool and retains the 20× Ultra cap. The displayed table and average return are labeled base odds, with the Wild bonus disclosed separately.

Big-hit/profit pop-up removed. The results still show value/profit inline and retain win music, colored glow and coins.

Opening and spin glows use bounded elliptical feather masks, fading to fully transparent before their stage edges; the opening aura has no rectangular sheen layer.

Gamble mode: exactly 50% Common and 50% Grail per card; Wild disabled to preserve that split. Other modes keep their rarity percentages. Within-tier item weights now use inverse value to the sixth power rather than eighth for more card variety; item odds and base returns are calculated from the revised weights. Secure random draws remain independent.
