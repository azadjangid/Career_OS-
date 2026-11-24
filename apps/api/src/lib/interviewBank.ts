import crypto from 'crypto';
import type { ExperienceLevel } from '@prisma/client';

/**
 * Built-in interview questions with the key points a strong answer covers. Mock interviews start
 * from this bank so practice works without any AI key; with AI configured, answers are graded and
 * role-specific questions can be generated from a job description.
 */

export type Topic = 'hr' | 'javascript' | 'typescript' | 'react' | 'frontend' | 'coding';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface BankQuestion {
  id: string;
  topic: Topic;
  category: string;
  difficulty: Difficulty;
  question: string;
  keyPoints: string[];
}

export const TOPICS: Array<{ id: Topic | 'role'; label: string; description: string; needsAI?: boolean }> = [
  { id: 'hr', label: 'HR & behavioural', description: 'Motivation, teamwork, conflict, strengths and the STAR method' },
  { id: 'javascript', label: 'JavaScript', description: 'Closures, the event loop, this, promises, prototypes' },
  { id: 'typescript', label: 'TypeScript', description: 'Types vs interfaces, generics, narrowing, utility types' },
  { id: 'react', label: 'React', description: 'Rendering, hooks, state, effects, performance' },
  { id: 'frontend', label: 'Frontend & web', description: 'Browser, CSS, accessibility, performance, security' },
  { id: 'coding', label: 'Coding challenges', description: 'Small problems to solve and explain, with complexity' },
  { id: 'role', label: 'For a specific job', description: 'Questions written by AI from a job description', needsAI: true },
];

const q = (topic: Topic, category: string, difficulty: Difficulty, question: string, keyPoints: string[]): BankQuestion => ({
  id: `${topic}-${crypto.createHash('sha1').update(question).digest('hex').slice(0, 8)}`, topic, category, difficulty, question, keyPoints,
});

