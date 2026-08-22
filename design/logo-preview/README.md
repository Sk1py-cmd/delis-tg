# DELIS official source assets

These previews are derived from `photo_2026-07-28_01-50-35.jpg`, uploaded by the brand owner.

- Source SHA-256: `274ea265d6b855e61efb9e69e21954d0f96893b85e9df748359796ca3beeba04`
- Source geometry: 1254×1254 JPEG
- No letterform, monogram, wordmark, tagline, spacing, or proportion was redrawn.
- `mark*`, `wordmark*`, and `lockup*` use pixel crops from the source only.
- `*-white.png` files preserve the original near-white JPEG background for comparison.
- The regular `.png` files remove only that background into a smooth 8-bit alpha channel.
- `app-icon.png` centers the exact transparent monogram on a fully transparent canvas, without a card or disc.

Source crop regions before edge trimming:

| Asset | Pixel crop |
|---|---|
| Mark | `420x270+420+300` |
| Wordmark and tagline | `1080x315+85+570` |
| Full lockup | `1080x620+85+280` |

Production copies live in `public/brand/` and `public/icons/`.
