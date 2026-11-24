/**
 * Built-in learning paths with free, official or widely used resources. Each path mixes learning,
 * practice and a portfolio project, so finishing it gives the user something to show employers.
 */

export interface PathStep {
  id: string;
  title: string;
  kind: 'learn' | 'practice' | 'project';
  resource?: { label: string; url: string };
}

export interface LearningPath {
  id: string;
  skill: string;
  title: string;
  description: string;
  weeks: number;
  /** Other skill names this path covers, for matching skill gaps */
  aliases: string[];
  steps: PathStep[];
}

const s = (id: string, title: string, kind: PathStep['kind'], label?: string, url?: string): PathStep =>
  ({ id, title, kind, ...(label && url ? { resource: { label, url } } : {}) });

export const PATHS: LearningPath[] = [
  {
    id: 'javascript', skill: 'JavaScript', title: 'Modern JavaScript', weeks: 6, aliases: ['ES6', 'ECMAScript'],
    description: 'The language fundamentals interviewers test: scope, closures, async, the event loop.',
    steps: [
      s('js-1', 'Values, types, functions and scope', 'learn', 'javascript.info: The JavaScript language', 'https://javascript.info/first-steps'),
      s('js-2', 'Closures and the `this` keyword', 'learn', 'MDN: Closures', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Closures'),
      s('js-3', 'Promises, async/await and the event loop', 'learn', 'MDN: Using promises', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises'),
      s('js-4', 'Array methods and immutability', 'practice', 'MDN: Array', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array'),
      s('js-5', 'Solve 15 easy and medium problems in JavaScript', 'practice', 'Exercism JavaScript track', 'https://exercism.org/tracks/javascript'),
      s('js-6', 'Project: a vanilla-JS app that fetches an API with search, loading and error states', 'project'),
    ],
  },
  {
    id: 'typescript', skill: 'TypeScript', title: 'TypeScript for application developers', weeks: 4, aliases: ['TS'],
    description: 'Types that catch bugs without slowing you down: narrowing, generics and API boundaries.',
    steps: [
      s('ts-1', 'Everyday types, unions and narrowing', 'learn', 'TypeScript Handbook: Everyday Types', 'https://www.typescriptlang.org/docs/handbook/2/everyday-types.html'),
      s('ts-2', 'Generics and utility types', 'learn', 'TypeScript Handbook: Generics', 'https://www.typescriptlang.org/docs/handbook/2/generics.html'),
      s('ts-3', 'Typing React components and hooks', 'learn', 'React TypeScript Cheatsheet', 'https://react-typescript-cheatsheet.netlify.app/'),
      s('ts-4', 'Type challenges (easy set)', 'practice', 'type-challenges', 'https://github.com/type-challenges/type-challenges'),
      s('ts-5', 'Project: convert a JavaScript project to strict TypeScript, validating API data with zod', 'project', 'zod docs', 'https://zod.dev/'),
    ],
  },
  {
    id: 'react', skill: 'React', title: 'React from components to production', weeks: 6, aliases: ['React.js', 'ReactJS'],
    description: 'Thinking in components, state, effects, data fetching and performance.',
    steps: [
      s('re-1', 'Describing the UI and adding interactivity', 'learn', 'react.dev: Learn React', 'https://react.dev/learn'),
      s('re-2', 'Managing state and sharing it between components', 'learn', 'react.dev: Managing State', 'https://react.dev/learn/managing-state'),
      s('re-3', 'Escape hatches: refs and effects (and when not to use them)', 'learn', 'react.dev: You Might Not Need an Effect', 'https://react.dev/learn/you-might-not-need-an-effect'),
      s('re-4', 'Server data with a cache library', 'learn', 'TanStack Query docs', 'https://tanstack.com/query/latest/docs/framework/react/overview'),
      s('re-5', 'Testing components by behaviour', 'practice', 'Testing Library: React', 'https://testing-library.com/docs/react-testing-library/intro/'),
      s('re-6', 'Project: a dashboard with routing, forms, server data, loading/empty/error states and tests', 'project'),
    ],
  },
  {
    id: 'nextjs', skill: 'Next.js', title: 'Next.js and server rendering', weeks: 3, aliases: ['NextJS'],
    description: 'Routing, server components, data fetching and deployment.',
    steps: [
      s('nx-1', 'App Router fundamentals', 'learn', 'Next.js Learn', 'https://nextjs.org/learn'),
      s('nx-2', 'Server and client components, caching', 'learn', 'Next.js docs: Rendering', 'https://nextjs.org/docs/app/building-your-application/rendering'),
      s('nx-3', 'Project: a blog or store with server rendering, metadata for SEO and a deployed URL', 'project'),
    ],
  },
  {
    id: 'frontend', skill: 'Frontend fundamentals', title: 'Web platform: HTML, CSS, accessibility, performance', weeks: 5, aliases: ['HTML', 'CSS', 'Accessibility', 'Web Performance'],
    description: 'What separates a senior frontend developer: semantic HTML, layout, a11y and Core Web Vitals.',
    steps: [
      s('fe-1', 'Semantic HTML and forms', 'learn', 'web.dev: Learn HTML', 'https://web.dev/learn/html'),
      s('fe-2', 'Modern CSS layout: Flexbox and Grid', 'learn', 'web.dev: Learn CSS', 'https://web.dev/learn/css'),
      s('fe-3', 'Accessibility basics and keyboard support', 'learn', 'web.dev: Learn Accessibility', 'https://web.dev/learn/accessibility'),
      s('fe-4', 'Core Web Vitals and performance', 'learn', 'web.dev: Learn Performance', 'https://web.dev/learn/performance'),
      s('fe-5', 'Audit a site with Lighthouse and fix the top three issues', 'practice', 'Chrome DevTools: Lighthouse', 'https://developer.chrome.com/docs/lighthouse/overview'),
      s('fe-6', 'Project: a responsive, accessible landing page scoring 95+ in Lighthouse', 'project'),
    ],
  },
  {
    id: 'node', skill: 'Node.js', title: 'Node.js APIs', weeks: 4, aliases: ['Node', 'Express', 'REST'],
    description: 'Build and secure a REST API with a database.',
    steps: [
      s('nd-1', 'Node.js fundamentals and modules', 'learn', 'Node.js Learn', 'https://nodejs.org/en/learn'),
      s('nd-2', 'Express routing, middleware and error handling', 'learn', 'Express guide', 'https://expressjs.com/en/guide/routing.html'),
      s('nd-3', 'API security basics', 'learn', 'OWASP API Security Top 10', 'https://owasp.org/API-Security/'),
      s('nd-4', 'Project: a REST API with auth, validation, PostgreSQL and tests', 'project'),
    ],
  },
  {
    id: 'testing', skill: 'Testing', title: 'Testing frontend apps', weeks: 3, aliases: ['Jest', 'Vitest', 'Cypress', 'Playwright'],
    description: 'Unit, component and end-to-end tests that catch real bugs.',
    steps: [
      s('tt-1', 'Unit and component tests with Vitest', 'learn', 'Vitest guide', 'https://vitest.dev/guide/'),
      s('tt-2', 'Testing Library principles', 'learn', 'Testing Library: Guiding Principles', 'https://testing-library.com/docs/guiding-principles'),
      s('tt-3', 'End-to-end tests with Playwright', 'learn', 'Playwright: Getting started', 'https://playwright.dev/docs/intro'),
      s('tt-4', 'Project: add tests and CI to one of your projects', 'project', 'GitHub Actions quickstart', 'https://docs.github.com/en/actions/writing-workflows/quickstart'),
    ],
  },
  {
    id: 'git-cicd', skill: 'Git', title: 'Git, code review and CI/CD', weeks: 2, aliases: ['CI/CD', 'GitHub Actions'],
    description: 'Day-to-day collaboration skills every team expects.',
    steps: [
      s('gt-1', 'Branching, rebasing and resolving conflicts', 'learn', 'Pro Git book', 'https://git-scm.com/book/en/v2'),
      s('gt-2', 'Pull requests and code review etiquette', 'learn', 'Google: Code review developer guide', 'https://google.github.io/eng-practices/review/'),
      s('gt-3', 'Project: set up a CI pipeline with lint, tests and build for one of your repositories', 'project', 'GitHub Actions docs', 'https://docs.github.com/en/actions'),
    ],
  },
  {
    id: 'system-design', skill: 'System Design', title: 'Frontend system design', weeks: 4, aliases: ['Architecture', 'Microservices'],
    description: 'For senior roles: designing large UIs, APIs and data flow.',
    steps: [
      s('sd-1', 'System design fundamentals', 'learn', 'System Design Primer', 'https://github.com/donnemartin/system-design-primer'),
      s('sd-2', 'Rendering patterns', 'learn', 'patterns.dev', 'https://www.patterns.dev/'),
      s('sd-3', 'Practise: design a news feed, autocomplete and an image gallery out loud', 'practice'),
      s('sd-4', 'Write a one-page design doc for a feature you built', 'project'),
    ],
  },
];

const norm = (x: string) => x.trim().toLowerCase().replace(/\.js$/, '').replace(/[^a-z0-9+#]/g, '');

/** The built-in path for a skill name, if one covers it. */
export function pathForSkill(skill: string): LearningPath | undefined {
  const k = norm(skill);
  return PATHS.find(p => norm(p.skill) === k || p.aliases.some(a => norm(a) === k));
}

/** Generic three-step plan for a skill without a built-in path. */
export function genericSteps(skill: string): PathStep[] {
  const q = encodeURIComponent(skill);
  return [
    s('g-1', `Learn the basics of ${skill} from its official documentation`, 'learn', 'Search the official docs', `https://duckduckgo.com/?q=${q}+official+documentation`),
    s('g-2', `Follow a hands-on tutorial and rebuild it without looking`, 'practice'),
    s('g-3', `Project: use ${skill} in a small project and add it to your GitHub and resume`, 'project'),
  ];
}
