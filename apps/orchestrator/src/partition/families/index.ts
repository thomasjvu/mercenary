import type { ContributionFamily, ContributionFamilyId } from '../types.js';
import { gameFamilies } from './game.js';
import { patchFamilies } from './patch.js';
import { promoFamilies } from './promo.js';
import { textFamilies } from './text.js';

export const FAMILIES: Record<ContributionFamilyId, ContributionFamily> = {
  ...patchFamilies,
  ...gameFamilies,
  ...promoFamilies,
  ...textFamilies,
};
