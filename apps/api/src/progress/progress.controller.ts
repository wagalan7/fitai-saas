import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProgressService } from './progress.service';

@Controller('progress')
@UseGuards(JwtAuthGuard)
export class ProgressController {
  constructor(private progressService: ProgressService) {}

  @Post()
  log(@Req() req: { user: { id: string } }, @Body() body: any) {
    return this.progressService.logProgress(req.user.id, body);
  }

  @Get()
  getHistory(
    @Req() req: { user: { id: string } },
    @Query('days') days?: string,
  ) {
    return this.progressService.getHistory(req.user.id, days ? +days : 90);
  }

  @Get('summary')
  getSummary(@Req() req: { user: { id: string } }) {
    return this.progressService.getSummary(req.user.id);
  }

  // ─── Progress photos ───────────────────────────────────────────────────────

  @Post('photos')
  addPhoto(
    @Req() req: { user: { id: string } },
    @Body()
    body: { imageData?: string; pose?: string; weightKg?: number; notes?: string },
  ) {
    return this.progressService.addPhoto(req.user.id, body);
  }

  // Metadata index only (no base64 blobs) so the gallery loads fast.
  @Get('photos')
  listPhotos(@Req() req: { user: { id: string } }) {
    return this.progressService.listPhotos(req.user.id);
  }

  // Image bytes for a single photo, fetched lazily by the gallery.
  @Get('photos/:id')
  getPhoto(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.progressService.getPhoto(req.user.id, id);
  }

  @Delete('photos/:id')
  deletePhoto(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.progressService.deletePhoto(req.user.id, id);
  }
}
