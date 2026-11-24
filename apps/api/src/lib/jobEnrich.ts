import type { ExperienceLevel, WorkMode } from '@prisma/client';

/**
 * Deterministic enrichment for imported jobs: skills, experience level, India eligibility for
 * remote roles, and a key for spotting the same posting from several sources. No AI involved,
 * so it works for every user and costs nothing.
 */

// Canonical name → patterns (matched on word boundaries, case-insensitive)
const SKILLS: Record<string, string[]> = {
  JavaScript: ['javascript', 'js', 'es6', 'ecmascript'], TypeScript: ['typescript', 'ts'], React: ['react', 'react\\.js', 'reactjs'],
  'Next.js': ['next\\.js', 'nextjs'], Vue: ['vue', 'vue\\.js', 'vuejs'], Angular: ['angular'], Svelte: ['svelte'], Redux: ['redux'],
  'Node.js': ['node', 'node\\.js', 'nodejs'], Express: ['express', 'express\\.js'], NestJS: ['nestjs', 'nest\\.js'], Deno: ['deno'],
  HTML: ['html', 'html5'], CSS: ['css', 'css3'], Sass: ['sass', 'scss'], 'Tailwind CSS': ['tailwind', 'tailwindcss'],
  GraphQL: ['graphql'], REST: ['rest', 'restful', 'rest api', 'rest apis'], Webpack: ['webpack'], Vite: ['vite'],
  Jest: ['jest'], Cypress: ['cypress'], Playwright: ['playwright'], 'React Native': ['react native'], Flutter: ['flutter'],
  Python: ['python'], Django: ['django'], Flask: ['flask'], FastAPI: ['fastapi'], Java: ['java'], Spring: ['spring', 'spring boot'],
  Kotlin: ['kotlin'], Swift: ['swift'], Go: ['golang', 'go'], Rust: ['rust'], 'C#': ['c#', '\\.net', 'dotnet'], 'C++': ['c\\+\\+'],
  PHP: ['php'], Laravel: ['laravel'], Ruby: ['ruby'], Rails: ['rails', 'ruby on rails'], Scala: ['scala'],
  SQL: ['sql'], PostgreSQL: ['postgres', 'postgresql'], MySQL: ['mysql'], MongoDB: ['mongodb', 'mongo'], Redis: ['redis'],
  Elasticsearch: ['elasticsearch'], Kafka: ['kafka'], RabbitMQ: ['rabbitmq'], Prisma: ['prisma'],
  AWS: ['aws', 'amazon web services'], GCP: ['gcp', 'google cloud'], Azure: ['azure'], Docker: ['docker'], Kubernetes: ['kubernetes', 'k8s'],
  Terraform: ['terraform'], 'CI/CD': ['ci/cd', 'cicd', 'continuous integration'], Linux: ['linux'], Git: ['git'],
  'Machine Learning': ['machine learning', 'ml'], 'Deep Learning': ['deep learning'], PyTorch: ['pytorch'], TensorFlow: ['tensorflow'],
  LLM: ['llm', 'llms', 'large language models'], 'Data Engineering': ['data engineering'], Spark: ['spark', 'pyspark'], Airflow: ['airflow'],
  Figma: ['figma'], 'UI/UX': ['ui/ux', 'ux design', 'ui design'], Accessibility: ['accessibility', 'a11y', 'wcag'],
  'System Design': ['system design'], Microservices: ['microservices'], Agile: ['agile', 'scrum'],
};

const SKILL_RES: Array<[string, RegExp]> = Object.entries(SKILLS).map(([name, pats]) => [
  name,
  // Short, ambiguous tokens ("go", "ts", "js", "ml", "rest", "spark", "spring", "git", "node") only count in technical lists, handled below
  new RegExp(`(^|[^\\w+#.])(${pats.join('|')})(?=$|[^\\w+#])`, 'i'),
]);
const AMBIGUOUS = new Set(['Go', 'REST', 'Spring', 'Spark', 'Rust', 'Swift', 'Express']);

/** Skills mentioned in a job's title, tags and description, in a stable order. */
export function extractSkills(...texts: Array<string | null | undefined>): string[] {
  const hay = texts.filter(Boolean).join('\n');
  if (!hay) return [];
  const found: string[] = [];
  for (const [name, re] of SKILL_RES) {
    if (!re.test(hay)) continue;
    // Ambiguous words need a capitalised or tech-context mention, e.g. "Go," / "Golang", not "go to"
    if (AMBIGUOUS.has(name) && !new RegExp(`\\b${name.replace('.', '\\.')}\\b`).test(hay) && !(name === 'Go' && /golang/i.test(hay))) continue;
    found.push(name);
  }
  return found.slice(0, 20);
}

