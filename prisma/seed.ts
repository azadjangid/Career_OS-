import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create demo user
  const passwordHash = await bcrypt.hash('Demo@1234', 12);
  const user = await prisma.user.upsert({
    where: { email: 'demo@careeros.dev' },
    update: {},
    create: {
      email: 'demo@careeros.dev',
      passwordHash,
      name: 'Azad Jangid',
      role: 'USER',
      isVerified: true,
    },
  });

  // Create profile
  const profile = await prisma.userProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      headline: 'Frontend Developer | React · TypeScript · Tailwind',
      summary: '1.5+ years of experience building modern web applications. Passionate about clean UI and great user experiences. Looking for opportunities in product companies with strong engineering culture.',
      phone: '+91 98765 43210',
      location: 'Jaipur, Rajasthan, India',
      currentRole: 'Frontend Developer',
      currentCompany: 'Freelance',
      yearsOfExp: 2,
      linkedinUrl: 'https://linkedin.com/in/azadjangid',
      githubUrl: 'https://github.com/azadjangid',
      salaryMin: 600000,
      salaryMax: 800000,
      noticePeriod: '30 days',
    },
  });

  // Add skills
  const skills = [
    { name: 'React', level: 'ADVANCED', isPrimary: true },
    { name: 'TypeScript', level: 'INTERMEDIATE', isPrimary: true },
    { name: 'JavaScript', level: 'ADVANCED', isPrimary: true },
    { name: 'Tailwind CSS', level: 'ADVANCED', isPrimary: true },
    { name: 'Node.js', level: 'INTERMEDIATE', isPrimary: false },
    { name: 'Git', level: 'INTERMEDIATE', isPrimary: false },
    { name: 'REST APIs', level: 'INTERMEDIATE', isPrimary: false },
    { name: 'Figma', level: 'BEGINNER', isPrimary: false },
  ] as const;

  for (const skill of skills) {
    await prisma.skill.upsert({
      where: { profileId_name: { profileId: profile.id, name: skill.name } },
      update: {},
      create: { profileId: profile.id, ...skill },
    });
  }

  // Seed sample jobs
  const companies = [
    { name: 'Razorpay', city: 'Bengaluru' },
    { name: 'Zepto', city: 'Mumbai' },
    { name: 'Groww', city: 'Bengaluru' },
    { name: 'CRED', city: 'Bengaluru' },
    { name: 'Meesho', city: 'Bengaluru' },
    { name: 'PhonePe', city: 'Bengaluru' },
    { name: 'Swiggy', city: 'Bengaluru' },
    { name: 'Zomato', city: 'Gurugram' },
  ];

  const jobTitles = [
    'Frontend Developer',
    'React Developer',
    'UI Developer',
    'Software Engineer (Frontend)',
    'Full Stack Developer',
  ];

  const workModes = ['REMOTE', 'HYBRID', 'ONSITE'];
  const jobTypes = ['FULL_TIME', 'CONTRACT'];

  for (let i = 0; i < 20; i++) {
    const company = companies[i % companies.length];
    const title = jobTitles[i % jobTitles.length];
    const workMode = workModes[i % workModes.length];
    const jobType = jobTypes[i % jobTypes.length];
    const salaryMin = 600000 + (i % 5) * 200000;

    await prisma.job.create({
      data: {
        title,
        companyName: company.name,
        description: `We are looking for a talented ${title} to join our growing team. You will work on building and maintaining our web applications using modern React ecosystem.`,
        location: company.city,
        workMode: workMode as any,
        jobType: jobType as any,
        salaryMin,
        salaryMax: salaryMin + 300000,
        salaryCurrency: 'INR',
        skills: ['React', 'TypeScript', 'JavaScript', 'CSS', 'Git'],
        applyUrl: `https://jobs.example.com/${company.name.toLowerCase()}-${i}`,
        source: 'seed',
        externalId: `seed-${i}`,
        isActive: true,
        postedAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
      },
    });
  }

  console.log(`✅ Seeded:`);
  console.log(`   - 1 demo user (demo@careeros.dev / Demo@1234)`);
  console.log(`   - 1 user profile with ${skills.length} skills`);
  console.log(`   - 20 sample jobs`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
