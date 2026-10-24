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
    text: '#18352b',
    tint: '#214c3d',
    background: '#f6f6ef',
    foreground: '#18352b',
    card: '#ffffff',
    cardForeground: '#18352b',
    primary: '#214c3d',
    primaryForeground: '#f7f8ef',
    secondary: '#e9eddf',
    secondaryForeground: '#214c3d',
    muted: '#edf0e7',
    mutedForeground: '#718076',
    accent: '#c6e57d',
    accentForeground: '#18352b',
    destructive: '#b7483f',
    destructiveForeground: '#ffffff',
    border: '#e4e8dc',
    input: '#dce2d5',
  },
  dark: {
    text: '#f2f5eb',
    tint: '#c6e57d',
    background: '#13251f',
    foreground: '#f2f5eb',
    card: '#1c332b',
    cardForeground: '#f2f5eb',
    primary: '#c6e57d',
    primaryForeground: '#18352b',
    secondary: '#2b4338',
    secondaryForeground: '#f2f5eb',
    muted: '#263d33',
    mutedForeground: '#a4b4a7',
    accent: '#c6e57d',
    accentForeground: '#18352b',
    destructive: '#d66c60',
    destructiveForeground: '#ffffff',
    border: '#345044',
    input: '#345044',
  },
  radius: 18,
};

export default colors;
