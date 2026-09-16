export const appNames = {
  en: 'Visora AI',
  'zh-CN': '映序',
};
export const docsRoute = '/docs';
export const docsContentRoute = '/llms.mdx/docs';

// Optional repository metadata. Leave these unset for private/local deployments.
export const gitConfig = {
  user: process.env.NEXT_PUBLIC_GIT_USER ?? '',
  repo: process.env.NEXT_PUBLIC_GIT_REPO ?? '',
  branch: process.env.NEXT_PUBLIC_GIT_BRANCH ?? 'main',
  docsContentDir: 'docs/content/docs',
};
