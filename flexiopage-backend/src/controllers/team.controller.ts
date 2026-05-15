import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { AuthRequest } from '../middleware/auth.middleware';
import { User, type TeamRole } from '../models/User.model';
import { isTeamMember } from '../lib/owner';
import { notifyTeamMemberAdded, notifyTeamMemberRemoved } from '../services/notification.service';

const SALT_ROUNDS = 12;
const TEAM_ROLES: TeamRole[] = ['manager', 'confirmation_agent'];

/**
 * Team management — a seller invites staff (managers, confirmation agents)
 * who get their own login but operate inside the seller's account.
 *
 * Only a seller (a `role: 'user'` account with no `parentUserId`) can manage
 * their team. Team members themselves cannot.
 */

function ensureSeller(req: AuthRequest, res: Response): boolean {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return false;
  }
  if (isTeamMember(req.user)) {
    res.status(403).json({ error: "Les membres d'équipe ne peuvent pas gérer l'équipe." });
    return false;
  }
  return true;
}

export async function listTeam(req: AuthRequest, res: Response): Promise<void> {
  if (!ensureSeller(req, res)) return;
  const members = await User.find({ parentUserId: req.user!._id })
    .select('name email teamRole suspended createdAt lastLoginAt')
    .sort({ createdAt: -1 })
    .lean();
  res.json({ members });
}

export async function createTeamMember(req: AuthRequest, res: Response): Promise<void> {
  if (!ensureSeller(req, res)) return;
  const { name, email, password, teamRole } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    teamRole?: string;
  };

  if (!name?.trim() || !email?.trim() || !password) {
    res.status(400).json({ error: 'Nom, email et mot de passe sont requis.' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caractères.' });
    return;
  }
  if (!TEAM_ROLES.includes(teamRole as TeamRole)) {
    res.status(400).json({ error: 'Rôle invalide.', allowed: TEAM_ROLES });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    res.status(409).json({ error: 'Cet email est déjà utilisé.' });
    return;
  }

  const hashed = await bcrypt.hash(password, SALT_ROUNDS);
  const member = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    password: hashed,
    role: 'user',
    parentUserId: req.user!._id,
    teamRole: teamRole as TeamRole,
    emailVerified: true,
  });

  // In-app notification on the seller's bell (best-effort).
  try {
    await notifyTeamMemberAdded({
      userId: req.user!._id,
      memberEmail: member.email,
      memberRole: member.teamRole || 'membre',
    });
  } catch (err) {
    console.error('[notification] team.member_added failed (non-fatal):', (err as Error).message);
  }

  const { password: _p, ...safe } = member.toObject();
  res.status(201).json({ member: safe });
}

export async function updateTeamMember(req: AuthRequest, res: Response): Promise<void> {
  if (!ensureSeller(req, res)) return;
  const member = await User.findById(req.params.memberId);
  if (!member || member.parentUserId?.toString() !== req.user!._id.toString()) {
    res.status(404).json({ error: "Membre d'équipe introuvable." });
    return;
  }

  const { name, teamRole, suspended, password } = req.body as {
    name?: string;
    teamRole?: string;
    suspended?: boolean;
    password?: string;
  };

  if (typeof name === 'string' && name.trim()) member.name = name.trim();
  if (typeof teamRole === 'string') {
    if (!TEAM_ROLES.includes(teamRole as TeamRole)) {
      res.status(400).json({ error: 'Rôle invalide.', allowed: TEAM_ROLES });
      return;
    }
    member.teamRole = teamRole as TeamRole;
  }
  if (typeof suspended === 'boolean') {
    member.suspended = suspended;
    member.suspendedAt = suspended ? new Date() : undefined;
  }
  if (typeof password === 'string' && password) {
    if (password.length < 8) {
      res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caractères.' });
      return;
    }
    member.password = await bcrypt.hash(password, SALT_ROUNDS);
  }

  await member.save();
  const { password: _p, ...safe } = member.toObject();
  res.json({ member: safe });
}

export async function removeTeamMember(req: AuthRequest, res: Response): Promise<void> {
  if (!ensureSeller(req, res)) return;
  const member = await User.findById(req.params.memberId);
  if (!member || member.parentUserId?.toString() !== req.user!._id.toString()) {
    res.status(404).json({ error: "Membre d'équipe introuvable." });
    return;
  }
  const memberEmail = member.email;
  await member.deleteOne();
  try {
    await notifyTeamMemberRemoved({ userId: req.user!._id, memberEmail });
  } catch (err) {
    console.error('[notification] team.member_removed failed (non-fatal):', (err as Error).message);
  }
  res.json({ ok: true });
}
