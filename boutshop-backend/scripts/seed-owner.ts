/**
 * Create (or upgrade) the platform-owner account.
 * Default credentials: teyeb.hamza12@gmail.com / ownerhamza123
 *
 * The owner role is the top of the role hierarchy — it can do everything
 * a superadmin can do, plus grant the "owner" role itself.
 *
 * Idempotent: running it twice keeps the same user and just ensures role=owner.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/database';
import { User } from '../src/models/User.model';

const EMAIL = process.env.OWNER_EMAIL || 'teyeb.hamza12@gmail.com';
const PASSWORD = process.env.OWNER_PASSWORD || 'ownerhamza123';
const NAME = 'Platform Owner';

async function main(): Promise<void> {
  await connectDB();
  let user = await User.findOne({ email: EMAIL });
  if (user) {
    let changed = false;
    if (user.role !== 'owner') {
      user.role = 'owner';
      changed = true;
    }
    // Reset the password every run so the credentials documented here always work.
    user.password = await bcrypt.hash(PASSWORD, 10);
    changed = true;
    await user.save();
    console.log(`✓ ${changed ? 'Upgraded' : 'Refreshed'} ${EMAIL} → owner`);
  } else {
    const hash = await bcrypt.hash(PASSWORD, 10);
    user = await User.create({
      email: EMAIL,
      password: hash,
      name: NAME,
      role: 'owner',
      emailVerified: true,
    });
    console.log(`✓ Created owner ${EMAIL}`);
  }
  console.log('');
  console.log('────────────────────────────────────────────────────────');
  console.log('  OWNER ACCESS');
  console.log('────────────────────────────────────────────────────────');
  console.log(`    email    : ${EMAIL}`);
  console.log(`    password : ${PASSWORD}`);
  console.log(`    URL      : http://localhost:3002/admin`);
  console.log('────────────────────────────────────────────────────────');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Failed:', err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