export const BANK: BankQuestion[] = [
  // HR & behavioural
  q('hr', 'Introduction', 'easy', 'Tell me about yourself.', ['Current role and years of experience', 'Two or three relevant achievements with results', 'What you are looking for next and why this role fits', 'Keeps it under two minutes']),
  q('hr', 'Motivation', 'easy', 'Why do you want to work here?', ['Specific facts about the company or product', 'Link between the role and your skills', 'What you want to learn or contribute', 'Avoids talking only about salary or perks']),
  q('hr', 'Teamwork', 'medium', 'Describe a time you disagreed with a teammate. What did you do?', ['Situation and the disagreement in brief (STAR)', 'Listened and understood their view', 'Used data or a small experiment to decide', 'Outcome and what the relationship looked like after']),
  q('hr', 'Ownership', 'medium', 'Tell me about a mistake you made at work and how you handled it.', ['Takes clear responsibility without blaming others', 'Immediate fix and communication to people affected', 'Root cause and what changed to prevent it', 'What you learned']),
  q('hr', 'Pressure', 'medium', 'How do you handle tight deadlines or several urgent tasks at once?', ['Clarifies priorities with the manager or stakeholders', 'Breaks work down and cuts scope sensibly', 'Communicates early about risks', 'A concrete example with a result']),
  q('hr', 'Strengths', 'easy', 'What are your strengths and one weakness?', ['Strengths backed by an example', 'A real weakness, not a disguised strength', 'Steps you are taking to improve it']),
  q('hr', 'Leadership', 'hard', 'Tell me about a time you influenced a technical decision without formal authority.', ['Context and why the decision mattered', 'Built the case with evidence, prototypes or data', 'Brought others along and handled objections', 'Measurable result']),
  q('hr', 'Career', 'medium', 'Where do you see yourself in three years?', ['Realistic growth path connected to this role', 'Skills you want to deepen', 'Shows commitment rather than a plan to leave quickly']),

  // JavaScript
  q('javascript', 'Closures', 'easy', 'What is a closure in JavaScript? Give a practical use.', ['A function keeps access to variables from the scope where it was created', 'Works after the outer function has returned', 'Example: private state, counters, memoisation, event handlers', 'Mentions the classic loop with var pitfall or similar']),
  q('javascript', 'Event loop', 'medium', 'Explain the event loop. In what order do setTimeout(…, 0), a resolved Promise.then and synchronous code run?', ['Call stack runs synchronous code first', 'Microtasks (promise callbacks) run before the next macrotask', 'setTimeout callbacks are macrotasks', 'Order: sync, then microtasks, then timers']),
  q('javascript', 'this', 'medium', 'How is the value of `this` decided in JavaScript?', ['Depends on how a function is called, not where it is defined', 'Method call, plain call (undefined in strict mode), new, call/apply/bind', 'Arrow functions take this from the enclosing scope', 'Example of losing this when passing a method as a callback']),
  q('javascript', 'Equality', 'easy', 'What is the difference between == and ===?', ['=== compares without type conversion', '== converts types first, with surprising cases', 'Prefer === except deliberate null/undefined checks']),
  q('javascript', 'Async', 'medium', 'Compare callbacks, promises and async/await. How do you handle errors with each?', ['Callbacks: error-first convention, nesting problems', 'Promises: chaining, .catch, Promise.all/allSettled', 'async/await: try/catch, still promises underneath', 'Running independent work in parallel instead of awaiting in sequence']),
  q('javascript', 'Prototypes', 'hard', 'How does prototypal inheritance work, and how do ES classes relate to it?', ['Objects link to a prototype; property lookup walks the chain', 'Constructor functions and Object.create', 'class syntax is mostly sugar over prototypes', 'Own vs inherited properties (hasOwn)']),
  q('javascript', 'Scope', 'easy', 'What are the differences between var, let and const?', ['var is function-scoped and hoisted as undefined', 'let and const are block-scoped with a temporal dead zone', 'const prevents reassignment, not mutation']),
  q('javascript', 'Performance', 'hard', 'What are debounce and throttle? Implement one and say when you would use each.', ['Debounce waits until calls stop for N ms', 'Throttle runs at most once every N ms', 'Correct implementation with a timer and clearTimeout', 'Examples: search input vs scroll or resize']),
  q('javascript', 'Memory', 'hard', 'How do memory leaks happen in a long-running single-page app, and how do you find them?', ['Forgotten listeners, timers, subscriptions, detached DOM nodes, growing caches', 'Closures holding large objects', 'DevTools heap snapshots and allocation timelines', 'Cleanup on unmount or teardown']),

  // TypeScript
  q('typescript', 'Basics', 'easy', 'When would you use a type alias versus an interface?', ['Both describe object shapes', 'Interfaces can be merged and extended; good for public object APIs', 'Type aliases handle unions, tuples, mapped and conditional types', 'Consistency within a codebase matters more than the choice']),
  q('typescript', 'Unknown vs any', 'easy', 'What is the difference between any and unknown?', ['any turns off type checking', 'unknown forces narrowing before use', 'Prefer unknown for untrusted input such as JSON or caught errors']),
  q('typescript', 'Generics', 'medium', 'Explain generics with an example, including a constraint.', ['Type parameters let one function or type work for many types while keeping links between them', 'Example such as a typed fetch helper or first<T>(arr: T[])', 'Constraint with extends, e.g. T extends { id: string }', 'Inference at the call site']),
  q('typescript', 'Narrowing', 'medium', 'How does type narrowing work? Show a discriminated union.', ['typeof, instanceof, in, equality checks and user-defined type guards', 'Union with a shared literal kind field', 'switch on the discriminant with exhaustive never check']),
  q('typescript', 'Utility types', 'medium', 'Name some built-in utility types and when you use them.', ['Partial, Required, Pick, Omit, Record, Readonly', 'ReturnType, Parameters, Awaited', 'Example: update payloads as Partial<Pick<…>>']),
  q('typescript', 'Advanced', 'hard', 'What are conditional and mapped types? Give a real use.', ['Mapped types transform each key: { [K in keyof T]: … }', 'Conditional types: T extends U ? X : Y, with infer', 'Distribution over unions', 'Example such as making selected fields optional or deriving API types']),
  q('typescript', 'Practice', 'medium', 'How do you keep types correct at runtime boundaries such as API responses?', ['Static types disappear at runtime', 'Validate with a schema library (zod or similar) and infer types from it', 'Share types between client and server where possible', 'Treat external data as unknown until validated']),

  // React
  q('react', 'Rendering', 'easy', 'What causes a React component to re-render?', ['Its state changes', 'Its parent re-renders (props may or may not change)', 'A consumed context value changes', 'Rendering is not the same as a DOM update: reconciliation decides what changes']),
  q('react', 'Hooks', 'easy', 'What are the rules of hooks and why do they exist?', ['Call hooks only at the top level, not in loops or conditions', 'Call them only from components or custom hooks', 'React relies on call order to match state between renders', 'The lint rule enforces it']),
  q('react', 'Effects', 'medium', 'When should you use useEffect, and when should you avoid it?', ['For syncing with external systems: subscriptions, timers, DOM APIs, network', 'Not for deriving data from props or state: compute during render', 'Dependency array and cleanup functions', 'Data fetching libraries (React Query) instead of manual effects']),
  q('react', 'Keys', 'easy', 'Why do list items need keys, and why is the array index often a bad key?', ['Keys let React match items between renders', 'Index keys break when items are reordered, inserted or removed', 'Bugs with input state or animations', 'Use a stable id from the data']),
  q('react', 'Performance', 'medium', 'How would you find and fix a slow React page?', ['Measure first with the React Profiler and browser performance tools', 'Avoid unnecessary renders: memo, useMemo, useCallback where measured', 'Virtualise long lists, split code, lazy load', 'Move state down or split context']),
  q('react', 'State', 'medium', 'How do you decide where state lives: local state, context, a store, or server cache?', ['Keep state as close as possible to where it is used', 'Lift state up when siblings share it', 'Server data belongs in a cache like React Query', 'Global client state (theme, auth) in context or a small store']),
  q('react', 'Forms', 'medium', 'Controlled versus uncontrolled inputs: trade-offs?', ['Controlled: value in React state, easy validation, re-render per keystroke', 'Uncontrolled: refs or form libraries, less re-rendering', 'Form libraries such as React Hook Form']),
  q('react', 'Architecture', 'hard', 'Explain React concurrent rendering, Suspense and transitions in practical terms.', ['Rendering can be interrupted and resumed', 'startTransition marks non-urgent updates so input stays responsive', 'Suspense shows a fallback while code or data loads', 'useDeferredValue for expensive derived views']),
  q('react', 'Testing', 'medium', 'How do you test React components?', ['React Testing Library: test behaviour the user sees, query by role and label', 'Mock network at the boundary (MSW)', 'Unit tests for logic, a few end-to-end tests for critical flows', 'Avoid testing implementation details']),
  q('react', 'Server', 'hard', 'What problems do server-side rendering and React Server Components solve, and what do they cost?', ['Faster first paint and better SEO with SSR', 'Hydration cost and mismatch issues', 'Server Components send less JavaScript and fetch data on the server', 'Added complexity: caching, boundaries between server and client code']),

  // Frontend & web
  q('frontend', 'Browser', 'medium', 'What happens between typing a URL and seeing the page?', ['DNS, TCP and TLS, HTTP request', 'HTML parsing, CSS and JS loading, render-blocking resources', 'Style, layout, paint, composite', 'Caching and CDNs along the way']),
  q('frontend', 'CSS', 'easy', 'Explain the CSS box model and box-sizing.', ['Content, padding, border, margin', 'content-box vs border-box width calculation', 'Most projects set border-box globally']),
  q('frontend', 'Layout', 'easy', 'When do you use Flexbox and when Grid?', ['Flexbox for one-dimensional rows or columns', 'Grid for two-dimensional layouts', 'Often combined: grid for the page, flex inside components']),
  q('frontend', 'Accessibility', 'medium', 'How do you make a custom dropdown or modal accessible?', ['Semantic elements first; ARIA roles only when needed', 'Keyboard support: Tab, Esc, arrow keys, focus trap in modals', 'Focus moves in and returns to the opener', 'Labels, aria-expanded, testing with a screen reader']),
  q('frontend', 'Performance', 'medium', 'What are Core Web Vitals and how do you improve them?', ['LCP (loading), INP (responsiveness), CLS (visual stability)', 'Optimise images, preload key assets, reduce JS', 'Reserve space for media to avoid layout shift', 'Break up long tasks for INP']),
  q('frontend', 'Security', 'hard', 'How do XSS and CSRF attacks work, and how do you prevent them in a frontend app?', ['XSS: injected script runs in your origin; escape output, avoid dangerouslySetInnerHTML, CSP', 'CSRF: a site makes the browser send authenticated requests; SameSite cookies, CSRF tokens', 'Keep tokens out of localStorage where possible']),
  q('frontend', 'Caching', 'medium', 'How does HTTP caching work for static assets and API responses?', ['Cache-Control max-age, no-cache, no-store, immutable', 'ETag and Last-Modified revalidation', 'Hashed filenames for long-lived static assets', 'Service workers as an extra layer']),
  q('frontend', 'Architecture', 'hard', 'How would you design the frontend for a large app worked on by several teams?', ['Clear module boundaries and a shared design system', 'Monorepo or micro-frontends: trade-offs', 'Shared tooling: lint, types, CI', 'Performance budgets and ownership']),

  // Coding challenges
  q('coding', 'Arrays', 'easy', 'Write a function that removes duplicates from an array while keeping the original order. What is its complexity?', ['Use a Set to track seen values', 'Single pass keeps order', 'O(n) time and O(n) space', 'Mentions objects compared by reference']),
  q('coding', 'Strings', 'easy', 'Check whether two strings are anagrams of each other.', ['Normalise case and ignore spaces if asked', 'Count characters with a map, or sort both', 'Counting is O(n); sorting is O(n log n)', 'Early exit when lengths differ']),
  q('coding', 'Hash maps', 'medium', 'Given an array of numbers and a target, return the indices of two numbers that add up to the target.', ['Brute force is O(n²)', 'One pass with a map from value to index: O(n)', 'Check for the complement before inserting the current value', 'Handles no solution and duplicates']),
  q('coding', 'Async', 'medium', 'Implement a function that runs async tasks with at most N running at the same time.', ['Keep a pool of N workers pulling from a queue', 'Preserve result order by index', 'Handle errors: fail fast or collect results', 'Do not start all promises at once']),
  q('coding', 'Recursion', 'medium', 'Flatten an arbitrarily nested array without using Array.prototype.flat.', ['Recursive solution checking Array.isArray', 'Iterative solution with a stack to avoid deep recursion', 'O(n) over all elements', 'Optional depth parameter']),
  q('coding', 'Design', 'hard', 'Implement an LRU cache with get and put in O(1).', ['Map for key lookup plus recency order', 'JavaScript Map keeps insertion order: delete and re-set on access', 'Evict the oldest entry when over capacity', 'Or a doubly linked list plus hash map']),
];

