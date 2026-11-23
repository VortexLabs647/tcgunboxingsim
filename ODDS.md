# Pack odds reference

Published tier percentages read from Crown Cards’ public Pack Modes panels on November 22, 2026. These are a fixed reference snapshot, not a live sync.

The same TCG probability profiles are used across all four original collections. This is a TCG-table match, not a copy of Crown’s category-specific sports tables. The original card values and individual item chances differ from Crown Cards.

| Game edition | Game price | Crown TCG reference | Reference price |
| --- | --- | --- | --- |
| Opal | $1 | Starter | $1 |
| Sapphire | $2 | Select | $2.5 |
| Amethyst | $5 | Basic | $5 |
| Emerald | $10 | Signature | $10 |
| Ruby | $15 | Signature | $10 |
| Gold | $25 | Bronze | $25 |
| Obsidian | $50 | Silver | $50 |
| Diamond | $75 | Silver | $50 |
| Sovereign | $100 | Gold | $100 |

Prices are unchanged. $2, $15 and $75 use the nearest reference price, with $75 tied and assigned to $50.

## Published percentages

| Reference | Mode | Common | Uncommon | Rare | Epic | Legendary | Grail |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Starter | Normal | 60% | 0% | 29.6% | 7.9% | 1.9% | 0.6% |
| Starter | High | 80% | 0% | 7.7% | 5.2% | 3.1% | 4% |
| Starter | Max | 90% | 0% | 0% | 0% | 0% | 10% |
| Starter | Ultra | 85% | 0% | 0% | 0% | 0% | 15% |
| Select | Normal | 27% | 23% | 19.8% | 19.5% | 7% | 3.7% |
| Select | High | 27.9% | 52.1% | 1.8% | 3.5% | 3.2% | 11.5% |
| Select | Max | 90% | 0% | 0% | 0% | 0% | 10% |
| Select | Ultra | 79.93% | 0% | 0% | 0% | 0% | 20.07% |
| Basic | Normal | 25.2% | 24.8% | 19.2% | 12.9% | 13.5% | 4.4% |
| Basic | High | 27% | 53% | 3.1% | 3.1% | 5.8% | 8% |
| Basic | Max | 90% | 0% | 0% | 0% | 0% | 10% |
| Basic | Ultra | 74.66% | 0% | 0% | 0% | 0% | 25.34% |
| Signature | Normal | 29.6% | 20.4% | 38.9% | 8.7% | 1.9% | 0.5% |
| Signature | High | 33.7% | 46.3% | 6.4% | 4.6% | 3.1% | 5.9% |
| Signature | Max | 90% | 0% | 0% | 0% | 0% | 10% |
| Signature | Ultra | 85% | 0% | 0% | 0% | 0% | 15% |
| Bronze | Normal | 37.8% | 12.2% | 20.6% | 12.2% | 13.5% | 3.7% |
| Bronze | High | 51.4% | 28.6% | 2% | 1.8% | 4.2% | 12% |
| Bronze | Max | 90% | 0% | 0% | 0% | 0% | 10% |
| Bronze | Ultra | 74.61% | 0% | 0% | 0% | 0% | 25.39% |
| Silver | Normal | 19.9% | 30.1% | 16% | 14% | 15.8% | 4.19% |
| Silver | High | 17.9% | 62.09% | 1.1% | 1.7% | 5.41% | 11.8% |
| Silver | Max | 90% | 0% | 0% | 0% | 0% | 10% |
| Silver | Ultra | 85% | 0% | 0% | 0% | 0% | 15% |
| Gold | Normal | 29.4% | 20.6% | 32.9% | 7.5% | 5.9% | 3.7% |
| Gold | High | 28.67% | 51.25% | 4.5% | 2.3% | 3.3% | 9.99% |
| Gold | Max | 90% | 0% | 0% | 0% | 0% | 10% |
| Gold | Ultra | 72.03% | 0% | 0% | 0% | 0% | 27.97% |

Some published rounded tables total 99.99% or 100.01%. The simulator distributes that 0.01% remainder across active tiers; rounding each tier to two decimals still matches the published table. The draw uses the resulting probabilities totaling exactly 100%.

## Original item values and chances

Tier chances do not change with the card pool or expected return. Value bands are relative to the game pack price. Max uses Common and a Grail band starting around 5× cost. Ultra is capped at 20× the pack price: the $1 pack cannot award more than $20, the $5 pack cannot award more than $100, and the $100 pack cannot award more than $2,000. The cap also applies to sparse-pool fallback cards. High-end catalog values were fitted to the existing maximum $2,000 chase so all 800 originals remain obtainable; previously vaulted card values are preserved. Sparse bands use the nearest unused original card; the game always displays the actual available range.

Within each tier, cheaper cards are more common: normalized weight is (lowest value / item value)^8, mixed with a 0.0000001 minimum share per card. The game lists each card’s actual unconditional chance in What’s inside and computes its own average virtual return from these same probabilities. This avoids treating every high-value card as equally likely. Every original card remains reachable. These item chances and returns are specific to this simulator.

## Primary sources

- [Starter pack](https://www.crowncards.com/packs/pok-mon-starter-pack) — open Mode to read Normal, High, Max and Ultra.
- [Select pack](https://www.crowncards.com/packs/pok-mon-select-pack) — open Mode to read Normal, High, Max and Ultra.
- [Basic pack](https://www.crowncards.com/packs/pok-mon-basic-pack) — open Mode to read Normal, High, Max and Ultra.
- [Signature pack](https://www.crowncards.com/packs/pok-mon-signature-pack) — open Mode to read Normal, High, Max and Ultra.
- [Bronze pack](https://www.crowncards.com/packs/pok-mon-bronze-pack) — open Mode to read Normal, High, Max and Ultra.
- [Silver pack](https://www.crowncards.com/packs/pok-mon-silver-pack) — open Mode to read Normal, High, Max and Ultra.
- [Gold pack](https://www.crowncards.com/packs/pok-mon-gold-pack) — open Mode to read Normal, High, Max and Ultra.

## Common streaks

Each pull is independent and uses the selected mode’s published tier probabilities. For the $1 Starter profile, Common chances are 60% Normal, 80% High, 90% Max and 85% Ultra. The rarity-color animation does not select or change the card; the pull is saved when the pack is purchased. Repeated Commons can occur with these odds.


Accounts/mobile update: Gamble is now 90% Common / 10% Grail for every pack, overriding any earlier 50/50 description. Wild remains disabled in Gamble.
