// Academy data shared by the landing page and lesson view (one fetch per visit).
import type { LessonsResponse, Progress, ProgressStatus } from '~~/shared/academy';

export function useAcademy() {
  const data = useState<LessonsResponse | null>('academy:lessons', () => null);
  const error = ref<string | null>(null);
  async function load(force = false) {
    if (data.value && !force) return;
    error.value = null;
    try {
      data.value = await apiFetch<LessonsResponse>('/api/v1/academy/lessons');
    } catch (e) {
      error.value = e instanceof ApiFailure ? e.message : 'Could not load the Academy';
    }
  }
  const progressFor = (slug: string): Progress | undefined => {
    const lesson = data.value?.lessons.find((l) => l.slug === slug);
    return data.value?.progress.find((p) => p.lesson_slug === slug && p.content_version === lesson?.version);
  };
  async function saveProgress(slug: string, status: ProgressStatus, position: number) {
    const lesson = data.value?.lessons.find((l) => l.slug === slug);
    if (!lesson) return;
    await apiFetch(`/api/v1/academy/lessons/${slug}/progress`, { method: 'PATCH', body: { status, position, contentVersion: lesson.version } });
    const rest = data.value!.progress.filter((p) => !(p.lesson_slug === slug && p.content_version === lesson.version));
    data.value = { ...data.value!, progress: [...rest, { lesson_slug: slug, content_version: lesson.version, status, position }] };
  }
  return { data, error, load, progressFor, saveProgress };
}
