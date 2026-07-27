/**
 * WCAG AA contrast regression test for the badge and semantic-status color
 * tokens declared in `src/styles.css` (`@theme`). Hex values below are
 * hard-coded copies of the design tokens (design constants) — this spec
 * documents and guards the ratios that were verified when the tokens were
 * darkened to meet AA (see DESIGN.md §1.1/§1.2 and
 * docs/superpowers/specs/2026-07-25-ui-kit-design.md).
 */

const AA_NORMAL_TEXT_MIN = 4.5;
/** SC 1.4.3 large text (>=18.66px bold / 24px regular) and SC 1.4.11 non-text UI. */
const AA_LARGE_TEXT_AND_NON_TEXT_MIN = 3;

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
    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
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
  return `#${[blend(r), blend(g), blend(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
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

const CANVAS = '#f5f7fa';
const ROW_HOVER = '#f8fafc';
const CONTROL = '#eef2f7';
const CONTROL_HOVER = '#f0f3f7';
const SIDEBAR = '#2e3b4e';

const COLOR_BRAND = '#039db7';
const COLOR_BRAND_DARK = '#027a8f';
const COLOR_BRAND_STRONG = '#016b7e';
const COLOR_INK = '#1b2533';
const COLOR_INK_HEADING = '#2e3b4e';
const COLOR_INK_MUTED = '#616c7d';
const COLOR_INK_SOFT = '#3a4556';
const COLOR_CHART_CYAN = '#45bbce';

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
    expect(contrastRatio(BADGE_RED_TEXT, BADGE_RED_BG)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT_MIN);
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
    expect(contrastRatio(COLOR_SUCCESS, BADGE_GREEN_BG)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT_MIN);
  });

  it('danger on the red badge bg (icon chips reuse the badge palette)', () => {
    expect(contrastRatio(COLOR_DANGER, BADGE_RED_BG)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT_MIN);
  });
});

/**
 * Button labels are 12–14px bold. WCAG counts "large text" as >=18.66px bold,
 * so these need the full 4.5:1 — which is why the fills and label text use
 * `brand-dark`/`brand-strong` rather than `brand` (3.23:1 either direction).
 */
describe('button colors meet WCAG AA', () => {
  it('primary: white label on the brand-dark fill', () => {
    expect(contrastRatio(SURFACE, COLOR_BRAND_DARK)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT_MIN);
  });

  it('primary hover: white label on the brand-strong fill', () => {
    expect(contrastRatio(SURFACE, COLOR_BRAND_STRONG)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT_MIN);
  });

  it('outline/pill: brand-dark label on the white fill', () => {
    expect(contrastRatio(COLOR_BRAND_DARK, SURFACE)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT_MIN);
  });

  it('outline/pill hover: brand-dark label on the cyan badge fill', () => {
    expect(contrastRatio(COLOR_BRAND_DARK, BADGE_CYAN_BG)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT_MIN,
    );
  });

  it('pill-muted: ink-soft label on white and on its hover fill', () => {
    expect(contrastRatio(COLOR_INK_SOFT, SURFACE)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT_MIN);
    expect(contrastRatio(COLOR_INK_SOFT, CONTROL_HOVER)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT_MIN);
  });

  it('the brand border is non-text UI, so 3:1 is the bar it must clear', () => {
    expect(contrastRatio(COLOR_BRAND, SURFACE)).toBeGreaterThanOrEqual(
      AA_LARGE_TEXT_AND_NON_TEXT_MIN,
    );
  });
});

describe('toast surfaces meet WCAG AA', () => {
  it('white message on the ink-heading toast', () => {
    expect(contrastRatio(SURFACE, COLOR_INK_HEADING)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT_MIN);
  });

  it('white message on the danger toast', () => {
    expect(contrastRatio(SURFACE, COLOR_DANGER)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT_MIN);
  });
});

/**
 * Muted text is not confined to white. It also sits on the canvas, on hovered
 * table rows, and on the segmented control's track — the darkest of the four.
 * Guard all four grounds, or a token that only passes on white slips through.
 */
describe('body and muted text meet WCAG AA on every ground it lands on', () => {
  const grounds: [string, string][] = [
    ['white', SURFACE],
    ['row hover', ROW_HOVER],
    ['canvas', CANVAS],
    ['control track', CONTROL],
  ];

  for (const [name, bg] of grounds) {
    it(`ink-muted on ${name}`, () => {
      expect(contrastRatio(COLOR_INK_MUTED, bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT_MIN);
    });

    it(`ink on ${name}`, () => {
      expect(contrastRatio(COLOR_INK, bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT_MIN);
    });
  }

  it('ink-heading on white (card and page titles)', () => {
    expect(contrastRatio(COLOR_INK_HEADING, SURFACE)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT_MIN);
  });

  it('the hero KPI numeral is 36px/800, so brand only needs the large-text bar', () => {
    expect(contrastRatio(COLOR_BRAND, SURFACE)).toBeGreaterThanOrEqual(
      AA_LARGE_TEXT_AND_NON_TEXT_MIN,
    );
  });
});

/**
 * SC 1.4.11: a focus indicator needs 3:1 against what surrounds it. The ring is
 * two solid layers rather than one translucent wash for exactly this reason —
 * `rgba(3,157,183,0.32)` over white measured 1.44:1.
 */
describe('focus indicators meet WCAG 2.2 SC 1.4.11 (>= 3:1)', () => {
  for (const [name, bg] of [
    ['white', SURFACE],
    ['canvas', CANVAS],
    ['control track', CONTROL],
  ] as [string, string][]) {
    it(`light ring against ${name}`, () => {
      expect(contrastRatio(COLOR_BRAND_STRONG, bg)).toBeGreaterThanOrEqual(
        AA_LARGE_TEXT_AND_NON_TEXT_MIN,
      );
    });
  }

  it('light ring against its own inner layer, which is what makes it read as a ring', () => {
    // The inner layer is --color-surface, so this also covers the case the
    // single-layer ring failed: focus on a teal primary button, where the outer
    // ring would otherwise sit directly against a similar teal.
    expect(contrastRatio(COLOR_BRAND_STRONG, SURFACE)).toBeGreaterThanOrEqual(
      AA_LARGE_TEXT_AND_NON_TEXT_MIN,
    );
  });

  it('dark ring against the sidebar ground', () => {
    expect(contrastRatio(COLOR_CHART_CYAN, SIDEBAR)).toBeGreaterThanOrEqual(
      AA_LARGE_TEXT_AND_NON_TEXT_MIN,
    );
  });
});

describe('sidebar text meets WCAG AA on the dark ground', () => {
  const overSidebar = (alpha: number): string => {
    const [r, g, b] = hexToRgb(SIDEBAR);
    const blend = (c: number): number => Math.round(alpha * 255 + (1 - alpha) * c);
    return `#${[blend(r), blend(g), blend(b)]
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')}`;
  };

  it('active nav label (white)', () => {
    expect(contrastRatio(SURFACE, SIDEBAR)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT_MIN);
  });

  it('inactive nav label (white at 68%)', () => {
    expect(contrastRatio(overSidebar(0.68), SIDEBAR)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT_MIN);
  });
});
