// User preferences (Android: SharedPrefManager + Font/Theme/RandomPoemLayout repositories),
// persisted in localStorage.
import { useSyncExternalStore } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type PoemFont = 'Nastaliq' | 'Vazirmatn' | 'Dana' | 'Serif';
export type RandomPoemLayout = 'HIDDEN' | 'CLASSIC' | 'PAPER_LEAF' | 'JADVAL_LEAF';

export interface Settings {
  theme: ThemePreference;
  poemFont: PoemFont;
  poemFontSizePercent: number;
  randomPoemLayout: RandomPoemLayout;
  randomPoemLayoutIntroSeen: boolean;
  showHighlightHint: boolean;
}

export const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'خودکار' },
  { value: 'light', label: 'روز' },
  { value: 'dark', label: 'شب' },
];

export const FONT_OPTIONS: { value: PoemFont; label: string; family: string; baseSize: number }[] = [
  { value: 'Nastaliq', label: 'نستعلیق', family: "'IranNastaliq', serif", baseSize: 26 },
  { value: 'Vazirmatn', label: 'وزیر متن', family: "'Vazirmatn', sans-serif", baseSize: 17 },
  { value: 'Dana', label: 'دانا', family: "'Dana', sans-serif", baseSize: 17 },
  { value: 'Serif', label: 'سریف', family: 'serif', baseSize: 18 },
];

export const RANDOM_LAYOUT_OPTIONS: { value: RandomPoemLayout; label: string }[] = [
  { value: 'HIDDEN', label: 'نشانم نده' },
  { value: 'CLASSIC', label: 'کلاسیک' },
  { value: 'PAPER_LEAF', label: 'مدرن' },
  { value: 'JADVAL_LEAF', label: 'تابلو' },
];

export const FONT_SIZE = { min: 80, max: 160, step: 10, default: 100 };

const DEFAULTS: Settings = {
  theme: 'system',
  poemFont: 'Dana',
  poemFontSizePercent: FONT_SIZE.default,
  randomPoemLayout: 'CLASSIC',
  randomPoemLayoutIntroSeen: false,
  showHighlightHint: true,
};

const STORAGE_KEY = 'jaamesokhan.settings';

function load(): Settings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Settings>;
    return { ...DEFAULTS, ...stored };
  } catch {
    return DEFAULTS;
  }
}

let current: Settings = load();
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Storage full or blocked: keep the in-memory value.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings);
}

export function poemFontStyle(settings: Settings): { fontFamily: string; fontSize: string } {
  const font = FONT_OPTIONS.find((f) => f.value === settings.poemFont) ?? FONT_OPTIONS[2];
  return { fontFamily: font.family, fontSize: `${(font.baseSize * settings.poemFontSizePercent) / 100}px` };
}
