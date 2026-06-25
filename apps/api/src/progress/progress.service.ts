import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

// The client is supposed to downscale to ~1080px JPEG before upload, which
// lands well under this. We still cap server-side so a crafted request can't
// stuff a multi-megabyte blob into a TEXT column. ~2MB of raw bytes ≈ 2.7MB of
// base64 characters; allow a little headroom.
const MAX_IMAGE_CHARS = 3_000_000;

@Injectable()
export class ProgressService {
  constructor(private prisma: PrismaService) {}

  async logProgress(
    userId: string,
    data: {
      weightKg?: number;
      bodyFatPct?: number;
      muscleMassKg?: number;
      chestCm?: number;
      waistCm?: number;
      hipCm?: number;
      armCm?: number;
      legCm?: number;
      notes?: string;
    },
  ) {
    return this.prisma.progressLog.create({ data: { userId, ...data } });
  }

  async getHistory(userId: string, days = 90) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.prisma.progressLog.findMany({
      where: { userId, loggedAt: { gte: since } },
      orderBy: { loggedAt: 'asc' },
    });
  }

  async getSummary(userId: string) {
    const [profile, latest, oldest, workoutCount, mealCount] = await Promise.all([
      this.prisma.userProfile.findUnique({ where: { userId } }),
      this.prisma.progressLog.findFirst({
        where: { userId },
        orderBy: { loggedAt: 'desc' },
      }),
      this.prisma.progressLog.findFirst({
        where: { userId },
        orderBy: { loggedAt: 'asc' },
      }),
      this.prisma.workoutLog.count({ where: { userId } }),
      this.prisma.mealLog.count({ where: { userId } }),
    ]);

    const weightChange =
      latest?.weightKg && oldest?.weightKg
        ? +(latest.weightKg - oldest.weightKg).toFixed(1)
        : null;

    return {
      currentWeight: latest?.weightKg || profile?.weightKg,
      startWeight: oldest?.weightKg || profile?.weightKg,
      weightChange,
      totalWorkouts: workoutCount,
      totalMealsLogged: mealCount,
      latestMeasurements: latest,
    };
  }

  // ─── Progress photos ───────────────────────────────────────────────────────

  async addPhoto(
    userId: string,
    data: {
      imageData?: string;
      pose?: string;
      weightKg?: number;
      notes?: string;
    },
  ) {
    const imageData = data.imageData?.trim();
    if (!imageData || !imageData.startsWith('data:image/')) {
      throw new BadRequestException('Imagem inválida.');
    }
    if (imageData.length > MAX_IMAGE_CHARS) {
      throw new BadRequestException(
        'Imagem muito grande. Reduza a resolução e tente novamente.',
      );
    }

    const photo = await this.prisma.progressPhoto.create({
      data: {
        userId,
        imageData,
        pose: data.pose?.trim() || null,
        weightKg: typeof data.weightKg === 'number' ? data.weightKg : null,
        notes: data.notes?.trim() || null,
      },
    });
    return this.toMeta(photo);
  }

  // List photo metadata WITHOUT the heavy base64 blob so the gallery index is
  // cheap. The client fetches each image bytes separately via getPhoto().
  async listPhotos(userId: string) {
    const photos = await this.prisma.progressPhoto.findMany({
      where: { userId },
      orderBy: { takenAt: 'asc' },
      select: {
        id: true,
        pose: true,
        weightKg: true,
        notes: true,
        takenAt: true,
      },
    });
    return photos;
  }

  async getPhoto(userId: string, id: string) {
    const photo = await this.prisma.progressPhoto.findFirst({
      where: { id, userId },
    });
    if (!photo) throw new NotFoundException('Foto não encontrada.');
    return { id: photo.id, imageData: photo.imageData };
  }

  async deletePhoto(userId: string, id: string) {
    const photo = await this.prisma.progressPhoto.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!photo) throw new NotFoundException('Foto não encontrada.');
    await this.prisma.progressPhoto.delete({ where: { id } });
    return { deleted: true };
  }

  private toMeta(photo: {
    id: string;
    pose: string | null;
    weightKg: number | null;
    notes: string | null;
    takenAt: Date;
  }) {
    return {
      id: photo.id,
      pose: photo.pose,
      weightKg: photo.weightKg,
      notes: photo.notes,
      takenAt: photo.takenAt,
    };
  }
}
