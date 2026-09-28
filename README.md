# Gym

Post-session logger for an upper/lower split across Richmond, Edwardstown and Home.

- **Log:** open a day, and every exercise is pre-filled with its next target. Tap ✓ (as planned), ↑ (beat it), ↓ (fell short) or – (skipped). Only ↑/↓ ask for numbers.
- **Progression rule (N × 5–8):** hit 8 on every set → add one step, aim 5s. Any set under 5 → stay and build reps (drops a step only if it happens two sessions running at the same weight). Otherwise → same weight, +1 rep per set.
- **Sharing:** barbell and bodyweight lifts progress across locations. Dumbbell, machine and band targets are kept per location.
- **Coach check:** after each save, Claude reviews the rule's next targets. Its notes show on the next session, with a one-tap "Use X kg".
- **Trends:** estimated 1RM per free-weight lift (machines are excluded).

Env: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `ANTHROPIC_API_KEY`, optional `ANTHROPIC_MODEL` (default `claude-sonnet-4-5`).
Data lives in Redis key `gymapp:v3`. The old app's `gym_sessions` key is untouched and can be imported from Programmes → Import.

`npm test` runs the progression tests.
