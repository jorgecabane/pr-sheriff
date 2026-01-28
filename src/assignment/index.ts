import { AssignmentEngine } from './engine.js'
import { RoundRobinStrategy } from './strategies/round-robin.js'
import { RandomStrategy } from './strategies/random.js'
import { LeastBusyStrategy } from './strategies/least-busy.js'

export function createAssignmentEngine(): AssignmentEngine {
  const engine = new AssignmentEngine()
  
  engine.registerStrategy('round-robin', new RoundRobinStrategy())
  engine.registerStrategy('random', new RandomStrategy())
  engine.registerStrategy('least-busy', new LeastBusyStrategy())
  
  return engine
}
