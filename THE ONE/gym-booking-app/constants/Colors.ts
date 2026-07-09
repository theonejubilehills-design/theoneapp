// ─────────────────────────────────────────────────────────────────────────────
// THE ONE — Brand Color System
// Primary experience: Dark (forced). Black dominates 80–85%.
// Burnt orange (#B84600) used sparingly as a luxury accent only.
// ─────────────────────────────────────────────────────────────────────────────

const accent = '#B84600';       // Burnt Orange — THE ONE signature accent
const accentMuted = '#8A3500';  // Deeper burnt for hover/pressed accent states

export default {
  light: {
    // Light mode uses deep charcoal — NOT white. Still luxurious.
    text: '#F5F5F5',
    secondaryText: '#A7A7A7',
    background: '#0B0B0B',
    card: '#151515',
    tint: accent,
    tabIconDefault: '#8C7B6B',
    tabIconSelected: accent,
    border: 'rgba(184, 70, 0, 0.15)',
  },
  dark: {
    text: '#F5F5F5',            // Warm off-white
    secondaryText: '#A7A7A7',   // Muted warm grey
    background: '#0B0B0B',      // Deep matte black
    card: '#151515',            // Rich charcoal surface
    tint: accent,
    tabIconDefault: '#8C7B6B',
    tabIconSelected: accent,
    border: 'rgba(184, 70, 0, 0.12)',
  },
};
