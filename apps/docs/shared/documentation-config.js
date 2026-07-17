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
  enabled: true,
  routePrefix: '/api',
  defaultSpecId: 'public',
  specs: [
    {
      id: 'public',
      label: 'Boss Raid Public API',
      description: 'Buyer, seller, and raider routes.',
      url: '/openapi-v1.yaml',
    },
    {
      id: 'internal',
      label: 'Boss Raid Operator API',
      description: 'Ops session, runtime telemetry, and production readiness routes.',
      url: '/openapi-internal.yaml',
    },
  ],
};

/** Framework pages served from apps/docs/src/docs/content (not content/docs). */
export const frameworkDocPaths = ['llms', 'skill'];

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
        text: 'Introduction',
        href: '/docs/overview/introduction',
      },
      secondary: {
        text: 'Dev docs',
        href: '/dev-docs/brand/rx-78-design-system',
      },
    },
  },
  features: [
    {
      title: 'Buyers',
      description: 'Discount inference, API keys, prepaid balance, and purchase receipts.',
      icon: 'mingcute:shopping-cart-1-line',
    },
    {
      title: 'Sellers',
      description: 'Register HTTP endpoints, upstream hosting, verification, and payouts.',
      icon: 'mingcute:store-line',
    },
    {
      title: 'Raiders',
      description: 'Mercenary multi-agent raids, synthesis, strict-private work, and MCP tools.',
      icon: 'mingcute:sword-line',
    },
    {
      title: 'Operators',
      description: 'Architecture, runtime commands, production readiness, and trust boundaries.',
      icon: 'mingcute:settings-3-line',
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
      { text: 'Introduction', href: '/docs/overview/introduction' },
      { text: 'Buyers', href: '/docs/buyers/buy' },
      { text: 'Raiders', href: '/docs/raiders/raids' },
      { text: 'Dev docs', href: '/dev-docs/brand/rx-78-design-system' },
      { text: 'GitHub', href: 'https://github.com/thomasjvu/mercenary' },
    ],
  },
};

/** @type {FileItem[]} */
export const documentationTree = [
  {
    type: 'directory',
    name: 'Overview',
    path: 'overview',
    expanded: true,
    children: [
      {
        type: 'file',
        name: 'Introduction.md',
        path: 'overview/introduction',
        tags: ['overview', 'getting-started'],
      },
      {
        type: 'file',
        name: 'Proof and Receipts.md',
        path: 'overview/proof',
        tags: ['receipt', 'attestation', 'proof'],
      },
      {
        type: 'file',
        name: 'Privacy and Data.md',
        path: 'overview/privacy-and-data',
        tags: ['privacy', 'data', 'account'],
      },
    ],
  },
  {
    type: 'directory',
    name: 'Buyers',
    path: 'buyers',
    expanded: true,
    children: [
      {
        type: 'file',
        name: 'Discount Inference.md',
        path: 'buyers/discount-inference',
        tags: ['buyer', 'inference', 'marketplace'],
      },
      {
        type: 'file',
        name: 'Buy Inference.md',
        path: 'buyers/buy',
        tags: ['buyer', 'api-keys'],
      },
    ],
  },
  {
    type: 'directory',
    name: 'Sellers',
    path: 'sellers',
    children: [
      {
        type: 'file',
        name: 'Sell Inference.md',
        path: 'sellers/sell',
        tags: ['seller', 'upstream'],
      },
      {
        type: 'file',
        name: 'HTTP Agent Guide.md',
        path: 'sellers/http-agent-guide',
        tags: ['seller', 'http', 'agent', 'hermes', 'openclaw', 'phantasy'],
      },
    ],
  },
  {
    type: 'directory',
    name: 'Raiders',
    path: 'raiders',
    children: [
      {
        type: 'file',
        name: 'Run a Raid.md',
        path: 'raiders/raids',
        tags: ['raid', 'mercenary', 'raider'],
      },
      {
        type: 'file',
        name: 'Hireable Agents.md',
        path: 'raiders/agents',
        tags: ['agent', 'hire', 'framework', 'subagent'],
      },
      {
        type: 'file',
        name: 'MCP Tools.md',
        path: 'raiders/mcp',
        tags: ['mcp', 'raid', 'mercenary', 'cursor'],
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
      {
        type: 'file',
        name: 'Agent Skill.md',
        path: 'skill',
        tags: ['skill', 'agent', 'reference'],
      },
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
    ],
  },
];

/** @type {FileItem[]} */
export const devDocumentationTree = [
  {
    type: 'directory',
    name: 'Operators',
    path: 'operators',
    children: [
      {
        type: 'file',
        name: 'Tech Stack.md',
        path: 'operators/tech-stack',
        tags: ['stack', 'architecture', 'dev'],
      },
      {
        type: 'file',
        name: 'Local Development.md',
        path: 'operators/local-development',
        tags: ['runtime', 'dev', 'local'],
      },
      {
        type: 'file',
        name: 'Infisical Secrets.md',
        path: 'operators/infisical',
        tags: ['secrets', 'infisical', 'deploy'],
      },
      {
        type: 'file',
        name: 'Data Storage.md',
        path: 'operators/data-storage',
        tags: ['sqlite', 'persistence', 'privacy'],
      },
    ],
  },
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
    ],
  },
];
