/**
 * Creates (or refreshes) the demo account with a filled-in profile and sample job-search data.
 * Safe to run more than once. Run with `npm run db:seed`.
 */
import { PrismaClient, SkillLevel } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { hasDemoData, loadDemoData } from '../apps/api/src/lib/demoData';

const prisma = new PrismaClient();

const DEMO_EMAIL = 'demo@careeros.dev';
const DEMO_PASSWORD = 'Demo@1234';

async function main() {
  if (process.env['NODE_ENV'] === 'production' && process.env['ALLOW_DEMO_SEED'] !== 'true') {
    throw new Error('Refusing to create the demo account in production. Set ALLOW_DEMO_SEED=true if you really want it.');
  }
  console.log('🌱 Seeding database...');

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { passwordHash, isActive: true },
    create: { email: DEMO_EMAIL, passwordHash, name: 'Demo User', emailVerified: true, isDemo: true },
  });

  const profileData = {
    headline: 'Frontend Developer | React · TypeScript · Tailwind',
    summary:
      '2 years building modern web applications. Enjoys clean UI and great user experiences. Looking for product companies with a strong engineering culture.',
    location: 'Jaipur, Rajasthan, India',
    city: 'Jaipur',
    state: 'Rajasthan',
    currentRole: 'Frontend Developer',
    currentCompany: 'Freelance',
    yearsOfExp: 2,
    targetRoles: ['Frontend Developer', 'React Developer', 'Full Stack Engineer'],
    targetLocations: ['Bengaluru', 'Remote'],
    remotePreference: 'REMOTE' as const,
    salaryMin: 600_000,
    salaryMax: 1_000_000,
    noticePeriod: '30 days',
    completionPct: 80,
  };
  const profile = await prisma.profile.upsert({
    where: { userId: user.id },
    update: profileData,
    create: { userId: user.id, ...profileData },
  });

  const skills: Array<{ name: string; level: SkillLevel; isPrimary: boolean }> = [
    { name: 'React', level: 'ADVANCED', isPrimary: true },
    { name: 'TypeScript', level: 'INTERMEDIATE', isPrimary: true },
    { name: 'JavaScript', level: 'ADVANCED', isPrimary: true },
    { name: 'Tailwind CSS', level: 'ADVANCED', isPrimary: true },
    { name: 'Node.js', level: 'INTERMEDIATE', isPrimary: false },
    { name: 'Git', level: 'INTERMEDIATE', isPrimary: false },
    { name: 'REST APIs', level: 'INTERMEDIATE', isPrimary: false },
    { name: 'Figma', level: 'BEGINNER', isPrimary: false },
  ];
  for (const skill of skills) {
    await prisma.skill.upsert({
      where: { profileId_name: { profileId: profile.id, name: skill.name } },
      update: { level: skill.level, isPrimary: skill.isPrimary },
      create: { profileId: profile.id, ...skill },
    });
  }

  if (!(await prisma.experience.count({ where: { profileId: profile.id } }))) {
    await prisma.experience.createMany({
      data: [
        {
          profileId: profile.id, title: 'Frontend Developer', company: 'Freelance', location: 'Remote',
          startDate: new Date('2024-06-01'), current: true,
          description: 'Built dashboards and marketing sites for small businesses with React, TypeScript and Tailwind.',
          technologies: ['React', 'TypeScript', 'Tailwind CSS'],
        },
        {
          profileId: profile.id, title: 'Web Developer Intern', company: 'Pixel Labs', location: 'Jaipur',
          startDate: new Date('2023-12-01'), endDate: new Date('2024-05-31'),
          description: 'Shipped UI components and fixed accessibility issues in a React codebase.',
          technologies: ['React', 'JavaScript', 'CSS'],
        },
      ],
    });
  }

  await prisma.userPreference.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });

  let summary = 'sample data already present';
  if (!(await hasDemoData(prisma, user.id))) {
    const r = await loadDemoData(prisma, user.id);
    summary = `${r.jobs} jobs, ${r.applications} applications`;
  }

  console.log('✅ Seeded:');
  console.log(`   - demo user ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`   - profile with ${skills.length} skills`);
  console.log(`   - ${summary}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
