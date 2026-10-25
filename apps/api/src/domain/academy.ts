// Scent Academy domain (Phase 11, spec/SCENT_ACADEMY_SPEC.md). Six ORIGINAL lessons,
// versioned with the application; progress rows anchor to (slug, content_version).
// Lessons work without Scento or Ollama. Sensory observations are subjective: nothing here
// scores a description as right or wrong against a source pyramid.
import { Type, type Static } from 'typebox';

export const LESSONS = [
 {slug:'pyramid-drydown',version:1,title:'The note pyramid & drydown',intro:'Follow a fragrance through time without treating a note list as a formula.',term:'drydown',sections:[
  {title:'An evolving impression',text:'Top, heart and base describe a useful listening order for your nose. They are overlapping impressions, not three sealed compartments. A bright opening may soften while a quieter woody impression becomes easier to notice. Your environment, blotter and attention all affect what stands out.'},
  {title:'A list is a reference',text:'A published pyramid names intended impressions. It does not reveal ingredient percentages, guarantee that you will notice every note, or tell you exactly when one will disappear. Compare the same blotter at several moments and describe the change before looking for familiar note names.'}],task:'Write one word for the opening, then revisit after about 20 minutes. What changed? An unfamiliar impression is a valid observation.'},
 {slug:'material-note-accord',version:1,title:'Material, note or accord?',intro:'Separate the things a perfumer uses from the impressions you describe.',term:'accord',sections:[
  {title:'Different kinds of names',text:'A material is something used in a composition, such as an extract or an aroma chemical. A note is a perceived or advertised impression. An accord is a combination built to suggest a coherent effect. A rose impression can involve several materials; a note list is not an ingredient disclosure.'},
  {title:'Name the impression first',text:'When you smell something like warm bread, that comparison can be useful without proving that bread is an ingredient. Natural and synthetic describe origins or production, not a simple scale of quality. Keep your sensory comparison separate from any source claim about composition.'}],task:'Choose a familiar smell and describe it without naming an ingredient. Then decide whether your description is a note, a material claim or an accord idea.'},
 {slug:'families',version:1,title:'Aromatic, woody & amber families',intro:'Use families as flexible maps, with their source named.',term:'fougere',sections:[
  {title:'Three starting points',text:'Aromatic descriptions often bring herbs or a brisk green impression to mind. Woody descriptions can suggest dry shavings, creamy wood or earthy roots. Amber describes a broad warm, resinous or softly sweet direction in perfumery; it does not necessarily mean a single material or fossil amber.'},
  {title:'Maps can disagree',text:'Different sources divide families differently, and one fragrance may cross several boundaries. Record whose classification you are reading. Compare what leads the opening with what remains later, and allow your own description to differ from an editorial label.'}],task:'Place a blotter between two family words rather than forcing it into one box. Note what makes each word plausible.'},
 {slug:'descriptors',version:1,title:'Build a sensory vocabulary',intro:'Fresh, sweet, spicy, warm and texture words describe impressions, not measurements.',term:'gourmand',sections:[
  {title:'Use contrasts',text:'Try a pair of words: fresh or warm, dry or sweet, airy or dense, smooth or rough. Spicy may mean a sharp sparkle or a warmer, rounder impression. Texture words are metaphors for your experience; there is no need to attach a numerical certainty to them.'},
  {title:'Stay specific and provisional',text:'Instead of strong, ask whether an impression feels close, persistent, sharp or simply easy to recognize. Write what you notice and what you are unsure about. A later observation can change your mind without making the earlier description wrong.'}],task:'Choose three descriptors and one uncertainty. Revisit later and keep both observations rather than rewriting the first.'},
 {slug:'concentration-performance',version:1,title:'Concentration, projection & sillage',intro:'Distinguish labels from how a fragrance behaves in a particular test.',term:'sillage',sections:[
  {title:'Labels do not give a stopwatch',text:'EDT, EDP, parfum and extrait are product concentration labels. Versions can also have different compositions. A label alone cannot promise a fixed number of hours or tell you how far a fragrance will travel. Compare the exact named version and use source facts only where verified.'},
  {title:'Different questions',text:'Projection concerns how far an impression is noticeable around a wearer. Sillage describes the trail left as someone moves. Longevity concerns how long something remains detectable under a particular test. Skin, fabric, blotter, application and surroundings change the observation. Your own fading awareness can also differ from what another person notices.'}],task:'Describe duration and distance separately, without turning one trial into a universal performance claim.'},
 {slug:'blotter-testing',version:1,title:'Test a blotter & train your nose',intro:'Create a small, repeatable comparison without turning it into a daily obligation.',term:'drydown',sections:[
  {title:'A simple setup',text:'Label a clean blotter with the exact fragrance and the starting time. Keep different blotters apart. Use short, gentle observations and take breaks; repeatedly smelling the same blotter can make distinctions harder to notice. Start with a generic exercise if the fragrance identity is uncertain.'},
  {title:'Three useful moments',text:'Try an opening observation, another around 20 minutes and another around 60 minutes. These are prompts, not deadlines: adjust the elapsed times to what actually happened. Describe a few impressions and any changes. You can pause and return later, and no source pyramid makes your personal description right or wrong.'}],task:'Start Train My Nose, choose a sample or owned entry if available, and save one observation. Pausing is a valid stopping point.'},
] as const;

