<script setup lang="ts">
// Fixed 0-5 axes, same order everywhere (DESIGN §9.2, COMPARE_SPEC §4). Unknown is "—"
// with no bar, never zero. Values are indicative and method-versioned.
export interface TraitRow {
  code: string;
  label: string;
  values: (number | null)[];
}
const props = defineProps<{ rows: TraitRow[]; series: string[]; method?: string }>();
const pct = (v: number) => `${Math.max(0, Math.min(5, v)) * 20}%`;
const fmt = (v: number | null) => (v === null ? '—' : v.toFixed(1));
// Spectral colour (ADR-019): the first series takes its pole colour, with the same trait groups as
// the My Spectrum Fresh ↔ Warm axis (spectrum-v1); other traits and the comparison series stay ink.
const FRESH = new Set(['fresh', 'green', 'marine_mineral']);
const WARM = new Set(['warm', 'spicy', 'smoky']);
const barClass = (code: string, i: number) => (i > 0 ? 'bg-tier-base' : FRESH.has(code) ? 'bg-spectrum-fresh' : WARM.has(code) ? 'bg-spectrum-warm' : 'bg-ink');
void props;
</script>

<template>
  <section class="bay rounded-card p-4 md:p-5" aria-label="Scent traits">
    <table class="w-full border-collapse text-[14px]">
      <caption class="pb-3 text-left text-[12px] text-ink-3">
        Indicative 0-5 scale<span v-if="method"> · method <span class="readout">{{ method }}</span></span>. “—” means not measured.
      </caption>
      <thead>
        <tr class="text-left">
          <th scope="col" class="etch w-28 pb-2 font-normal">Trait</th>
          <th v-for="s in series" :key="s" scope="col" class="etch pb-2 font-normal normal-case tracking-normal">{{ s }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.code" class="border-t border-line">
          <th scope="row" class="py-2 pr-3 text-left font-normal text-ink-2">{{ r.label }}</th>
          <td v-for="(v, i) in r.values" :key="i" class="py-2 pr-2">
            <div class="flex items-center gap-3">
              <div class="relative h-[6px] flex-1 overflow-hidden rounded-[2px] bg-sunken" aria-hidden="true">
                <div class="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0,transparent_calc(20%-1px),var(--line)_calc(20%-1px),var(--line)_20%)]" />
                <div v-if="v !== null" data-bar class="absolute inset-y-0 left-0 rounded-[2px]" :class="barClass(r.code, i)" :style="{ width: pct(v) }" />
              </div>
              <span class="readout w-8 text-right text-[13px]" :class="v === null ? 'text-ink-3' : 'text-ink'" :data-testid="`trait-${r.code}-${i}`">{{ fmt(v) }}</span>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