const LEVEL_MIX: Record<ExperienceLevel, Difficulty[]> = {
  ENTRY: ['easy', 'easy', 'medium'],
  MID: ['easy', 'medium', 'medium', 'hard'],
  SENIOR: ['medium', 'medium', 'hard', 'hard'],
  LEAD: ['medium', 'hard', 'hard'],
  PRINCIPAL: ['medium', 'hard', 'hard'],
};

/** Picks `count` questions for a topic, weighted toward the difficulty that fits the level, avoiding recent repeats. */
export function pickQuestions(topic: Topic, level: ExperienceLevel, count: number, avoid: Set<string> = new Set(), rand: () => number = Math.random): BankQuestion[] {
  const pool = BANK.filter(b => b.topic === topic);
  const mix = LEVEL_MIX[level];
  const weight = (d: Difficulty) => mix.filter(x => x === d).length;
  const scored = pool
    .map(b => ({ b, key: (weight(b.difficulty) + rand()) * (avoid.has(b.id) ? 0.2 : 1) }))
    .filter(x => weight(x.b.difficulty) > 0 || pool.length <= count)
    .sort((a, b) => b.key - a.key);
  const picked = scored.slice(0, count).map(x => x.b);
  // Top up from the rest of the topic if the level filter left too few
  for (const b of pool) if (picked.length < count && !picked.includes(b)) picked.push(b);
  return picked;
}
