import { Type, type Static } from 'typebox';
export const SeasonSchema = Type.Enum(['spring', 'summer', 'autumn', 'winter'] as const);
export const AffinitySchema = Type.Enum(['love','neutral','avoid','unsure'] as const);
export const ChoiceGroup = Type.Record(Type.String(), AffinitySchema, { maxProperties:100, propertyNames:{minLength:1,maxLength:80,not:{enum:['__proto__','constructor','prototype']}} });
export const ChoicesSchema = Type.Object({ notes:ChoiceGroup, families:ChoiceGroup, accords:ChoiceGroup, traits:ChoiceGroup },{additionalProperties:false});
export type Choices = Static<typeof ChoicesSchema>;
export const emptyChoices = (): Choices => ({notes:{},families:{},accords:{},traits:{}});
export function noteChoices(choices: Choices) {
  return {liked:Object.entries(choices.notes).filter(([,v])=>v==='love').map(([k])=>k),avoided:Object.entries(choices.notes).filter(([,v])=>v==='avoid').map(([k])=>k)};
}
