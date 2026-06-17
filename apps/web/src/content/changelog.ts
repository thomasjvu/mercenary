/**
 * Product changelog for the web app. Update this file when shipping user-facing changes.
 * Set `gitTag` when a GitHub release tag is cut (e.g. `v0.1.0`).
 */

export type ChangelogSection = {
  title: string;
  items: string[];
};

export type ChangelogRelease = {
  version: string;
  channel: 'beta';
  date: string;
  summary: string;
  /** GitHub release tag — set when tagged; links render on the changelog page. */
  gitTag?: string | null;
  sections: ChangelogSection[];
};

export const CHANGELOG_UPDATED = 'June 17, 2026';

export const CHANGELOG_RELEASES: ChangelogRelease[] = [
  {
    version: '0.1.0',
    channel: 'beta',
    date: 'June 16, 2026',
    gitTag: null,
    summary:
      'Public beta shell with legal policies, marketplace polish, and Mercenary presence on legal pages.',
    sections: [
      {
        title: 'Platform',
        items: [
          'Legal policies for Phantasy LLC: Terms of Service, Privacy Policy, and Acceptable Use Policy.',
          'Legal section in the main sidebar with grouped policy links.',
          'Changelog page at /changelog, linked from the sidebar beta release badge.',
          'OC reference stills under assets/oc-references for consistent Mercenary art direction.',
        ],
      },
      {
        title: 'Web UI',
        items: [
          'Floating Mercenary clip on legal pages with pfp-locked generation and seamless hover loop.',
          'Legal float regen: symmetrical temple spikes and localized palm charge-shot glow.',
          'Favicon synced from boss-raid-pfp; sidebar wordmark without logo mark.',
          'Playground user-error notes with italic copy and pixel icon.',
          'Collapsed sidebar: menu toggle first, social order adjusted, footer legal links removed.',
          'Raiders orchestrator card and landing surface spacing polish.',
        ],
      },
      {
        title: 'Mercenary & marketplace',
        items: [
          'Mercenary deslop pass: modular CSS, demo artifact cleanup, route docs sync.',
          'Marketplace catalog base prices and Raiders directory refinements.',
          'Inference playground and receipt verification UX improvements.',
        ],
      },
    ],
  },
  {
    version: '0.0.9',
    channel: 'beta',
    date: 'June 15, 2026',
    gitTag: null,
    summary: 'Maintainability refactor across web shell, marketplace, and Mercenary flows.',
    sections: [
      {
        title: 'Architecture',
        items: [
          'Split landing, marketplace, model detail, raiders, account, and receipt pages into focused modules.',
          'Extracted buyer, playground, HTTP seller, and account hooks.',
          'Modularized styles into feature sheets and shared page primitives.',
        ],
      },
    ],
  },
];
