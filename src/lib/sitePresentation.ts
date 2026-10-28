/** Public-facing home page content. No untrusted HTML or arbitrary URLs are rendered. */
export type StoryBlock = { title: string; description: string };
export type HomepageContent = {
  heroEyebrow: string;
  aboutEyebrow: string;
  aboutTitle: string;
  aboutBody: string;
  featuresEyebrow: string;
  featuresTitle: string;
  features: [StoryBlock, StoryBlock, StoryBlock];
  packagesEyebrow: string;
  packagesTitle: string;
  packagesBody: string;
  stepsEyebrow: string;
  stepsTitle: string;
  steps: [StoryBlock, StoryBlock, StoryBlock];
  ctaEyebrow: string;
  ctaTitle: string;
  ctaBody: string;
};

export const DEFAULT_HOMEPAGE: HomepageContent = {
  heroEyebrow: 'CELEBRATIONS, THOUGHTFULLY PLANNED',
  aboutEyebrow: 'WELCOME TO DM EVENTS',
  aboutTitle: 'Beautiful celebrations begin with a thoughtful plan.',
  aboutBody: 'Share your ideas, explore the possibilities, and keep the details of your celebration in one place. Our team will help you move from your first inquiry to a carefully coordinated event.',
  featuresEyebrow: 'WHAT WE HELP YOU DO',
  featuresTitle: 'Every detail, more beautifully organized.',
  features: [
    { title: 'Explore your options', description: 'Discover event packages and share what matters most for your celebration.' },
    { title: 'Plan with clarity', description: 'Submit your preferred date and event details, then follow your booking as it progresses.' },
    { title: 'Stay connected', description: 'Keep your questions and important updates together with DM Events.' },
  ],
  packagesEyebrow: 'CURATED FOR YOUR OCCASION',
  packagesTitle: 'Find a starting point for your celebration.',
  packagesBody: 'Browse our published event packages. Every occasion is personal, so availability and final quotations are confirmed with our team.',
  stepsEyebrow: 'A SIMPLE JOURNEY',
  stepsTitle: 'From the first idea to the final details.',
  steps: [
    { title: 'Browse & imagine', description: 'Look through our packages and picture your ideal celebration.' },
    { title: 'Tell us about it', description: 'Send your event request with your preferred date and details.' },
    { title: 'Plan together', description: 'Track updates and coordinate the next steps with DM Events.' },
  ],
  ctaEyebrow: 'LET’S CREATE SOMETHING MEMORABLE',
  ctaTitle: 'Your celebration starts with a conversation.',
  ctaBody: 'Tell us what you have in mind. We would love to hear your ideas.',
};

/** Old rows can contain nulls, old drafts or partial JSON; fill safely. */
export function normalizeHomepage(value: unknown): HomepageContent {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const field = (key: keyof HomepageContent): string => {
    const v = src[key];
    return typeof v === 'string' && v.trim() ? v : DEFAULT_HOMEPAGE[key] as string;
  };
  const blocks = (key: 'features' | 'steps'): [StoryBlock, StoryBlock, StoryBlock] => {
    const input = Array.isArray(src[key]) ? src[key] as unknown[] : [];
    return [0, 1, 2].map(index => {
      const item = input[index] && typeof input[index] === 'object' && !Array.isArray(input[index])
        ? input[index] as Record<string, unknown> : {};
      const fallback = DEFAULT_HOMEPAGE[key][index];
      return {
        title: typeof item.title === 'string' && item.title.trim() ? item.title : fallback.title,
        description: typeof item.description === 'string' && item.description.trim() ? item.description : fallback.description,
      };
    }) as [StoryBlock, StoryBlock, StoryBlock];
  };
  return {
    heroEyebrow: field('heroEyebrow'), aboutEyebrow: field('aboutEyebrow'),
    aboutTitle: field('aboutTitle'), aboutBody: field('aboutBody'),
    featuresEyebrow: field('featuresEyebrow'), featuresTitle: field('featuresTitle'), features: blocks('features'),
    packagesEyebrow: field('packagesEyebrow'), packagesTitle: field('packagesTitle'), packagesBody: field('packagesBody'),
    stepsEyebrow: field('stepsEyebrow'), stepsTitle: field('stepsTitle'), steps: blocks('steps'),
    ctaEyebrow: field('ctaEyebrow'), ctaTitle: field('ctaTitle'), ctaBody: field('ctaBody'),
  };
}
