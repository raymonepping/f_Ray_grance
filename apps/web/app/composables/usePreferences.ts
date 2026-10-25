// Per-device appearance preferences (localStorage). Applied to <html> data attributes,
// which the pre-paint script in /prefs.js also reads — no theme flash, no hydration mismatch.
export type ThemeChoice = 'system' | 'dark' | 'light';

interface Prefs {
  theme: ThemeChoice;
  sidebarCollapsed: boolean;
  reduceTransparency: boolean;
  reduceMotion: boolean;
}

const KEY = 'fray:prefs';
const DEFAULTS: Prefs = { theme: 'system', sidebarCollapsed: false, reduceTransparency: false, reduceMotion: false };

function load(): Prefs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function usePreferences() {
  const prefs = useState<Prefs>('prefs', () => (import.meta.client ? load() : { ...DEFAULTS }));
  const systemLight = useState<boolean>('prefs:systemLight', () => import.meta.client && matchMedia('(prefers-color-scheme: light)').matches);

  function apply(): void {
    if (!import.meta.client) return;
    const d = document.documentElement;
    systemLight.value = matchMedia('(prefers-color-scheme: light)').matches;
    const resolved = prefs.value.theme === 'system' ? (systemLight.value ? 'light' : 'dark') : prefs.value.theme;
    d.dataset.theme = resolved;
    if (prefs.value.reduceTransparency) d.dataset.transparency = 'reduce';
    else delete d.dataset.transparency;
    if (prefs.value.reduceMotion) d.dataset.motion = 'reduce';
    else delete d.dataset.motion;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'light' ? '#F6F5F1' : '#101C2B');
  }

  function set<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
    prefs.value = { ...prefs.value, [key]: value };
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs.value));
    } catch {
      /* private mode: preference lasts for this page only */
    }
    apply();
  }

  const resolvedTheme = computed<'dark' | 'light'>(() =>
    prefs.value.theme === 'system' ? (systemLight.value ? 'light' : 'dark') : prefs.value.theme,
  );

  return { prefs, set, apply, resolvedTheme };
}
