// My Spectrum API model (Phase 13, spec/SPECTRUM_SPEC.md).
export interface AxisData {
  code: string;
  label: string;
  left: { label: string; traits: string[] };
  right: { label: string; traits: string[] };
  position: number | null;
  spread: { min: number; max: number } | null;
  placed: number;
  total: number;
  fragrances: { id: string; brand: string; name: string; position: number }[];
  notPlaced: { id: string; brand: string; name: string }[];
}
