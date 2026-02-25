export type InteractionProfileId = 'classic';

export interface InteractionProfile {
  readonly id: InteractionProfileId;
  readonly name: string;
  readonly summary: string;
  readonly goals: readonly string[];
}

export const CLASSIC_PROFILE: InteractionProfile = {
  id: 'classic',
  name: 'Classic Grid',
  summary: 'Current cardinal workflow with insert/select-drag and immediate labeling.',
  goals: [
    'Fast orthogonal movement and zoom',
    'Held insert with drag and label edit',
    'Stable baseline behavior for comparison',
  ],
};
