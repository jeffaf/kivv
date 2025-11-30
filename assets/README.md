# kivv Brand Assets

Visual identity for the kivv arXiv Research Assistant project.

## Files

### Hero Banners (1200x400px)

**`hero.svg`** - Light mode hero banner
- Modern, professional design
- Academic blue-to-purple gradient
- Cyan AI accent color
- Features: wordmark, tagline, feature badges, document icon with AI sparkle
- Use in: README header (light theme)

**`hero-dark.svg`** - Dark mode hero banner
- Same design optimized for dark backgrounds
- Lighter gradient colors for better contrast
- Brighter AI accent
- Use in: README header (dark theme)

### Logo (512x512px)

**`logo.svg`** - Square logo/icon
- Stacked paper design with AI sparkle
- "kivv" wordmark at bottom
- Blue-to-purple gradient background
- Use in: Social media, favicons, app icons, documentation

## Design System

### Colors

**Primary Palette (Academic/Research)**
- Deep Blue: `#1e40af`
- Medium Blue: `#3b82f6`
- Light Blue: `#60a5fa`
- Deep Purple: `#7c3aed`
- Medium Purple: `#8b5cf6`
- Light Purple: `#a78bfa`

**Accent (AI/Automation)**
- Cyan: `#06b6d4`
- Bright Cyan: `#22d3ee`

**Neutral (Light Mode)**
- Background: `#f8fafc` to `#f1f5f9`
- Text: `#64748b`
- Lines: `#cbd5e1`

**Neutral (Dark Mode)**
- Background: `#0f172a` to `#1e293b`
- Text: `#94a3b8`
- Lines: `#475569`

### Typography

**Wordmark: "kivv"**
- Font: SF Pro Display (fallback: system sans-serif)
- Weight: 700 (Bold)
- Letter spacing: -2 to -4px (tight, modern)
- Size: 72-120px depending on context

**Tagline: "arXiv Research Assistant"**
- Font: SF Pro Text (fallback: system sans-serif)
- Weight: 400 (Regular)
- Color: Muted gray
- Size: 24-28px

**Monospace (code/tech elements)**
- Font: SF Mono, Monaco, Courier New
- Used for: "SUMMARY" badge text
- Weight: 600-700

### Design Elements

**Document Icon**
- Rounded corners (rx="8" to "12")
- White/dark fill with gradient stroke
- Horizontal lines representing text
- Conveys: research papers, arXiv content

**AI Sparkle**
- 8-ray sparkle symbol
- Cyan gradient fill
- Positioned on document (top-right)
- Conveys: AI-powered automation

**Feature Badges**
- Rounded pill shape (rx="16")
- Transparent color fill (10-30% opacity)
- Colored text matching fill
- Conveys: key product features

**Abstract Paper Stack**
- 3 overlapping rectangles with slight rotation
- Decreasing opacity (back to front: 0.4, 0.6, 1.0)
- Creates depth and dimension
- Conveys: multiple papers, research collection

## Usage in README

The README uses responsive image loading:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/hero-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="assets/hero.svg">
  <img alt="kivv - arXiv Research Assistant" src="assets/hero.svg">
</picture>
```

This automatically shows the appropriate version based on the viewer's theme preference.

## File Sizes

All SVG files are optimized for small size:
- `hero.svg`: ~6KB
- `hero-dark.svg`: ~6KB
- `logo.svg`: ~3KB

Total: ~15KB for complete visual identity

## Converting to PNG

If you need PNG versions (for platforms that don't support SVG):

```bash
# Using ImageMagick
magick convert -background none hero.svg -resize 1200x400 hero.png
magick convert -background none logo.svg -resize 512x512 logo.png

# Using librsvg
rsvg-convert -w 1200 -h 400 hero.svg -o hero.png
rsvg-convert -w 512 -h 512 logo.svg -o logo.png

# Using Inkscape (if installed)
inkscape hero.svg --export-filename=hero.png --export-width=1200
```

## Design Philosophy

The visual identity reflects kivv's core values:

1. **Academic** - Blue/purple palette evokes trust, research, academia
2. **Modern** - Clean typography, minimal design, gradient accents
3. **Technical** - Monospace fonts, precise alignment, developer-friendly
4. **AI-Powered** - Cyan sparkle icon represents automation and intelligence
5. **Lightweight** - Small file sizes, SVG format, fast loading (vibe coding!)

## Brand Guidelines

**DO:**
- Use SVG format when possible (scalable, small size)
- Maintain proper color contrast for accessibility
- Keep wordmark spacing tight and modern
- Use cyan accent sparingly for AI/automation features
- Ensure logo works at small sizes (favicon, social media)

**DON'T:**
- Distort or stretch the logo/wordmark
- Change the color palette (breaks brand identity)
- Add drop shadows or excessive effects
- Use on busy backgrounds without sufficient contrast
- Combine with other gradients or competing visual elements

## License

These brand assets are part of the kivv project and are released under the MIT License.
Free to use, modify, and distribute.
