/**
 * CharacterNote avatar URLs for MDX shortcodes.
 * Boss Raid dogfood uses Mercenary art under /images/bossraid/character-notes/.
 * Papers template installs should keep generic placeholders under /images/character-notes/.
 */

/** @type {Record<'info' | 'warning' | 'alert' | 'success' | 'tip', string>} */
export const characterNoteAvatars = {
  info: '/images/bossraid/character-notes/mercenary-info.png',
  warning: '/images/bossraid/character-notes/mercenary-warning.png',
  alert: '/images/bossraid/character-notes/mercenary-alert.png',
  success: '/images/bossraid/character-notes/mercenary-success.png',
  tip: '/images/bossraid/character-notes/mercenary-tip.png',
};
