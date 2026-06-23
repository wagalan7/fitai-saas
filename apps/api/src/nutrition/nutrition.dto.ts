import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class SavePlanFromChatDto {
  @IsString() @MinLength(20) @MaxLength(20000) text!: string;
}

export class AdjustDietDto {
  // Optional explicit override; omit to apply the recommended delta.
  @IsOptional() @IsInt() @Min(-300) @Max(300) deltaKcal?: number;
}

export class LogMealDto {
  @IsString() @MinLength(1) @MaxLength(200) mealName!: string;
  @IsNumber() @Min(0) @Max(20000) calories!: number;
  @IsNumber() @Min(0) @Max(2000) proteinG!: number;
  @IsNumber() @Min(0) @Max(2000) carbsG!: number;
  @IsNumber() @Min(0) @Max(2000) fatG!: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
