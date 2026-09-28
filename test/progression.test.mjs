import test from 'node:test'
import assert from 'node:assert/strict'
import { nextTarget, isStalled, targetFor, historyFor, trends } from '../app/lib/progression.js'
import { weekStart } from '../app/lib/dates.js'

const S = (kg, ...reps) => reps.map(r => ({ kg, reps: r }))
test('up when all sets hit 8', () => assert.deepEqual(nextTarget({ sets: S(80, 8, 8) }, 2.5), { kg: 82.5, reps: [5, 5], rule: 'up' }))
test('down when a set under 5', () => assert.deepEqual(nextTarget({ sets: S(80, 6, 4) }, 2.5), { kg: 77.5, reps: [6, 6], rule: 'down' }))
test('hold adds a rep capped at 8', () => assert.deepEqual(nextTarget({ sets: S(80, 8, 6) }, 2.5), { kg: 80, reps: [8, 7], rule: 'hold' }))
test('stall detection', () => {
  assert.equal(isStalled([{ sets: S(80, 6, 6) }, { sets: S(80, 6, 5) }, { sets: S(80, 6, 6) }]), true)
  assert.equal(isStalled([{ sets: S(80, 6, 6) }, { sets: S(80, 7, 6) }, { sets: S(80, 6, 6) }]), false)
})
const state = {
  custom: {}, logs: [
    { date: '2026-09-01', locId: 'g1', entries: [{ name: 'Squats', sets: S(100, 8, 8) }, { name: 'Leg Press', sets: S(60, 8, 7) }] },
    { date: '2026-09-05', locId: 'g2', entries: [{ name: 'Leg Press', sets: S(45, 6, 6) }] },
  ],
}
test('barbell shared across gyms, machines per gym', () => {
  assert.equal(targetFor(state, { name: 'Squats' }, 'home').kg, 102.5)
  assert.equal(targetFor(state, { name: 'Leg Press' }, 'g1').kg, 60)
  assert.deepEqual(targetFor(state, { name: 'Leg Press' }, 'g2').reps, [7, 7])
  assert.equal(historyFor(state, 'Leg Press', 'home').length, 0)
  assert.equal(targetFor(state, { name: 'Leg Press', start: { kg: 50 } }, 'home').kg, 50)
})
test('trends exclude machines', () => assert.deepEqual(trends(state).map(t => t.name), ['Squats']))
test('week starts Saturday', () => {
  assert.equal(weekStart(new Date(2026, 8, 28)), '2026-09-26') // Mon -> Sat
  assert.equal(weekStart(new Date(2026, 8, 26)), '2026-09-26') // Sat
  assert.equal(weekStart(new Date(2026, 9, 2)), '2026-09-26')  // Fri
})
test('set count per item: home squats 3 sets', () => {
  const t = targetFor(state, { name: 'Squats', sets: 3 }, 'home')
  assert.deepEqual(t.reps, [5, 5, 5])
  assert.deepEqual(nextTarget({ sets: S(60, 8, 7, 6) }, 2.5, 3).reps, [8, 8, 7])
  assert.equal(nextTarget({ sets: S(60, 8, 8, 8, 8) }, 2.5, 4).kg, 62.5)
})
