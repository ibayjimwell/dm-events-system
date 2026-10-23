
import 'dotenv/config';

import { db } from '../src/db';
import {
  users,
  packages,
  siteContent,
  systemSettings,
} from '../src/db/schema';

import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

type SeedRole = 'ADMIN' | 'COORDINATOR';

interface SeedAccountOptions {
  email?: string;
  password?: string;
  fullName: string;
  role: SeedRole;
}

async function seedAccount({
  email,
  password,
  fullName,
  role,
}: SeedAccountOptions) {
  const normalizedEmail = email?.trim().toLowerCase();

  if (!normalizedEmail) {
    throw new Error(
      `SEED_${role}_EMAIL is required in .env`
    );
  }

  if (!password || password.length < 12) {
    throw new Error(
      `SEED_${role}_PASSWORD must be at least 12 characters.`
    );
  }

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existing) {
    if (existing.role !== role) {
      throw new Error(
        `Cannot seed ${normalizedEmail} as ${role}. ` +
        `This email already belongs to a ${existing.role} account.`
      );
    }

    console.log(
      `${role} account already exists, unchanged: ${normalizedEmail}`
    );

    return existing;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [created] = await db
    .insert(users)
    .values({
      email: normalizedEmail,
      passwordHash,
      fullName,
      role,
      isActive: true,
      emailVerifiedAt: new Date(),
    })
    .returning();

  console.log(
    `${role} account created successfully: ${normalizedEmail}`
  );

  return created;
}

async function seed() {
  console.log('Starting DM Events database seeding...');

  // ====================================================
  // 1. ADMINISTRATOR ACCOUNT
  // ====================================================

  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  // ====================================================
  // 2. COORDINATOR ACCOUNT
  // ====================================================

  const coordinatorEmail = process.env.SEED_COORDINATOR_EMAIL;
  const coordinatorPassword =
    process.env.SEED_COORDINATOR_PASSWORD;

  const coordinatorName =
    process.env.SEED_COORDINATOR_NAME?.trim() ||
    'DM Events Coordinator';

  if (
    adminEmail?.trim().toLowerCase() ===
    coordinatorEmail?.trim().toLowerCase()
  ) {
    throw new Error(
      'Administrator and Coordinator must use different email addresses.'
    );
  }

  // Validate credentials before writing accounts.
  for (const [role, email, password] of [
    ['ADMIN', adminEmail, adminPassword],
    ['COORDINATOR', coordinatorEmail, coordinatorPassword],
  ]) {
    if (!email?.trim() || !password || password.length < 12) {
      throw new Error(
        `Set SEED_${role}_EMAIL and SEED_${role}_PASSWORD ` +
        '(minimum 12 characters) in .env.'
      );
    }
  }

  // Create administrator.
  await seedAccount({
    email: adminEmail,
    password: adminPassword,
    fullName: 'DM Events Administrator',
    role: 'ADMIN',
  });

  // Create coordinator.
  await seedAccount({
    email: coordinatorEmail,
    password: coordinatorPassword,
    fullName: coordinatorName,
    role: 'COORDINATOR',
  });

  // ====================================================
  // 3. WEBSITE CONTENT
  // ====================================================

  await db
    .insert(siteContent)
    .values({
      id: 'main',
    })
    .onConflictDoNothing();

  console.log('Website content initialized.');

  // ====================================================
  // 4. SYSTEM SETTINGS
  // ====================================================

  await db
    .insert(systemSettings)
    .values({
      id: 'main',
    })
    .onConflictDoNothing();

  console.log('System settings initialized.');

  // ====================================================
  // 5. DEFAULT EVENT PACKAGES
  // ====================================================

  const [sample] = await db
    .select()
    .from(packages)
    .limit(1);

  if (!sample) {
    await db.insert(packages).values([
      {
        name: 'Package 01',
        description:
          'Package name, inclusions and quotation to be maintained by DM Events.',
        inclusions: ['Details set by DM Events'],
        published: true,
        sortOrder: 1,
      },
      {
        name: 'Package 02',
        description:
          'Package name, inclusions and quotation to be maintained by DM Events.',
        inclusions: ['Details set by DM Events'],
        published: true,
        sortOrder: 2,
      },
      {
        name: 'Package 03',
        description:
          'Package name, inclusions and quotation to be maintained by DM Events.',
        inclusions: ['Details set by DM Events'],
        published: true,
        sortOrder: 3,
      },
    ]);

    console.log(
      'Three placeholder event packages created.'
    );
  } else {
    console.log(
      'Event packages already exist, skipping.'
    );
  }

  console.log('DM Events database seeding completed.');
}

seed()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Database seeding failed:', error);
    process.exit(1);
  });
