import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, AlertTriangle } from 'lucide-react'
import { parseTeamTasksJson } from '../../../shared/teams.js'

const CURATED_GOALS = [
  'Welcome visitors and tell them about this room',
  'Run a fun poll or game with guests in the room',
  'Decorate or tidy the stage area for an event',
  'Greet new guests and help them find their way around',
  'Host a Q&A session and answer visitor questions',
]

const GOAL_MIN_LENGTH = 10
const GOAL_MAX_LENGTH = 4000

function getSessionGoalPlaceholder(team) {
  if (team?.description?.trim()) return team.description.trim()
  const tasks = parseTeamTasksJson(team)
  if (tasks.length > 0 && tasks[0].title?.trim()) return `Try: ${tasks[0].title.trim()}`
  return `What should your team do in room ${team?.default_room_id || 'the room'} this session?`
}

export function DeployGoalModal({ team, roomId, deploying, onClose, onConfirm }) {
  const [mode, setMode] = useState('team_tasks')
  const [goal, setGoal] = useState('')
  const [error, setError] = useState(null)

  const goalTrimmed = goal.trim()
  const goalValid = goalTrimmed.length >= GOAL_MIN_LENGTH && goalTrimmed.length <= GOAL_MAX_LENGTH
  const canDeploy = mode === 'team_tasks' || goalValid

  const taskChips = useMemo(() => {
    const fromTasks = parseTeamTasksJson(team)
      .map(t => t.title?.trim())
      .filter(t => t && t.length >= GOAL_MIN_LENGTH)
      .slice(0, 3)
    const seen = new Set(fromTasks.map(s => s.toLowerCase()))
    return [...fromTasks, ...CURATED_GOALS.filter(s => !seen.has(s.toLowerCase()))]
  }, [team])

  async function handleDeploy() {
    setError(null)
    const options = mode === 'session_goal'
      ? { task_mode: 'session_goal', session_goal: goalTrimmed }
      : { task_mode: 'team_tasks' }
    const err = await onConfirm(options)
    if (err) {
      setError(err)
    } else {
      onClose()
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
          <div>
            <p className="font-semibold text-foreground text-sm">Deploy team</p>
            <p className="text-xs text-muted-foreground mt-0.5">{team.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pt-4 pb-2">
          <div className="grid grid-cols-2 gap-2 bg-muted/40 rounded-xl p-1">
            <button
              onClick={() => setMode('team_tasks')}
              className={`rounded-lg py-2.5 px-3 text-xs font-medium transition-all text-center ${mode === 'team_tasks' ? 'bg-card shadow-sm border border-border text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <span className="block font-semibold">Team tasks</span>
              <span className="block text-muted-foreground font-normal mt-0.5">Run designed tasks</span>
            </button>
            <button
              onClick={() => setMode('session_goal')}
              className={`rounded-lg py-2.5 px-3 text-xs font-medium transition-all text-center ${mode === 'session_goal' ? 'bg-card shadow-sm border border-border text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <span className="block font-semibold">My task</span>
              <span className="block text-muted-foreground font-normal mt-0.5">Give a custom goal</span>
            </button>
          </div>
        </div>

        {mode === 'session_goal' && (
          <div className="px-6 pt-2 pb-4 space-y-3">
            <textarea
              className="w-full rounded-xl border border-border bg-background text-sm px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 placeholder:text-muted-foreground/60 transition-all"
              rows={4}
              maxLength={GOAL_MAX_LENGTH}
              placeholder={getSessionGoalPlaceholder(team)}
              value={goal}
              onChange={e => { setGoal(e.target.value); setError(null) }}
              autoFocus
            />
            {goal.length > 0 && goalTrimmed.length < GOAL_MIN_LENGTH && (
              <p className="text-xs text-warning">At least {GOAL_MIN_LENGTH} characters required ({GOAL_MIN_LENGTH - goalTrimmed.length} more needed)</p>
            )}
            {goal.length > 0 && <p className="text-xs text-muted-foreground/60 text-right">{goalTrimmed.length}/{GOAL_MAX_LENGTH}</p>}

            <div className="flex flex-wrap gap-1.5">
              {taskChips.map(chip => (
                <button
                  key={chip}
                  onClick={() => { setGoal(chip); setError(null) }}
                  className="inline-flex items-center px-2.5 py-1 rounded-full bg-muted/60 border border-border text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-muted transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === 'team_tasks' && (
          <div className="px-6 py-4">
            <p className="text-xs text-muted-foreground">The team will run its designed tasks as usual.</p>
          </div>
        )}

        {error && (
          <div className="mx-6 mb-3 flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        <div className="flex gap-2 px-6 pb-5">
          <button onClick={onClose} className="flex-1 h-9 rounded-lg border border-border text-sm hover:bg-secondary transition-colors">
            Cancel
          </button>
          <button
            onClick={handleDeploy}
            disabled={!canDeploy || deploying}
            className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {deploying ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Deploying…</> : 'Deploy'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