/** Short original definitions; each points at the lesson that teaches it ("Explain this"). */
export const GLOSSARY = [
  { term: 'top note', lesson: 'pyramid-drydown', lexicon: 'top-notes', text: 'The first impressions you notice; usually the quickest to fade.' },
  { term: 'heart note', lesson: 'pyramid-drydown', lexicon: 'heart-notes', text: 'Impressions that become easier to notice once the opening settles.' },
  { term: 'base note', lesson: 'pyramid-drydown', lexicon: 'base-notes', text: 'The quieter, longer-lasting impressions of the drydown.' },
  { term: 'drydown', lesson: 'pyramid-drydown', lexicon: 'drydown', text: 'How a fragrance changes as it settles over time.' },
  { term: 'accord', lesson: 'material-note-accord', lexicon: 'accord', text: 'A combination built to suggest one coherent effect.' },
  { term: 'note', lesson: 'material-note-accord', lexicon: null, text: 'A perceived or advertised impression, not an ingredient disclosure.' },
  { term: 'material', lesson: 'material-note-accord', lexicon: null, text: 'Something actually used in a composition, such as an extract or aroma chemical.' },
  { term: 'fougere', lesson: 'families', lexicon: 'fougere', text: 'A classic family name, often aromatic and herbal with a softer base.' },
  { term: 'amber', lesson: 'families', lexicon: 'amber', text: 'A broad warm, resinous or softly sweet direction, not one material.' },
  { term: 'gourmand', lesson: 'descriptors', lexicon: 'gourmand', text: 'Impressions that recall edible sweets or desserts.' },
  { term: 'projection', lesson: 'concentration-performance', lexicon: 'projection', text: 'How far an impression is noticeable around a wearer.' },
  { term: 'sillage', lesson: 'concentration-performance', lexicon: 'sillage', text: 'The trail left as someone moves.' },
  { term: 'longevity', lesson: 'concentration-performance', lexicon: 'longevity', text: 'How long something stays detectable in a particular test.' },
  { term: 'concentration', lesson: 'concentration-performance', lexicon: null, text: 'Product labels such as EDT, EDP or parfum; not a stopwatch.' },
  { term: 'blotter', lesson: 'blotter-testing', lexicon: null, text: 'A paper strip for smelling a fragrance away from skin.' },
] as const;

/** Explain-this context keys used by fragrance detail and Compare. */
export const EXPLAIN = {
  pyramid: 'pyramid-drydown',
  family: 'families',
  traits: 'descriptors',
  concentration: 'concentration-performance',
  notes: 'material-note-accord',
} as const;

export const lessonFor = (slug: string) => LESSONS.find((l) => l.slug === slug);
export const ProgressStatus=Type.Enum(['not_started','in_progress','completed'] as const);
export const ExerciseStatus=Type.Enum(['active','paused','completed'] as const);
export const Stage=Type.Enum(['initial','twenty','sixty'] as const);
const Id=Type.String({format:'uuid'});
const Obj=<T extends Parameters<typeof Type.Object>[0]>(p:T)=>Type.Object(p,{additionalProperties:false});
export const ProgressRecord=Obj({lesson_slug:Type.String({maxLength:80}),content_version:Type.Integer({minimum:1}),status:ProgressStatus,position:Type.Integer({minimum:0,maximum:20})});
export const ExerciseRecord=Obj({id:Id,entry_id:Type.Union([Id,Type.Null()]),title:Type.String({minLength:1,maxLength:100}),status:ExerciseStatus,created_at:Type.String({format:'date-time'})});
export const ObservationRecord=Obj({id:Id,exercise_id:Id,stage:Stage,elapsed_minutes:Type.Integer({minimum:0,maximum:1440}),descriptors:Type.Array(Type.String({minLength:1,maxLength:80}),{maxItems:20}),free_text:Type.String({maxLength:4000})});
export const AcademyDataSchema=Obj({progress:Type.Array(ProgressRecord,{maxItems:100}),exercises:Type.Array(ExerciseRecord,{maxItems:3000}),observations:Type.Array(ObservationRecord,{maxItems:9000})});
export type AcademyData=Static<typeof AcademyDataSchema>;
export const emptyAcademy=():AcademyData=>({progress:[],exercises:[],observations:[]});
export function validateAcademy(data:AcademyData,entryIds:Set<string>){
 const exercises=new Set(data.exercises.map(e=>e.id));
 if(exercises.size!==data.exercises.length||new Set(data.observations.map(o=>o.id)).size!==data.observations.length||new Set(data.observations.map(o=>o.exercise_id+':'+o.stage)).size!==data.observations.length||new Set(data.progress.map(p=>p.lesson_slug+':'+p.content_version)).size!==data.progress.length)throw new Error('Duplicate learning records');
 for(const p of data.progress){const l=lessonFor(p.lesson_slug);if(!l||p.content_version!==l.version||p.position>=l.sections.length)throw new Error('Unknown lesson version or position');}
 for(const e of data.exercises)if(e.entry_id&&!entryIds.has(e.entry_id))throw new Error('Practice entry missing');
 for(const o of data.observations)if(!exercises.has(o.exercise_id))throw new Error('Practice observation missing exercise');
}
