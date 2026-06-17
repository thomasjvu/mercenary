/**
 * Boss Raid documentation trees.
 * Product pages: content/docs/
 * Dev/brand pages: content/dev-docs/
 */

/** @typedef {Object} FileItem
 * @property {string} name
 * @property {string} path
 * @property {'file' | 'directory'} type
 * @property {FileItem[]} [children]
 * @property {boolean} [expanded]
 * @property {string[]} [tags]
 */

/** @type {{ current: string, versions: string[], labels: Record<string, string>, enabled: boolean }} */
export const versionConfig = {
  current: '0.1',
  versions: ['0.1'],
  labels: {
    0.1: 'Beta',
  },
  enabled: false,
};

/** @type {{ enabled: boolean, defaultLocale: string, locales: string[] }} */
export const i18nConfig = {
  enabled: false,
  defaultLocale: 'en',
  locales: ['en'],
};

/** @type {import('./documentation-config.js').OpenApiConfig} */
export const openapiConfig = {
  enabled: false,
  pagePath: 'reference/openapi',
  defaultSpecId: 'public',
  specs: [],
};

/** @type {import('./documentation-config.js').HomepageConfig} */
export const homepageConfig = {
  enabled: false,
  hero: {
    title: 'Boss Raid',
    subtitle: 'Verified inference and multi-agent raids',
    description:
      'Open marketplace docs for discount inference, Mercenary raids, seller onboarding, receipts, and operator runtime.',
    artwork: {
      src: '/images/docs/placeholders/template-hero-banner.svg',
      alt: 'Boss Raid documentation',
      caption: 'Replace with product artwork or a Mercenary system diagram.',
    },
    cta: {
      primary: {
        text: 'Getting started',
        href: '/docs/getting-started/introduction',
      },
      secondary: {
        text: 'Dev docs',
        href: '/dev-docs/brand/rx-78-design-system',
      },
    },
  },
  features: [
    {
      title: 'Two buyer lanes',
      description:
        'Discount inference and Mercenary raids share registry, receipts, and settlement.',
      icon: 'mingcute:route-line',
    },
    {
      title: 'Operator runbooks',
      description: 'Architecture, runtime commands, production readiness, and trust boundaries.',
      icon: 'mingcute:settings-3-line',
    },
    {
      title: 'RX-78 dev docs',
      description:
        'Brand tokens, typography, and art pipelines live in a separate dev-docs collection.',
      icon: 'mingcute:palette-line',
    },
    {
      title: 'Search-ready',
      description: 'Pagefind full-text search ships with production builds.',
      icon: 'mingcute:search-line',
    },
  ],
  quickStart: {
    title: 'Local stack',
    steps: [
      { title: 'Install', code: 'pnpm install' },
      { title: 'Configure', code: 'cp .env.example .env' },
      { title: 'Run', code: 'pnpm dev' },
      { title: 'Preview docs', code: 'pnpm dev:docs' },
    ],
  },
  footer: {
    links: [
      { text: 'Documentation', href: '/docs/getting-started/introduction' },
      { text: 'Dev docs', href: '/dev-docs/brand/rx-78-design-system' },
      { text: 'Mercenary', href: 'https://bossraid-web.pages.dev/mercenary' },
      { text: 'GitHub', href: 'https://github.com/thomasjvu/mercenary' },
    ],
  },
};

/** @type {FileItem[]} */
export const documentationTree = [
  {
    type: 'directory',
    name: 'Getting Started',
    path: 'getting-started',
    children: [
      {
        type: 'file',
        name: 'Introduction.md',
        path: 'getting-started/introduction',
        tags: ['getting-started', 'overview'],
      },
      {
        type: 'file',
        name: 'Discount Inference.md',
        path: 'getting-started/discount-inference',
        tags: ['inference', 'marketplace'],
      },
      {
        type: 'file',
        name: 'Buy Inference.md',
        path: 'getting-started/buy',
        tags: ['buyer', 'api-keys'],
      },
      {
        type: 'file',
        name: 'Sell Inference.md',
        path: 'getting-started/sell',
        tags: ['seller', 'upstream'],
      },
      {
        type: 'file',
        name: 'Run a Raid.md',
        path: 'getting-started/raids',
        tags: ['raid', 'mercenary'],
      },
      {
        type: 'file',
        name: 'Proof and Receipts.md',
        path: 'getting-started/proof',
        tags: ['receipt', 'attestation'],
      },
    ],
  },
  {
    type: 'directory',
    name: 'Reference',
    path: 'reference',
    children: [
      { type: 'file', name: 'Routes.md', path: 'reference/routes', tags: ['api', 'routes'] },
      { type: 'file', name: 'Environment.md', path: 'reference/env', tags: ['env', 'config'] },
      { type: 'file', name: 'Payments.md', path: 'reference/payments', tags: ['x402', 'payments'] },
    ],
  },
  {
    type: 'directory',
    name: 'Operators',
    path: 'operators',
    children: [
      { type: 'file', name: 'Runtime.md', path: 'operators/runtime', tags: ['runtime', 'deploy'] },
      {
        type: 'file',
        name: 'Architecture.md',
        path: 'operators/architecture',
        tags: ['architecture', 'mercenary'],
      },
      {
        type: 'file',
        name: 'Trust and Safety.md',
        path: 'operators/trust-and-safety',
        tags: ['trust', 'policy'],
      },
      {
        type: 'directory',
        name: 'Appendix',
        path: 'operators/appendix',
        children: [
          {
            type: 'file',
            name: 'Overview.md',
            path: 'operators/appendix/README',
            tags: ['appendix'],
          },
          {
            type: 'file',
            name: 'Hackathon.md',
            path: 'operators/appendix/hackathon',
            tags: ['hackathon'],
          },
          {
            type: 'file',
            name: 'Infisical.md',
            path: 'operators/appendix/infisical',
            tags: ['secrets'],
          },
          {
            type: 'file',
            name: 'Synthesis Registration.md',
            path: 'operators/appendix/synthesis-registration',
            tags: ['erc-8004', 'registration'],
          },
        ],
      },
    ],
  },
];

/** @type {FileItem[]} */
export const devDocumentationTree = [
  {
    type: 'directory',
    name: 'Brand',
    path: 'brand',
    children: [
      {
        type: 'file',
        name: 'RX-78 Design System.md',
        path: 'brand/rx-78-design-system',
        tags: ['brand', 'design', 'tokens'],
      },
      {
        type: 'file',
        name: 'Landing Hero Art.md',
        path: 'brand/landing-hero-art',
        tags: ['art', 'landing'],
      },
      {
        type: 'file',
        name: 'Legal Character Art.md',
        path: 'brand/legal-character-art',
        tags: ['art', 'legal'],
      },
    ],
  },
];
