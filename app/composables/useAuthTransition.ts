/**
 * The shared timeline between the sign-in page and the app (handoff
 * `06-motion.md` › Anmeldung und Abmeldung):
 *
 *   signing in   background 720ms, the form leaves 52px left over 380ms, the
 *                image area and logo scale; from 900ms the app arrives,
 *                scaling .88 → 1 over 800ms
 *   signing out  the same timeline backwards
 *   reduced      a 140ms cross-fade, nothing moves
 *
 * One phase in shared state, read by both layouts as `data-auth-phase`, so the
 * two halves of the timeline start from one moment. A second trigger while one
 * is running is ignored — the guard the guideline asks for — and every phase
 * returns to `idle`, so nothing is left animating. The handoff names the
 * timings but not the keyframes (those are in the reference source it cites),
 * so the shapes in `main.css` › AUTH TRANSITION follow the timings and are
 * recorded as an approximation in `docs/connect2scale.md`.
 */
type Phase = 'idle' | 'leaving-auth' | 'arriving-app' | 'leaving-app' | 'arriving-auth'

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export function useAuthTransition() {
  const phase = useState<Phase>('auth-phase', () => 'idle')
  const reduced = () => import.meta.client && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  async function run(out: Phase, into: Phase, go: () => Promise<unknown>) {
    if (phase.value !== 'idle') return
    phase.value = out
    await wait(reduced() ? 140 : 900)
    phase.value = into
    try {
      await go()
    } finally {
      await wait(reduced() ? 140 : 800)
      phase.value = 'idle'
    }
  }

  return {
    phase,
    /** Sign-in succeeded: play the hand-over, then `go` into the app. */
    enterApp: (go: () => Promise<unknown>) => run('leaving-auth', 'arriving-app', go),
    /** Signing out: the same timeline backwards, then `go` to the sign-in page. */
    leaveApp: (go: () => Promise<unknown>) => run('leaving-app', 'arriving-auth', go)
  }
}
