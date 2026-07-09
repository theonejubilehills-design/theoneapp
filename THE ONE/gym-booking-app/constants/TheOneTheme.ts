import { Platform } from 'react-native';

// ─────────────────────────────────────────────────────────────────────────────
// THE ONE — Central Design Token System
// Luxury wellness brand identity tokens.
// ─────────────────────────────────────────────────────────────────────────────

export const TheOneColors = {
  // Core palette
  black:           '#0B0B0B',   // Dominant background (rich luxury black)
  charcoal:        '#151515',   // Card / surface (dark surface)
  charcoalLight:   '#1E1B18',   // Elevated surface
  charcoalBorder:  'rgba(255, 255, 255, 0.08)',   // Subtle border
  accent:          '#e25d1b',   // Ferocious Fox Orange accent
  accentDark:      '#b8460e',   // Deeper orange for pressed states
  accentFaint:     'rgba(226, 93, 27, 0.08)',  // Accent wash / selection bg
  accentBorder:    'rgba(226, 93, 27, 0.22)',  // Thin accent border
  // Text
  textPrimary:     '#F5F5F5',   // Warm off-white
  textSecondary:   '#A7A7A7',   // Muted warm grey
  textTertiary:    '#8C7B6B',   // Faint label text
  textInverse:     '#0B0B0B',   // Black text on accent buttons
  // Dividers
  divider:         'rgba(226, 93, 27, 0.18)',  // Thin orange divider
  dividerSubtle:   'rgba(255, 255, 255, 0.06)', // Subtle white divider
  // Status
  success:         '#6B9E76',   // Muted sage green
  error:           '#C46057',   // Muted warm red
  warning:         '#e25d1b',   // Same as accent
};

export const TheOneTypography = {
  // Headline — editorial, luxury
  headlineFamily: Platform.OS === 'web' ? 'Cormorant Garamond, Georgia, serif' : 'Cormorant Garamond',
  // Body & UI — Apple-inspired clean
  bodyFamily:     Platform.OS === 'web' ? 'Inter, SF Pro Display, -apple-system, sans-serif' : 'Inter',
  // Numbers & IDs — sophisticated mono-feel
  numberFamily:   Platform.OS === 'web' ? 'Neue Montreal, Inter, -apple-system, sans-serif' : 'Inter',

  // Scale
  hero:     { fontSize: 48, lineHeight: 52, letterSpacing: 1 },
  h1:       { fontSize: 36, lineHeight: 42, letterSpacing: 0.5 },
  h2:       { fontSize: 28, lineHeight: 34, letterSpacing: 0.3 },
  h3:       { fontSize: 22, lineHeight: 28, letterSpacing: 0.2 },
  label:    { fontSize: 11, lineHeight: 16, letterSpacing: 2.5 },   // Spaced caps
  body:     { fontSize: 15, lineHeight: 24, letterSpacing: 0.1 },
  bodySmall:{ fontSize: 13, lineHeight: 20, letterSpacing: 0.1 },
  number:   { fontSize: 32, lineHeight: 38, letterSpacing: -0.5 },  // Neue Montreal
};

export const TheOneSpacing = {
  xs:   4,
  sm:   8,
  md:   16,
  lg:   24,
  xl:   32,
  xxl:  48,
  xxxl: 64,
};

export const TheOneBorderRadius = {
  none:   0,    // Sharp — only for full-bleed images
  xs:     6,    // Subtle rounding on small elements
  sm:     10,   // Inputs, tags, badges
  md:     14,   // Cards, drawers, modals
  lg:     18,   // Large cards
  pill:   100,  // Full pills
};

export const TheOneShadow = {
  soft: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 4,
  },
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
};

// Hero Action button style (used for Book Experience, Confirm Session, Renew Membership)
export const heroButtonStyle = {
  backgroundColor: TheOneColors.accent,
  paddingVertical: 16,
  paddingHorizontal: 24,
  borderRadius: TheOneBorderRadius.md, // 14px rounded corners
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  flexDirection: 'row' as const,
};

export const heroButtonTextStyle = {
  color: '#FFFFFF',
  fontSize: 13,
  fontWeight: '700' as const,
  letterSpacing: 2,
  fontFamily: TheOneTypography.bodyFamily,
};

// Outlined Primary CTA button style (used for general primary buttons)
export const primaryButtonStyle = {
  backgroundColor: 'transparent',
  borderWidth: 1.5,
  borderColor: TheOneColors.accent,
  paddingVertical: 16,
  paddingHorizontal: 24,
  borderRadius: TheOneBorderRadius.md, // rounded corners
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  flexDirection: 'row' as const,
};

export const primaryButtonTextStyle = {
  color: TheOneColors.textPrimary,
  fontSize: 13,
  fontWeight: '700' as const,
  letterSpacing: 2,
  fontFamily: TheOneTypography.bodyFamily,
};

// Secondary button style (used for secondary choices)
export const secondaryButtonStyle = {
  backgroundColor: TheOneColors.charcoal,
  borderWidth: 1,
  borderColor: 'rgba(255, 255, 255, 0.08)',
  paddingVertical: 16,
  paddingHorizontal: 24,
  borderRadius: TheOneBorderRadius.md, // rounded
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  flexDirection: 'row' as const,
};

export const secondaryButtonTextStyle = {
  color: '#FFFFFF',
  fontSize: 13,
  fontWeight: '700' as const,
  letterSpacing: 2,
  fontFamily: TheOneTypography.bodyFamily,
};

// Thin burnt-orange horizontal line (signature divider)
export const accentDivider = {
  height: 1,
  backgroundColor: TheOneColors.accent,
  width: '100%' as const,
};

// Bottom-border-only input (luxury input style)
export const luxuryInputStyle = {
  backgroundColor: 'transparent',
  borderWidth: 0,
  borderBottomWidth: 1,
  borderBottomColor: TheOneColors.charcoalBorder,
  paddingVertical: 12,
  paddingHorizontal: 0,
  color: TheOneColors.textPrimary,
  fontSize: 16,
  fontFamily: TheOneTypography.bodyFamily,
};

export default TheOneColors;
