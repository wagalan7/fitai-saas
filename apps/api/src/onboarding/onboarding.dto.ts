import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FitnessGoal, FitnessLevel } from '@prisma/client';

export class OnboardingAnswersDto {
  @IsOptional() @IsInt() @Min(10) @Max(120) age?: number;
  @IsOptional() @IsNumber() @Min(20) @Max(400) weightKg?: number;
  @IsOptional() @IsNumber() @Min(80) @Max(250) heightCm?: number;
  @IsOptional() @IsString() genderIdentity?: string;
  @IsOptional() @IsEnum(FitnessGoal) fitnessGoal?: FitnessGoal;
  @IsOptional() @IsEnum(FitnessLevel) fitnessLevel?: FitnessLevel;
  @IsOptional() @IsInt() @Min(1) @Max(7) workoutsPerWeek?: number;
  @IsOptional() @IsInt() @Min(10) @Max(240) workoutDuration?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) injuries?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) dietaryRestrictions?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) foodPreferences?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) availableEquipment?: string[];
  @IsOptional() @IsObject() dailyRoutine?: Record<string, any>;
}

export class SaveStepDto {
  @IsInt() @Min(0) @Max(20) step!: number;
  @ValidateNested() @Type(() => OnboardingAnswersDto) answers!: OnboardingAnswersDto;
}
