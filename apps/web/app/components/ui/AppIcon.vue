<script setup lang="ts">
// One icon set (Lucide line icons, 1.75 stroke, 20px default), DESIGN §2.3.
import {
  Library, Compass, Columns2, Dna, Settings, FlaskConical, Search, Plus, Sun, Moon, Monitor, Menu, X,
  ChevronsLeft, ChevronsRight, LogOut, WifiOff, CircleAlert, Info, ExternalLink, ShieldCheck, Lock, ArrowRight, GraduationCap, BookOpen, Sparkles, ArrowLeft, Check, AudioWaveform,
} from 'lucide-vue-next';

const ICONS = {
  library: Library, compass: Compass, columns: Columns2, dna: Dna, settings: Settings, flask: FlaskConical,
  search: Search, plus: Plus, sun: Sun, moon: Moon, monitor: Monitor, menu: Menu, close: X,
  collapse: ChevronsLeft, expand: ChevronsRight, logout: LogOut, offline: WifiOff, alert: CircleAlert,
  info: Info, external: ExternalLink, shield: ShieldCheck, lock: Lock, arrow: ArrowRight, academy: GraduationCap, book: BookOpen, explain: Sparkles, back: ArrowLeft, check: Check, spectrum: AudioWaveform,
} as const;

const props = withDefaults(defineProps<{ name: keyof typeof ICONS; size?: number }>(), { size: 20 });
const Comp = computed(() => ICONS[props.name]);
</script>

<template>
  <component :is="Comp" :size="size" :stroke-width="1.75" aria-hidden="true" focusable="false" class="shrink-0" />
</template>
