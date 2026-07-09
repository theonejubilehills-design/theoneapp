---
name: Ultra-Premium Wellness
colors:
  surface: '#1a110d'
  surface-dim: '#1a110d'
  surface-bright: '#423732'
  surface-container-lowest: '#140c08'
  surface-container-low: '#231a15'
  surface-container: '#271e19'
  surface-container-high: '#322823'
  surface-container-highest: '#3d322d'
  on-surface: '#f1dfd7'
  on-surface-variant: '#dcc1b5'
  inverse-surface: '#f1dfd7'
  inverse-on-surface: '#392e29'
  outline: '#a38c81'
  outline-variant: '#55433a'
  surface-tint: '#ffb690'
  primary: '#ffb690'
  on-primary: '#552100'
  primary-container: '#d9763d'
  on-primary-container: '#4a1c00'
  inverse-primary: '#9a460f'
  secondary: '#f4bc72'
  on-secondary: '#452b00'
  secondary-container: '#6a4300'
  on-secondary-container: '#e9b268'
  tertiary: '#6bd4f5'
  on-tertiary: '#003543'
  tertiary-container: '#259dbc'
  on-tertiary-container: '#002e3a'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdbca'
  primary-fixed-dim: '#ffb690'
  on-primary-fixed: '#341100'
  on-primary-fixed-variant: '#783200'
  secondary-fixed: '#ffddb5'
  secondary-fixed-dim: '#f4bc72'
  on-secondary-fixed: '#2a1800'
  on-secondary-fixed-variant: '#633f00'
  tertiary-fixed: '#b5ebff'
  tertiary-fixed-dim: '#6bd4f5'
  on-tertiary-fixed: '#001f28'
  on-tertiary-fixed-variant: '#004e60'
  background: '#1a110d'
  on-background: '#f1dfd7'
  surface-variant: '#3d322d'
typography:
  display-lg:
    fontFamily: Playfair Display
    fontSize: 64px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Playfair Display
    fontSize: 40px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Playfair Display
    fontSize: 48px
    fontWeight: '600'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: '500'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
    letterSpacing: 0.01em
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.0'
    letterSpacing: 0.1em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 8px
  container-max: 1440px
  gutter: 24px
  margin-mobile: 20px
  margin-desktop: 80px
  section-gap: 120px
---

## Brand & Style

This design system embodies a cinematic, ultra-premium aesthetic tailored for the high-end wellness and longevity market. The personality is exclusive, commanding, and serene—evoking the feeling of a private sanctuary. 

The style utilizes **Minimalism** combined with **Glassmorphism**. It relies on deep, matte surfaces, generous whitespace (the "luxury of space"), and high-end editorial layouts. Visual interest is generated through dramatic contrast between deep black backgrounds and luminous, high-contrast typography. Interactions should feel deliberate and smooth, mirroring the precision of a high-performance training facility or a world-class resort.

## Colors

The palette is rooted in a nocturnal, "Matte Black" environment to reduce cognitive load and emphasize focus. 

- **Primary (Burnt Orange):** Used for primary calls-to-action, active indicators, and brand signatures. It represents energy and the heat of performance.
- **Secondary (Champagne Gold):** Reserved exclusively for premium status, achievement tiers, and "Gold" membership signifiers. It should be used sparingly to maintain its perceived value.
- **Surface Strategy:** The UI uses layered blacks. The primary background is the deepest black, while cards and containers use a subtle "Charcoal" to create depth without relying on traditional borders.

## Typography

Typography is the primary driver of the "Editorial" feel. 

- **Headlines:** Use Playfair Display. This serif provides a classical, authoritative contrast against the modern UI. High-level displays should use tight letter spacing for a dramatic, cinematic look.
- **Body & Functional Text:** Use Inter for maximum legibility. Body copy should be set with generous line heights to ensure a relaxed reading experience.
- **Labels:** Use uppercase Inter for category tags and status labels to differentiate them from functional UI text.

## Layout & Spacing

This design system utilizes a **Fixed Grid** for desktop and a **Fluid Grid** for mobile devices. 

On desktop, content is centered within a 1440px container with expansive 80px side margins to create an "airy" boutique feel. Section vertical spacing is intentionally aggressive (120px+) to allow the eye to rest and emphasize high-quality imagery. Elements should align to an 8px base grid, but layout compositions should favor asymmetrical, editorial placements of text over images.

## Elevation & Depth

Hierarchy is established through **Tonal Layering** and **Glassmorphism**. 

1. **Base Layer:** #0B0B0B (Deep Matte).
2. **Surface Layer:** #171717 (Charcoal) with a subtle 1px border of #FFFFFF at 5% opacity.
3. **Glass Layer:** Applied to navigation bars and overlays. Use a backdrop blur of 20px-40px with a background fill of #000000 at 40% opacity.

Avoid drop shadows. Depth is created by "light" leaking from the accent colors and the contrast between matte and translucent surfaces.

## Shapes

The shape language is sophisticated and sharp. Use **Soft (0.25rem)** roundedness for standard elements like inputs and smaller buttons. Use **Sharp (0px)** for large editorial image containers and hero sections to maintain a disciplined, architectural look. Circular elements are reserved strictly for avatars and specific iconography.

## Components

### Buttons
- **Primary:** Burnt Orange (#C96A32) background, white text. Wide horizontal padding (32px), 48px height.
- **Ghost:** 1px white border at 20% opacity. Transparent background. Transitions to 100% opacity on hover.

### Cards
- **Editorial Card:** Large image-led cards with text overlays. Use a bottom-to-top black gradient (0% to 80% alpha) to ensure text legibility.
- **Frosted Card:** Used for secondary data. 20px blur, 1px subtle top-border.

### Membership Badges
- **Basic:** Warm Gray (#B8B8B8) outline, uppercase text.
- **Gold:** Champagne Gold (#D9A45C) text with a subtle glow effect (radial gradient behind the text).
- **Wellness:** White text on a Burnt Orange micro-pill.

### Input Fields
- Underlined style only (1px white at 20% opacity) to maintain minimalism. Transitions to Burnt Orange on focus.

### Iconography
- Use 1.5px stroke weight. Avoid filled icons unless indicating an active toggle state. Icons should be 24px default.