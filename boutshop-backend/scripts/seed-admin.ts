/**
 * Create (or upgrade) an admin account for the platform-wide /admin dashboard.
 * Default credentials: admin@boutshop.dev / Admin1234!
 *
 * Idempotent: running it twice keeps the same user and just ensures role=admin.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/database';
import { User } from '../src/models/User.model';

const EMAIL = process.env.ADMIN_EMAIL || 'admin@flexiopage.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'Admin1234!';
const NAME = 'FlexioPage Admin';

async function main(): Promise<void> {
  await connectDB();
  let user = await User.findOne({ email: EMAIL });
  if (user) {
    if (user.role !== 'superadmin') {
      user.role = 'superadmin';
      await user.save();
      console.log(`✓ Upgraded ${EMAIL} → superadmin`);
    } else {
      console.log(`✓ ${EMAIL} already superadmin`);
    }
  } else {
    const hash = await bcrypt.hash(PASSWORD, 10);
    user = await User.create({
      email: EMAIL,
      password: hash,
      name: NAME,
      role: 'superadmin',
      emailVerified: true,
    });
    console.log(`✓ Created superadmin ${EMAIL}`);
  }
  console.log('');
  console.log('────────────────────────────────────────────────────────');
  console.log('  ADMIN ACCESS');
  console.log('────────────────────────────────────────────────────────');
  console.log(`    email    : ${EMAIL}`);
  console.log(`    password : ${PASSWORD}`);
  console.log(`    URL      : http://localhost:3001/admin`);
  console.log('────────────────────────────────────────────────────────');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Failed:', err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