/** Merges skills from a feed's tags with extracted ones, de-duplicated case-insensitively. */
export function mergeSkills(tags: string[], extracted: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...extracted, ...tags]) {
    const k = s.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(s.trim());
  }
  return out.slice(0, 20);
}

/** Seniority from the title first (most reliable), then "N+ years" in the description. */
export function detectExperienceLevel(title: string, description?: string | null): ExperienceLevel | null {
  const t = title.toLowerCase();
  if (/\b(intern|internship|trainee|graduate|fresher|entry[- ]level|junior|jr\.?)\b/.test(t)) return 'ENTRY';
  if (/\b(principal|distinguished|architect|director|head of|vp)\b/.test(t)) return 'PRINCIPAL';
  if (/\b(lead|staff|manager)\b/.test(t)) return 'LEAD';
  if (/\b(senior|sr\.?|sde ?(iii|3)|level 3)\b/.test(t)) return 'SENIOR';
  if (/\b(mid|intermediate|sde ?(ii|2))\b/.test(t)) return 'MID';
  const m = /(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?(?:years|yrs)/i.exec(description ?? '');
  if (m) {
    const y = Number(m[1]);
    if (y <= 1) return 'ENTRY';
    if (y <= 4) return 'MID';
    if (y <= 7) return 'SENIOR';
    return 'LEAD';
  }
  return null;
}

const INDIA = /\b(india|indian|bangalore|bengaluru|mumbai|pune|hyderabad|chennai|delhi|ncr|gurgaon|gurugram|noida|kolkata|ahmedabad|kochi|jaipur|ist)\b/i;
const OPEN_WORLD = /\b(worldwide|anywhere|global|globally|international|asia|apac|emea\s*\+\s*apac|all countries)\b/i;
const RESTRICTED = /\b(usa?|united states|us only|u\.s\.|americas?|north america|canada|mexico|latam|latin america|brazil|europe|eu|emea|uk|united kingdom|germany|france|spain|netherlands|poland|portugal|australia|new zealand|cet|est|pst|cst)\b/i;

/**
 * Can someone living in India take this job? True for jobs located in India and for remote jobs
 * open worldwide or to Asia; false for remote jobs limited to other regions; null when the posting
 * doesn't say (shown as "eligibility unclear", never as eligible).
 */
export function detectIndiaEligible(location: string | null | undefined, workMode: WorkMode, description?: string | null): boolean | null {
  const loc = location ?? '';
  if (INDIA.test(loc)) return true;
  if (workMode !== 'REMOTE') return loc ? false : null;
  if (OPEN_WORLD.test(loc)) return true;
  if (RESTRICTED.test(loc)) return false;
  // Remote with no location: look for an explicit statement in the description
  const d = (description ?? '').slice(0, 4000);
  if (/\b(open to|hire|hiring)\b[^.]{0,40}\b(worldwide|anywhere|globally|india)\b/i.test(d)) return true;
  if (/\b(must (be|reside|live) in|only (open|available) to (candidates|applicants) in)\b[^.]{0,40}\b(us|usa|united states|europe|eu|uk|canada)\b/i.test(d)) return false;
  return null;
}

const COMPANY_NOISE = /\b(inc|llc|ltd|limited|pvt|private|gmbh|corp|corporation|co|technologies|technology|labs|software|solutions|india)\b/g;

/** "Razorpay Software Pvt Ltd" + "Sr. Frontend Engineer (React)" → "razorpay|sr frontend engineer react" */
export function dedupeKey(companyName: string, title: string): string {
  const company = companyName.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(COMPANY_NOISE, ' ').replace(/\s+/g, ' ').trim();
  const t = title.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return `${company}|${t}`.slice(0, 300);
}

const SOURCE_LABELS: Record<string, string> = {
  remotive: 'Remotive', remoteok: 'RemoteOK', arbeitnow: 'Arbeitnow', adzuna: 'Adzuna', greenhouse: 'Greenhouse', lever: 'Lever',
};

/** "greenhouse:razorpay:123" → "Greenhouse · razorpay" */
export function sourceNameFromExternalId(externalId: string | null | undefined): string {
  if (!externalId) return 'Added by you';
  const [src, board] = externalId.split(':');
  const label = SOURCE_LABELS[src ?? ''] ?? src ?? 'Unknown';
  return (src === 'greenhouse' || src === 'lever') && board ? `${label} · ${board}` : label;
}
