import { WORKOUT_TEMPLATES } from './workout-templates.seed.js';

describe('WORKOUT_TEMPLATES', () => {
  it('has unique template ids', () => {
    const ids = WORKOUT_TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(WORKOUT_TEMPLATES.map((template) => [template.id, template]))(
    '%s is a valid plan',
    (_, template) => {
      expect(template.durationMinutes).toBeGreaterThan(0);
      expect(template.exercises.length).toBeGreaterThan(0);
      const exerciseIds = template.exercises.map((exercise) => exercise.id);
      expect(new Set(exerciseIds).size).toBe(exerciseIds.length);
      for (const exercise of template.exercises) {
        expect(exercise.sets).toBeGreaterThan(0);
        // Either rep-based or timed, never both or neither.
        expect(exercise.reps > 0).not.toBe(exercise.durationSeconds > 0);
      }
    },
  );
});
