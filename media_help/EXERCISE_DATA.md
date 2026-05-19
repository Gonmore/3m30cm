# Exercise Data — SetForge

---

## 1. Data Source

**Repository:** [omercotkd/exercises-gifs](https://github.com/omercotkd/exercises-gifs) (a curated mirror of the Kaggle ExerciseDB dataset)

| Resource | URL |
|----------|-----|
| CSV (exercises + IDs) | `https://raw.githubusercontent.com/omercotkd/exercises-gifs/main/exercises.csv` |
| GIF pattern | `https://raw.githubusercontent.com/omercotkd/exercises-gifs/main/assets/{id}.gif` |

The CSV contains ~1323 exercises as of the last script run. Each row has at minimum: `id` (zero-padded numeric string, e.g. `"0025"`) and `name`. Additional fields may include `bodypart`, `equipment`, `target` — treat as optional with safe fallback.

**CORS:** GitHub raw CDN returns `Access-Control-Allow-Origin: *`. No auth. URLs are stable.

---

## 2. Build Pipeline

```
GitHub CSV               scripts/fetchExercises.ts        App
─────────────────────────────────────────────────────────────────
exercises.csv       →    parse + enrich + validate    →    src/data/exercises.json
                         apply coaching notes                    │
                         ↓ (phase 2 only)                        ↓
                    Supabase Storage (GIFs)         exerciseCacheStore (Zustand)
                    Supabase exercises table              MMKV sf_exercises_cache
```

**Run the script:**
```bash
npx tsx scripts/fetchExercises.ts
```

This writes `src/data/exercises.json`. Commit this file — it is the bundled fallback for phase 1.

---

## 3. Cache Strategy (Phase 1)

In phase 1, `src/data/exercises.json` is bundled with the app. No network fetch at runtime.

- On app launch, `MmkvExerciseRepository` reads `exercises.json` (bundled asset) plus `sf_custom_exercises` (MMKV).
- The combined array is loaded into `exerciseCacheStore` (Zustand).
- GIFs are loaded lazily by `expo-image` — first access fetches + caches to disk, subsequent views are instant.

**Phase 2 addition:** On launch, if authenticated, fetch the latest exercises table from Supabase. Store in `sf_exercises_cache` with `cachedAt` timestamp. Refresh if older than 30 days.

---

## 4. `Exercise` Object Shape (from `exercises.json`)

```json
{
  "exercises": [
    {
      "id": "0025",
      "name": "Barbell Bench Press",
      "muscleGroup": "Chest",
      "equipment": "barbell",
      "notes": "Wrist wraps recommended. Grip slightly wider than shoulders. Control the eccentric.",
      "gifUrl": "https://raw.githubusercontent.com/omercotkd/exercises-gifs/main/assets/0025.gif",
      "isCustom": false
    }
  ],
  "generatedAt": "2025-04-03T00:00:00.000Z",
  "count": 1323
}
```

---

## 5. Custom Coaching Notes

These override the generic dataset descriptions. Applied during the build script. Exercise name is the join key — must match exactly.

### Pre-Loaded PPL Program — Full Coaching Notes

The default routine shipped with the app is a 6-day Push/Pull/Legs split. All coaching notes below override the CSV description.

---

#### Push A

| Exercise | Coaching Note |
|----------|--------------|
| Barbell Bench Press | Wrist wraps recommended. Grip slightly wider than shoulders. Control the eccentric — 2 seconds down, explosive up. |
| Incline Dumbbell Press | 30–45° incline. Full range of motion. Control the descent. Keep shoulder blades retracted throughout. |
| Cable Chest Fly | Slight forward lean. Slight elbow bend (never straight). Squeeze hard at peak contraction — pause 1 second. |
| Tricep Rope Pushdown | Full extension at the bottom. Split the rope apart at the end. Elbows fixed — don't swing the whole arm. |
| Lateral Raise | Slight forward lean, slight elbow bend. Lead with your elbows, not your hands. Stop at shoulder height. |
| Face Pulls | Pull to forehead level, not chin. Externally rotate at the end — thumbs back. Key for shoulder health; never skip. |

---

#### Pull A

| Exercise | Coaching Note |
|----------|--------------|
| Lat Pulldown | Full stretch at the top — arms overhead, feel the lat lengthen. Slight lean back. Pull to upper chest, not stomach. |
| Seated Cable Row | Drive elbows back, squeeze shoulder blades hard at the top. Controlled return — don't let the weight yank you forward. |
| Single-Arm Dumbbell Row | Brace the non-working hand on the bench. Drive elbow toward hip, not ceiling. Full range — let the shoulder drop at the bottom. |
| EZ Bar Curl | EZ bar is wrist-friendly — use it if straight bar hurts. No swinging. Squeeze at the top. Control the negative (3 sec down). |
| Hammer Curl | Neutral grip throughout — don't rotate the wrist. Great for brachialis thickness and forearm size. |
| Rear Delt Fly | Arms nearly straight — slight soft bend only. Rear delt isolation; go light, feel the squeeze. Don't shrug. |

---

#### Legs A

| Exercise | Coaching Note |
|----------|--------------|
| Barbell Back Squat | Depth: crease of hip below knee. Brace hard before descent. Drive knees out over toes. Stay upright — don't lean forward. |
| Romanian Deadlift | Slight knee bend (not a full bend — this is a hip hinge). Bar close to legs, drags up the shin. Feel the hamstring stretch. |
| Leg Press | Feet shoulder-width, mid-platform. Full range of motion — lower until knee is 90°. Don't lock out at the top. |
| Leg Extension | 3-second eccentric. Squeeze hard at the top for 1 second before lowering. Great knee health exercise when done controlled. |
| Standing Calf Raise | Full stretch at the bottom — pause 1 second in the hole. Squeeze hard at the top. Don't bounce out of the bottom. |
| Hip Thrust | Upper back on bench, bar on hip crease. Drive through heels. Pause and squeeze glutes hard at the top for 1 second. |

---

#### Push B

| Exercise | Coaching Note |
|----------|--------------|
| Seated DB Overhead Press | Slight forward lean. Full range — lower to ear height. Don't lock out at the top excessively; keep tension on the delts. |
| Incline Barbell Press | 45° incline. Elbows at 45° from torso (not flared). Upper chest and front delt emphasis. |
| Dumbbell Fly | Slight bend in elbows (not arms straight). Feel the stretch at the bottom — don't go lower than comfortable. Control the way down. |
| EZ Bar Skull Crusher | Lower to forehead (not behind the head). Keep elbows fixed — they shouldn't drift forward. Control the weight. |
| Cable Lateral Raise | Each arm separately. Cable keeps tension at the bottom (unlike dumbbells which go slack). Slow, controlled movement. |
| Overhead Cable Extension | Keep elbows tucked close to your head throughout — don't let them flare. Full extension at the top. |

---

#### Pull B

| Exercise | Coaching Note |
|----------|--------------|
| Barbell Row | Overhand grip, ~45° torso angle. Drive elbows toward hips, not upward. Not a deadlift — keep back angle consistent. |
| Cable Pullover | Rope attachment from high pulley. Keep slight bend in arms. Stretch at the top, squeeze lats at the bottom. |
| Pull-Up | Full dead hang at the bottom — arms fully extended. Chin clearly over the bar at top. Add weight once you can do 12 clean reps. |
| Preacher Curl EZ Bar | No swinging possible — strict form enforced by the pad. 3-second negative. Don't fully lock out at the bottom (keep tension). |
| Incline Dumbbell Curl | Incline creates full stretch of the bicep long head. Full range — arms straight at the bottom. |
| Face Pulls | Same as Push A. Pull to forehead, externally rotate. This is done on both push and pull days intentionally. |

---

#### Legs B

| Exercise | Coaching Note |
|----------|--------------|
| Romanian Deadlift | Same as Legs A. Hip hinge — not a squat. Bar close to legs. Feel the hamstring stretch at the bottom. |
| Bulgarian Split Squat | Front foot far enough forward. Keep torso upright. Each leg counted separately. Knee tracks over the toe. |
| Lying Leg Curl | Full range. Don't let hips rise off the pad on the concentric. Slow, controlled return. |
| Hack Squat | Shoulder-width feet. Full depth — lower than you think. Machine removes balance component, go heavier than back squat. |
| Seated Calf Raise | Soleus (lower calf) emphasis. Full stretch at the bottom — pause 1 second. Different feel than standing calf raises. |
| Cable Crunch | Kneeling or standing. Curl the spine — don't just pull with arms. Exhale sharply at the contraction. |

---

## 6. Default PPL Routine Structure

This is the starter routine loaded on first app launch (if no routines exist).

```typescript
// data/defaultRoutine.ts (abbreviated)
{
  id: 'default-ppl',
  name: 'Push / Pull / Legs',
  description: '6-day PPL split. Run Mon–Sat, rest Sunday. Alternate A/B variants.',
  days: [
    {
      id: 'push-a',
      name: 'Push A',
      dayIndex: 0,
      exercises: [
        { exerciseName: 'Barbell Bench Press',   sets: 4, repsMin: 6,  repsMax: 10, restSeconds: 180 },
        { exerciseName: 'Incline Dumbbell Press', sets: 3, repsMin: 8,  repsMax: 12, restSeconds: 120 },
        { exerciseName: 'Cable Chest Fly',        sets: 3, repsMin: 12, repsMax: 15, restSeconds: 90  },
        { exerciseName: 'Tricep Rope Pushdown',   sets: 3, repsMin: 10, repsMax: 15, restSeconds: 90  },
        { exerciseName: 'Lateral Raise',          sets: 4, repsMin: 12, repsMax: 20, restSeconds: 60  },
        { exerciseName: 'Face Pulls',             sets: 3, repsMin: 15, repsMax: 20, restSeconds: 60  },
      ]
    },
    // Pull A, Legs A, Push B, Pull B, Legs B ...
  ]
}
```

All exercises in the default routine must have a corresponding entry in `exerciseGifMap` (or the CSV dataset). The names must match exactly — they are the join key.

---

## 7. Adding New Exercises

1. Add the coaching note to the `COACHING_NOTES` map in `scripts/fetchExercises.ts`.
2. If the exercise is not in the CSV dataset, add it manually to `src/data/exercises.json` with `isCustom: false` and a manually found `gifUrl`.
3. Re-run `npx tsx scripts/fetchExercises.ts` to regenerate the JSON.
4. If referenced in the default routine, the name must exactly match the `name` field.
