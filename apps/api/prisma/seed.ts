import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

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

  // [Patch H-04] Validation stricte du mot de passe admin
  const MINIMUM_ADMIN_PASSWORD = 12;
  const COMMON_WEAK = ['admin', 'password', 'changeme', 'adminx', 'gifstudio'];

  if (!adminEmail || !adminPassword) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env');
  }
  if (adminPassword.length < MINIMUM_ADMIN_PASSWORD) {
    throw new Error(
      `ADMIN_PASSWORD trop court (min ${MINIMUM_ADMIN_PASSWORD} chars). Genere une vraie valeur.`,
    );
  }
  if (!/[A-Z]/.test(adminPassword) || !/\d/.test(adminPassword) || !/[^A-Za-z0-9]/.test(adminPassword)) {
    throw new Error('ADMIN_PASSWORD doit contenir majuscule + chiffre + caractere special');
  }
  const lower = adminPassword.toLowerCase();
  if (COMMON_WEAK.some((w) => lower.includes(w))) {
    throw new Error('ADMIN_PASSWORD contient un mot trop commun (admin, password, gifstudio, ...)');
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
