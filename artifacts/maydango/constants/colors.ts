/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    text: '#1c312d',
    tint: '#266457',
    background: '#f9f7f1',
    foreground: '#1c312d',
    card: '#fcfbf8',
    cardForeground: '#1c312d',
    primary: '#266457',
    primaryForeground: '#f9f7f1',
    secondary: '#f19c5f',
    secondaryForeground: '#1c312d',
    muted: '#eeeae3',
    mutedForeground: '#5a726e',
    accent: '#f4db90',
    accentForeground: '#1c312d',
    destructive: '#b7483f',
    destructiveForeground: '#ffffff',
    border: '#ded9cf',
    input: '#ded9cf',
  },
  dark: {
    text: '#f6f2e9',
    tint: '#86cab8',
    background: '#162724',
    foreground: '#f6f2e9',
    card: '#1f322f',
    cardForeground: '#f6f2e9',
    primary: '#86cab8',
    primaryForeground: '#162724',
    secondary: '#e59861',
    secondaryForeground: '#162724',
    muted: '#2c3f3c',
    mutedForeground: '#c0b8a5',
    accent: '#dfc168',
    accentForeground: '#162724',
    destructive: '#d66c60',
    destructiveForeground: '#ffffff',
    border: '#3b4f4b',
    input: '#3b4f4b',
  },
  radius: 16,
};

export default colors;
