import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SavePlanFromChatDto {
  @IsString() @MinLength(20) @MaxLength(20000) text!: string;
}

/**
 * Free-form prefs passed at generation time — e.g. "treino longo: 5
 * peito + 3 tríceps", "foco em panturrilha". Kept loose on purpose so the
 * user can express anything the trainer prompt knows how to honor.
 */
export class GeneratePlanDto {
  @IsOptional() @IsString() @MaxLength(600) preferences?: string;
  // Mesocycle length in weeks (1-8). Defaults to 4 when omitted. The last
  // week of the cycle is a programmed deload.
  @IsOptional() @IsInt() @Min(1) @Max(8) cycleWeeks?: number;
}

export class ExerciseSetDto {
  @IsOptional() @IsInt() @Min(0) @Max(1000) reps?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(2000) weightKg?: number;
  @IsOptional() @IsInt() @Min(0) @Max(86400) durationSecs?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10) rpe?: number;
}

export class ExerciseLogDto {
  @IsString() @MinLength(1) @MaxLength(200) exerciseName!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ExerciseSetDto) sets!: ExerciseSetDto[];
}

export class LogWorkoutDto {
  @IsString() @MinLength(1) workoutSessionId!: string;
  @IsOptional() @IsInt() @Min(0) @Max(1440) durationMinutes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(5) rating?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ExerciseLogDto) exerciseLogs?: ExerciseLogDto[];
}
