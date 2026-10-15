import {
  buildFormReviewUserPrompt,
  buildMealPlanUserPrompt,
  buildWorkoutUserPrompt,
  FOOD_PHOTO_SCHEMA,
  FORM_REVIEW_SCHEMA,
  MEAL_PLAN_SCHEMA,
  mealCalorieSplit,
  sniffBase64ImageMime,
  WORKOUT_PLAN_SCHEMA,
} from './ai-prompts.js';

describe('AI prompt builders and schemas', () => {
  it('formats workout user prompts with optional level, duration and goal', () => {
    const minimal = buildWorkoutUserPrompt({ request: ' Upper body push ' });
    expect(minimal).toBe('Create a workout plan.\nRequest: "Upper body push"');

    const full = buildWorkoutUserPrompt({
      request: 'Leg day',
      level: 'Intermediate',
      durationMinutes: 45,
      goal: 'Build muscle',
    });
    expect(full).toContain('Level: Intermediate');
    expect(full).toContain('Target duration: 45 minutes');
    expect(full).toContain('User goal: Build muscle');
    expect(WORKOUT_PLAN_SCHEMA.additionalProperties).toBe(false);
  });

  it('computes 3-meal and 4-meal calorie splits that sum to 100%', () => {
    const three = mealCalorieSplit(3);
    expect(Object.values(three).reduce((a, b) => a + b, 0)).toBe(100);

    const four = mealCalorieSplit(4);
    expect(Object.values(four).reduce((a, b) => a + b, 0)).toBe(100);

    const prompt = buildMealPlanUserPrompt({
      targetKcal: 2000,
      proteinG: 150,
      meals: 4,
      goal: 'Lose fat',
      preferences: 'no dairy',
    });
    expect(prompt).toContain('2000 kcal, ~150 g protein, 4 meals');
    expect(prompt).toContain('Breakfast 25% (~500 kcal)');
    expect(prompt).toContain('User goal: Lose fat');
    expect(prompt).toContain('Preferences/restrictions: no dairy');
    expect(MEAL_PLAN_SCHEMA.additionalProperties).toBe(false);
  });

  it('builds form-review prompt and sniffs PNG/WebP/JPEG magic bytes', () => {
    const prompt = buildFormReviewUserPrompt({
      exercise: 'Back Squat',
      reps: [
        {
          number: 1,
          minKneeAngle: 85,
          descentMs: 1200,
          ascentMs: 900,
          faults: [],
        },
      ],
    });
    expect(prompt).toContain('Exercise: Back Squat');
    expect(prompt).toContain('"minKneeAngle":85');
    expect(FOOD_PHOTO_SCHEMA.additionalProperties).toBe(false);
    expect(FORM_REVIEW_SCHEMA.additionalProperties).toBe(false);

    const pngB64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]).toString(
      'base64',
    );
    expect(sniffBase64ImageMime(pngB64)).toBe('image/png');

    const webpB64 = Buffer.from('RIFFxxxxWEBPVP8 ', 'ascii').toString('base64');
    expect(sniffBase64ImageMime(webpB64)).toBe('image/webp');

    const jpgB64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString('base64');
    expect(sniffBase64ImageMime(jpgB64)).toBe('image/jpeg');
  });
});
