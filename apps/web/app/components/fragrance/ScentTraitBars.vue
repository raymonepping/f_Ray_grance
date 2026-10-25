<script setup lang="ts">
// Fixed 0–5 axes, same order everywhere (DESIGN §9.2, COMPARE_SPEC §4). Unknown is "—"
// with no bar — never zero. Values are indicative and method-versioned.
export interface TraitRow {
  code: string;
  label: string;
  values: (number | null)[];
}
const props = defineProps<{ rows: TraitRow[]; series: string[]; method?: string }>();
const pct = (v: number) => `${Math.max(0, Math.min(5, v)) * 20}%`;
const fmt = (v: number | null) => (v === null ? '—' : v.toFixed(1));
void props;
</script>

<template>
  <section class="surface-solid rounded-card p-4 md:p-5" aria-label="Scent traits">
    <table class="w-full border-collapse text-sm">
      <caption class="pb-3 text-left text-ink-2">
        Indicative 0–5 scale<span v-if="method"> · method {{ method }}</span>. “—” means not measured.
      </caption>
      <thead>
        <tr class="text-left text-ink-3">
          <th scope="col" class="w-28 pb-2 font-semibold">Trait</th>
          <th v-for="s in series" :key="s" scope="col" class="pb-2 font-semibold">{{ s }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.code" class="border-t border-line">
          <th scope="row" class="py-2 pr-2 text-left font-semibold">{{ r.label }}</th>
          <td v-for="(v, i) in r.values" :key="i" class="py-2 pr-2">
            <div class="flex items-center gap-2">
              <div class="relative h-2 flex-1 rounded-full bg-sunken" aria-hidden="true">
                <div v-if="v !== null" class="absolute inset-y-0 left-0 rounded-full" :class="i === 0 ? 'bg-gold' : 'bg-blue'" :style="{ width: pct(v) }" />
              </div>
              <span class="w-8 text-right tabular-nums" :data-testid="`trait-${r.code}-${i}`">{{ fmt(v) }}</span>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
