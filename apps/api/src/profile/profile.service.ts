import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { FitnessGoal, FitnessLevel } from '@prisma/client';

export interface UpdateProfileDto {
  name?: string;
  cpf?: string;
  phone?: string;
  address?: string;
  genderIdentity?: string;
  age?: number;
  weightKg?: number;
  heightCm?: number;
  fitnessGoal?: FitnessGoal;
  fitnessLevel?: FitnessLevel;
  workoutsPerWeek?: number;
  workoutDuration?: number;
  injuries?: string[];
  dietaryRestrictions?: string[];
  availableEquipment?: string[];
}

function validateCPF(cpf: string): boolean {
  const clean = cpf.replace(/[^\d]/g, '');
  if (clean.length !== 11) return false;
  if (/^(\d)\1+$/.test(clean)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(clean[i]) * (10 - i);
  let r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(clean[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(clean[i]) * (11 - i);
  r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === parseInt(clean[10]);
}

@Injectable()
export class ProfileService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    const [user, profile] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } }),
      this.prisma.userProfile.findUnique({ where: { userId } }),
    ]);

    const isComplete = !!(
      user?.name &&
      profile?.cpf &&
      profile?.phone &&
      profile?.genderIdentity &&
      profile?.age &&
      profile?.age > 0 &&
      profile?.address
    );

    return { user, profile, isComplete };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const { name, cpf, phone, address, genderIdentity, age, weightKg, heightCm,
      fitnessGoal, fitnessLevel, workoutsPerWeek, workoutDuration,
      injuries, dietaryRestrictions, availableEquipment } = dto;

    // Validate CPF if provided
    if (cpf) {
      const clean = cpf.replace(/[^\d]/g, '');
      if (!validateCPF(clean)) {
        throw new BadRequestException('CPF inválido');
      }
    }

    // Validate phone
    if (phone) {
      const cleanPhone = phone.replace(/[^\d]/g, '');
      if (cleanPhone.length < 10 || cleanPhone.length > 11) {
        throw new BadRequestException('Telefone inválido');
      }
    }

    // Validate age
    if (age !== undefined && (age < 1 || age > 120)) {
      throw new BadRequestException('Idade inválida');
    }

    // Update user name
    if (name) {
      await this.prisma.user.update({ where: { id: userId }, data: { name } });
    }

    // Upsert profile
    const profileData: any = {};
    if (cpf !== undefined) profileData.cpf = cpf.replace(/[^\d]/g, '');
    if (phone !== undefined) profileData.phone = phone.replace(/[^\d]/g, '');
    if (address !== undefined) profileData.address = address;
    if (genderIdentity !== undefined) profileData.genderIdentity = genderIdentity;
    if (age !== undefined) profileData.age = Number(age);
    if (weightKg !== undefined) profileData.weightKg = Number(weightKg);
    if (heightCm !== undefined) profileData.heightCm = Number(heightCm);
    if (fitnessGoal !== undefined) profileData.fitnessGoal = fitnessGoal;
    if (fitnessLevel !== undefined) profileData.fitnessLevel = fitnessLevel;
    if (workoutsPerWeek !== undefined) profileData.workoutsPerWeek = Number(workoutsPerWeek);
    if (workoutDuration !== undefined) profileData.workoutDuration = Number(workoutDuration);
    if (injuries !== undefined) profileData.injuries = injuries;
    if (dietaryRestrictions !== undefined) profileData.dietaryRestrictions = dietaryRestrictions;
    if (availableEquipment !== undefined) profileData.availableEquipment = availableEquipment;

    await this.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        age: profileData.age ?? 0,
        weightKg: profileData.weightKg ?? 0,
        heightCm: profileData.heightCm ?? 0,
        fitnessGoal: profileData.fitnessGoal ?? FitnessGoal.GENERAL_FITNESS,
        fitnessLevel: profileData.fitnessLevel ?? FitnessLevel.BEGINNER,
        injuries: profileData.injuries ?? [],
        dietaryRestrictions: profileData.dietaryRestrictions ?? [],
        foodPreferences: [],
        availableEquipment: profileData.availableEquipment ?? [],
        ...profileData,
      },
      update: profileData,
    });

    return this.getProfile(userId);
  }
}
