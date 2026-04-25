import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEFAULT_CATEGORIES = [
  { name: 'Réactions', slug: 'reactions' },
  { name: 'Mèmes', slug: 'memes' },
  { name: 'Animation', slug: 'animation' },
  { name: 'Sport', slug: 'sport' },
  { name: 'Animaux', slug: 'animals' },
  { name: 'Divers', slug: 'misc' },
];

async function main() {
  console.info('🌱 Starting seed...');

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const bcryptCost = Number(process.env.BCRYPT_COST ?? 12);

  if (!adminEmail || !adminPassword) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env');
  }

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (existingAdmin) {
    console.info(`ℹ️  Admin user already exists: ${adminEmail}`);
  } else {
    const passwordHash = await bcrypt.hash(adminPassword, bcryptCost);

    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        role: 'admin',
        mustChangePassword: false,
      },
    });

    console.info(`✅ Admin user created: ${admin.email}`);
    console.info(`   ⚠️  Password must be changed on first login.`);
  }

  console.info('🌱 Seeding categories...');
  for (const category of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: category,
    });
  }
  console.info(`✅ ${DEFAULT_CATEGORIES.length} categories ready.`);

  console.info('🌱 Seed completed.');
}

main()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
