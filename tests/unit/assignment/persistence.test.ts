import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AssignmentPersistence } from '../../../src/assignment/persistence.js'
import { getDatabase } from '../../../src/db/client.js'

// Mock del módulo de DB
vi.mock('../../../src/db/client.js', () => ({
  getDatabase: vi.fn(),
}))

describe('AssignmentPersistence', () => {
  let persistence: AssignmentPersistence
  let mockDb: {
    select: ReturnType<typeof vi.fn>
    insert: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.clearAllMocks()

    mockDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => []),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn().mockResolvedValue(undefined),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(undefined),
        })),
      })),
    }

    vi.mocked(getDatabase).mockReturnValue(mockDb as unknown as ReturnType<typeof getDatabase>)
    persistence = new AssignmentPersistence()
  })

  describe('getLastAssignedReviewer', () => {
    it('debe retornar null si no hay historial', async () => {
      const result = await persistence.getLastAssignedReviewer('repo1', 'round-robin')

      expect(result).toBeNull()
    })

    it('debe retornar el último reviewer asignado', async () => {
      const mockResult = [
        {
          id: 'repo1/round-robin',
          repositoryId: 'repo1',
          strategy: 'round-robin',
          lastAssignedReviewer: 'alice',
          lastAssignedAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => mockResult),
          })),
        })),
      }))

      const result = await persistence.getLastAssignedReviewer('repo1', 'round-robin')

      expect(result).toBe('alice')
    })

    it('debe retornar null si hay error en la DB', async () => {
      mockDb.select = vi.fn(() => {
        throw new Error('DB error')
      })

      const result = await persistence.getLastAssignedReviewer('repo1', 'round-robin')

      expect(result).toBeNull()
    })
  })

  describe('saveLastAssignedReviewer', () => {
    it('debe crear nuevo registro si no existe', async () => {
      // No hay registro existente
      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => []),
          })),
        })),
      }))

      await persistence.saveLastAssignedReviewer('repo1', 'round-robin', 'alice')

      expect(mockDb.insert).toHaveBeenCalled()
    })

    it('debe asegurar installation y repository cuando repositoryId tiene formato inst/owner/repo', async () => {
      const repositoryId = 'inst1/owner/repo-name'
      // ensureRepositoryExists hace 2 inserts (installations, repositories) con .values().onConflictDoNothing(); luego 1 insert (assignment_history) con .values()
      const insertWithConflict = () => ({
        values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) })),
      })
      mockDb.insert = vi.fn()
        .mockReturnValueOnce(insertWithConflict())
        .mockReturnValueOnce(insertWithConflict())
        .mockReturnValueOnce({ values: vi.fn().mockResolvedValue(undefined) })
      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => []),
          })),
        })),
      }))

      await persistence.saveLastAssignedReviewer(repositoryId, 'round-robin', 'alice')

      expect(mockDb.insert).toHaveBeenCalledTimes(3) // installations, repositories, assignment_history
    })

    it('debe actualizar registro existente', async () => {
      const mockExisting = [
        {
          id: 'repo1/round-robin',
          repositoryId: 'repo1',
          strategy: 'round-robin',
          lastAssignedReviewer: 'bob',
          lastAssignedAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => mockExisting),
          })),
        })),
      }))

      await persistence.saveLastAssignedReviewer('repo1', 'round-robin', 'alice')

      expect(mockDb.update).toHaveBeenCalled()
    })

    it('debe manejar errores gracefully', async () => {
      mockDb.select = vi.fn(() => {
        throw new Error('DB error')
      })

      // No debe lanzar error
      await expect(
        persistence.saveLastAssignedReviewer('repo1', 'round-robin', 'alice')
      ).resolves.not.toThrow()
    })

    it('con repositoryId inválido (menos de 3 partes) no inserta installations/repositories', async () => {
      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => []),
          })),
        })),
      }))
      const insertSpy = vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) }))
      mockDb.insert = insertSpy

      await persistence.saveLastAssignedReviewer('repo1', 'round-robin', 'alice')

      // ensureRepositoryExists con 'repo1' (1 parte) retorna sin insertar; solo 1 insert (assignment_history)
      expect(mockDb.insert).toHaveBeenCalledTimes(1)
    })
  })

  describe('getLastAssignedIndex', () => {
    it('debe retornar -1 si no hay historial', async () => {
      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => []),
          })),
        })),
      }))

      const members = [{ github: 'alice' }, { github: 'bob' }]
      const result = await persistence.getLastAssignedIndex('repo1', 'round-robin', members)

      expect(result).toBe(-1)
    })

    it('debe retornar el índice del último reviewer', async () => {
      const mockResult = [
        {
          id: 'repo1/round-robin',
          lastAssignedReviewer: 'bob',
        },
      ]

      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => mockResult),
          })),
        })),
      }))

      const members = [{ github: 'alice' }, { github: 'bob' }, { github: 'charlie' }]
      const result = await persistence.getLastAssignedIndex('repo1', 'round-robin', members)

      expect(result).toBe(1) // bob está en índice 1
    })

    it('debe retornar -1 si el reviewer ya no está en el equipo', async () => {
      const mockResult = [
        {
          id: 'repo1/round-robin',
          lastAssignedReviewer: 'old-member',
        },
      ]

      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => mockResult),
          })),
        })),
      }))

      const members = [{ github: 'alice' }, { github: 'bob' }]
      const result = await persistence.getLastAssignedIndex('repo1', 'round-robin', members)

      expect(result).toBe(-1)
    })

    it('debe ser case-insensitive al buscar reviewer', async () => {
      const mockResult = [
        {
          id: 'repo1/round-robin',
          lastAssignedReviewer: 'ALICE', // Mayúsculas
        },
      ]

      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => mockResult),
          })),
        })),
      }))

      const members = [{ github: 'alice' }, { github: 'bob' }] // Minúsculas
      const result = await persistence.getLastAssignedIndex('repo1', 'round-robin', members)

      expect(result).toBe(0) // Debe encontrar 'alice' aunque esté en mayúsculas
    })
  })
})
