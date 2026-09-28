// Exercise catalogue. kind: 'bar' | 'db' | 'bw' | 'machine' | 'band'
// bar + bw progress is shared across locations (a barbell is a barbell);
// db, machine and band targets are kept per location.
export const CATALOG = {
  // barbell
  'Squats': 'bar', 'Deadlifts': 'bar', 'Calf Raises': 'bar', 'Incline Barbell Bench': 'bar', 'Barbell Overhead Press': 'bar',
  'Barbell Curl': 'bar', 'Bent Over Rows': 'bar',
  // dumbbell (per hand)
  'Incline Dumbbell Bench': 'db', 'Incline Dumbbell Curls': 'db', 'Dumbbell Overhead Press': 'db',
  'Dumbbell Lateral Raise': 'db', 'Lunges': 'db', 'Goblet Squats': 'db',
  // bodyweight (+kg added)
  'Dips': 'bw', 'Pull Ups': 'bw',
  // machine / cable
  'Leg Press': 'machine', 'Leg Extension': 'machine', 'Hamstring Curls': 'machine',
  'Cable Lateral Raise': 'machine', 'Rope Push Down': 'machine', 'Machine Fly': 'machine',
  'Machine Press': 'machine', 'Supported Row': 'machine', 'Cable Biceps': 'machine', 'Face Pulls': 'machine',
  // band
  'Band Push Down': 'band',
}

export const KIND_LABEL = { bar: 'Barbell', db: 'Dumbbell (per hand)', bw: 'Bodyweight (+kg added)', machine: 'Machine / cable', band: 'Band (level)' }
export const DEFAULT_INC = { bar: 2.5, db: 2.5, bw: 2.5, machine: 5, band: 1 }
export const unitFor = kind => kind === 'band' ? 'lvl' : 'kg'

export const DAYS = [
  { id: 'upper', label: 'Upper', color: '#4f9cf9' },
  { id: 'legs', label: 'Legs', color: '#4fc98a' },
]
export const dayById = id => DAYS.find(d => d.id === id)

const P = (...names) => names.map(n => typeof n === 'string' ? { name: n } : n)
const GYM = {
  legs: P('Squats', 'Deadlifts', 'Leg Press', 'Leg Extension', 'Hamstring Curls', 'Calf Raises'),
  upper: P('Incline Dumbbell Bench', 'Incline Dumbbell Curls', 'Cable Lateral Raise', 'Dumbbell Overhead Press', 'Dips',
    'Rope Push Down', 'Machine Fly', 'Machine Press', 'Barbell Curl', 'Pull Ups', 'Supported Row', 'Face Pulls'),
}
const clone = o => JSON.parse(JSON.stringify(o))

export function seedState() {
  const edwardstown = clone(GYM)
  edwardstown.upper = edwardstown.upper.map(x => x.name === 'Barbell Curl' ? { name: 'Cable Biceps' } : x)
  return {
    version: 3,
    locations: [
      { id: 'richmond', name: 'Richmond', program: clone(GYM) },
      { id: 'edwardstown', name: 'Edwardstown', program: edwardstown },
      {
        id: 'home', name: 'Home', program: {
          legs: P({ name: 'Squats', sets: 3 }, { name: 'Deadlifts', sets: 3 }, 'Lunges', 'Goblet Squats', 'Calf Raises'),
          upper: P({ name: 'Incline Barbell Bench', sets: 4 }, 'Incline Dumbbell Curls', 'Dumbbell Lateral Raise', 'Barbell Overhead Press',
            'Dips', 'Band Push Down', 'Barbell Curl', 'Pull Ups', 'Bent Over Rows'),
        },
      },
    ],
    custom: {},   // name -> kind, for exercises added by the user
    lastLoc: 'richmond',
    logs: [],     // {id, date, locId, day, entries:[{name, kind, sets:[{kg,reps}], mark}], review?}
  }
}

export function kindOf(state, name) {
  return state.custom?.[name] || CATALOG[name] || 'machine'
}
