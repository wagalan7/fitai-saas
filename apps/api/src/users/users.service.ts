import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getMe(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        createdAt: true,
        profile: true,
        onboarding: { select: { status: true, currentStep: true } },
        subscription: { select: { plan: true, status: true } },
      },
    });
  }

  async updateProfile(userId: string, data: Partial<{
    name: string;
    avatarUrl: string;
  }>) {
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, email: true, name: true, avatarUrl: true },
    });
  }
}
