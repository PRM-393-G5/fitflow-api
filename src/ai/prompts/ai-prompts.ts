/**
 * Prompt contracts, OpenAI structured-output JSON schemas, and response
 * sanitizers for FitFlow's four AI features:
 * 1. Workout plan generator
 * 2. Daily meal-plan generator
 * 3. Food-photo dish & macro vision analyzer
 * 4. Post-set exercise form coach review
 */

export const WORKOUT_MUSCLE_GROUPS = [
  'Legs',
  'Chest',
  'Back',
  'Shoulders',
  'Arms',
  'Core',
  'Full body',
  'Cardio',
] as const;

export const WORKOUT_LEVELS = ['Beginner', 'Intermediate', 'Advanced'] as const;
export const WORKOUT_CATEGORIES = ['Strength', 'Cardio', 'Mobility'] as const;
export const MAX_WORKOUT_EXERCISES = 12;

export const WORKOUT_PLAN_SYSTEM_PROMPT = `You are a fitness coach generating workout plans as JSON. Rules:
- 4-10 exercises ordered compound -> isolation -> core/stretch last.
- Timed holds use durationSeconds>0 and reps=0; rep exercises use
  reps>0 and durationSeconds=0.
- restSeconds 30-90 for strength work, 15-45 for cardio/mobility.
- weightKg is 0 for bodyweight exercises.
- Use common, recognizable exercise names in English.
- muscleGroup is one of: ${WORKOUT_MUSCLE_GROUPS.join(', ')}.
- level and category must come from the enums in the schema.`;

export const WORKOUT_PLAN_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    level: {
      type: 'string',
      enum: [...WORKOUT_LEVELS],
    },
    category: {
      type: 'string',
      enum: [...WORKOUT_CATEGORIES],
    },
    durationMinutes: { type: 'integer' },
    exercises: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          muscleGroup: { type: 'string', enum: [...WORKOUT_MUSCLE_GROUPS] },
          sets: { type: 'integer' },
          reps: { type: 'integer' },
          durationSeconds: { type: 'integer' },
          restSeconds: { type: 'integer' },
          weightKg: { type: 'number' },
        },
        required: [
          'name',
          'muscleGroup',
          'sets',
          'reps',
          'durationSeconds',
          'restSeconds',
          'weightKg',
        ],
        additionalProperties: false,
      },
    },
  },
  required: [
    'name',
    'description',
    'level',
    'category',
    'durationMinutes',
    'exercises',
  ],
  additionalProperties: false,
};

export function buildWorkoutUserPrompt(params: {
  request: string;
  level?: string;
  durationMinutes?: number;
  goal?: string;
}): string {
  const lines = [`Create a workout plan.\nRequest: "${params.request.trim()}"`];
  if (params.level) lines.push(`Level: ${params.level}`);
  if (params.durationMinutes !== undefined) {
    lines.push(`Target duration: ${params.durationMinutes} minutes`);
  }
  if (params.goal) lines.push(`User goal: ${params.goal}`);
  return lines.join('\n');
}

export const MEAL_PLAN_SYSTEM_PROMPT = `You are a nutritionist generating a day meal plan as JSON. Rules:
- Split the day into exactly the requested meals, following the kcal
  split given in the request.
- Total calories within +/-10% of the target.
- Every item carries realistic kcal and macro estimates (grams).
- Use common, recognizable dish names in English.
- note is one short sentence of advice for the user's goal.`;

export const MEAL_PLAN_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    meals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                kcal: { type: 'integer' },
                proteinG: { type: 'number' },
                carbsG: { type: 'number' },
                fatG: { type: 'number' },
              },
              required: ['name', 'kcal', 'proteinG', 'carbsG', 'fatG'],
              additionalProperties: false,
            },
          },
        },
        required: ['label', 'items'],
        additionalProperties: false,
      },
    },
    totalKcal: { type: 'integer' },
    note: { type: 'string' },
  },
  required: ['meals', 'totalKcal', 'note'],
  additionalProperties: false,
};

export function mealCalorieSplit(meals: number): Record<string, number> {
  return meals >= 4
    ? { Breakfast: 25, Lunch: 35, Dinner: 30, Snack: 10 }
    : { Breakfast: 30, Lunch: 40, Dinner: 30 };
}

export function buildMealPlanUserPrompt(params: {
  targetKcal: number;
  proteinG: number;
  meals: number;
  goal?: string;
  preferences?: string;
}): string {
  const split = mealCalorieSplit(params.meals);
  const shares = Object.entries(split)
    .map(
      ([label, pct]) =>
        `${label} ${pct}% (~${Math.round((params.targetKcal * pct) / 100)} kcal)`,
    )
    .join(', ');
  const lines = [
    `Create a day meal plan.\nTarget: ${params.targetKcal} kcal, ~${params.proteinG} g protein, ${params.meals} meals`,
    `Split: ${shares}`,
  ];
  if (params.goal) lines.push(`User goal: ${params.goal}`);
  if (params.preferences && params.preferences.trim().length > 0) {
    lines.push(`Preferences/restrictions: ${params.preferences.trim()}`);
  }
  return lines.join('\n');
}

export const FOOD_PHOTO_SYSTEM_PROMPT = `You are a nutritionist identifying dishes in a food photo. Rules:
- List every distinct dish/food item you can see.
- Estimate kcal and macros per item from visible portion size.
- Be honest about uncertainty — note mentions portion assumptions.
- Use common dish names in English.`;

export const FOOD_PHOTO_USER_PROMPT =
  'Identify every dish in this photo and estimate kcal and macros per item.';

export const FOOD_PHOTO_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    dishes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          kcal: { type: 'integer' },
          proteinG: { type: 'number' },
          carbsG: { type: 'number' },
          fatG: { type: 'number' },
        },
        required: ['name', 'kcal', 'proteinG', 'carbsG', 'fatG'],
        additionalProperties: false,
      },
    },
    note: { type: 'string' },
  },
  required: ['dishes', 'note'],
  additionalProperties: false,
};

export const FORM_REVIEW_SYSTEM_PROMPT = `You are a lifting coach reviewing rep-by-rep telemetry from a phone
pose detector. Rules:
- summary: 2-3 sentences on overall form quality this set.
- tips: 1-3 concrete coaching cues addressing the detected faults.
- Reference rep numbers when calling out specific reps.
- Fault codes: shallowDepth, kneeValgus (knees caved in), forwardLean,
  heelsUp, asymmetry (one leg dominant), fastEccentric (dropped too fast).
- Be direct and encouraging; plain text only.`;

export const FORM_REVIEW_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    tips: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['summary', 'tips'],
  additionalProperties: false,
};

export interface RepTelemetryItem {
  number: number;
  minKneeAngle: number;
  descentMs: number;
  ascentMs: number;
  faults: string[];
}

export function buildFormReviewUserPrompt(params: {
  exercise: string;
  reps: RepTelemetryItem[];
}): string {
  return `Exercise: ${params.exercise}\nRep telemetry: ${JSON.stringify(params.reps)}`;
}

/** Sniffs PNG/WebP magic bytes from a base64 payload; defaults to image/jpeg. */
export function sniffBase64ImageMime(base64Data: string): string {
  try {
    const buf = Buffer.from(base64Data.slice(0, 32), 'base64');
    if (buf.length > 4 && buf[0] === 0x89 && buf[1] === 0x50) {
      return 'image/png';
    }
    if (buf.length > 12 && buf[8] === 0x57 && buf[9] === 0x45) {
      return 'image/webp';
    }
  } catch {
    // Fall back to image/jpeg on malformed prefix.
  }
  return 'image/jpeg';
}
