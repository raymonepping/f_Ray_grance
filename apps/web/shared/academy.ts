// Scent Academy API models consumed by the UI (Phase 11). Shapes mirror apps/api routes.
export type ProgressStatus = 'not_started' | 'in_progress' | 'completed';
export type ExerciseStatus = 'active' | 'paused' | 'completed';
export type Stage = 'initial' | 'twenty' | 'sixty';
export type ReferenceKind = 'material' | 'term' | 'family' | 'families' | 'journal';

export interface Lesson {
  slug: string;
  version: number;
  title: string;
  intro: string;
  term: string;
  sections: { title: string; text: string }[];
  task: string;
}
export interface Progress { lesson_slug: string; content_version: number; status: ProgressStatus; position: number }
export interface LessonsResponse { lessons: Lesson[]; progress: Progress[]; authorship: string }
export interface GlossaryEntry { term: string; lesson: string; lexicon: string | null; text: string }

export interface Folio {
  kind: ReferenceKind;
  folio: string;
  title: string;
  lede: string;
  facts: { label: string; value: string }[];
  related: { label: string; detail: string | null; url: string | null }[];
  sourceUrl: string | null;
  sourceLabel: string;
  attribution: string;
  language: 'en';
  fetchedAt: string;
}
export type ReferenceResult =
  | { available: true; reference: Folio }
  | { available: false; code: string; retryAfterSeconds: number | null; message: string };

export interface Exercise {
  id: string;
  entry_id: string | null;
  title: string;
  status: ExerciseStatus;
  created_at: string;
  fragrance?: string | null;
  brand?: string | null;
  observations?: number;
  primary_image_id?: string | null;
}
export interface Observation { id: string; exercise_id: string; stage: Stage; elapsed_minutes: number; descriptors: string[]; free_text: string }

export interface TutorResponse {
  available: boolean;
  status: string;
  answer?: string | null;
  model?: string | null;
  curated: string;
  sources: { label: string; url: string | null }[];
  notice: string;
}

export const STAGES: { key: Stage; label: string; minutes: number; prompt: string }[] = [
  { key: 'initial', label: 'Opening', minutes: 0, prompt: 'What do you notice first?' },
  { key: 'twenty', label: 'About 20 minutes', minutes: 20, prompt: 'What has changed since the opening?' },
  { key: 'sixty', label: 'About 60 minutes', minutes: 60, prompt: 'What remains as it settles?' },
];
export const PROGRESS_LABEL: Record<ProgressStatus, string> = { not_started: 'Not started', in_progress: 'In progress', completed: 'Completed' };
