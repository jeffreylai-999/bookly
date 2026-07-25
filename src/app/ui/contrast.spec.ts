/**
 * WCAG AA contrast regression test for the badge and semantic-status color
 * tokens declared in `src/styles.css` (`@theme`). Hex values below are
 * hard-coded copies of the design tokens (design constants) — this spec
 * documents and guards the ratios that were verified when the tokens were
 * darkened to meet AA (see DESIGN.md §1.1/§1.2 and
 * docs/superpowers/specs/2026-07-25-ui-kit-design.md).
 */

const AA_NORMAL_TEXT_MIN = 4.5;

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number): number => {
    const normalized = c / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };
  const [rl, gl, bl] = [channel(r), channel(g), channel(b)];
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

/** WCAG 2.x contrast ratio between two solid hex colors (e.g. "#1A754D"). */
function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexToRgb(hexA));
  const lumB = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Alpha-blends a translucent foreground color over a solid background (e.g. rgba badge bg over white). */
function alphaBlendOverWhite(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  const blend = (c: number): number => Math.round(alpha * c + (1 - alpha) * 255);
  return `#${[blend(r), blend(g), blend(b)]
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`;
}

// Tokens copied from src/styles.css @theme.
const SURFACE = '#ffffff';

const BADGE_GREEN_BG = '#e3f3eb';
const BADGE_GREEN_TEXT = '#1a754d';
const BADGE_AMBER_BG = '#fcefdc';
const BADGE_AMBER_TEXT = '#935c10';
const BADGE_RED_BG = '#fbe3e7';
const BADGE_RED_TEXT = '#be2539';
const BADGE_CYAN_BG = '#e5f6f9';
const BADGE_CYAN_TEXT = '#027a8f';
const BADGE_NEUTRAL_BG = '#eef2f7';
const BADGE_NEUTRAL_TEXT = '#3a4556';
const BADGE_PINK_BG = '#fce4f0';
const BADGE_PINK_TEXT = '#b9266e';
// Purple badge bg is translucent — composite over white (its usual surface) first.
const BADGE_PURPLE_FG = '#7c59d3';
const BADGE_PURPLE_ALPHA = 0.14;
const BADGE_PURPLE_TEXT = '#5b3db8';

const COLOR_SUCCESS = '#1a754d';
const COLOR_DANGER = '#be2539';

describe('contrastRatio helper', () => {
  it('computes known WCAG example ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('is symmetric regardless of argument order', () => {
    expect(contrastRatio(BADGE_GREEN_TEXT, BADGE_GREEN_BG)).toBeCloseTo(
      contrastRatio(BADGE_GREEN_BG, BADGE_GREEN_TEXT),
      5,
    );
  });
});

describe('badge text/bg pairs meet WCAG AA (>= 4.5:1)', () => {
  it('green', () => {
    expect(contrastRatio(BADGE_GREEN_TEXT, BADGE_GREEN_BG)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT_MIN,
    );
  });

  it('amber', () => {
    expect(contrastRatio(BADGE_AMBER_TEXT, BADGE_AMBER_BG)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT_MIN,
    );
  });

  it('red', () => {
    expect(contrastRatio(BADGE_RED_TEXT, BADGE_RED_BG)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT_MIN,
    );
  });

  it('cyan', () => {
    expect(contrastRatio(BADGE_CYAN_TEXT, BADGE_CYAN_BG)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT_MIN,
    );
  });

  it('neutral', () => {
    expect(contrastRatio(BADGE_NEUTRAL_TEXT, BADGE_NEUTRAL_BG)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT_MIN,
    );
  });

  it('pink', () => {
    expect(contrastRatio(BADGE_PINK_TEXT, BADGE_PINK_BG)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT_MIN,
    );
  });

  it('purple (translucent bg composited over white)', () => {
    const compositeBg = alphaBlendOverWhite(BADGE_PURPLE_FG, BADGE_PURPLE_ALPHA);
    expect(contrastRatio(BADGE_PURPLE_TEXT, compositeBg)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT_MIN,
    );
  });
});

describe('semantic status colors meet WCAG AA on white', () => {
  it('success on white', () => {
    expect(contrastRatio(COLOR_SUCCESS, SURFACE)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT_MIN);
  });

  it('danger on white', () => {
    expect(contrastRatio(COLOR_DANGER, SURFACE)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT_MIN);
  });

  it('success on the green badge bg (icon chips reuse the badge palette)', () => {
    expect(contrastRatio(COLOR_SUCCESS, BADGE_GREEN_BG)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT_MIN,
    );
  });

  it('danger on the red badge bg (icon chips reuse the badge palette)', () => {
    expect(contrastRatio(COLOR_DANGER, BADGE_RED_BG)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT_MIN);
  });
});
