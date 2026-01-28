import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotificationTracker } from '../../../src/notifications/tracker.js'
import { getDatabase, isDatabaseAvailable } from '../../../src/db/client.js'

// Mock del módulo de DB con errores
vi.mock('../../../src/db/client.js', () => ({
  getDatabase: vi.fn(),
  isDatabaseAvailable: vi.fn(),
}))

describe('NotificationTracker - Error Handling', () => {
  let tracker: NotificationTracker

  beforeEach(() => {
    tracker = new NotificationTracker()
    vi.clearAllMocks()
  })

  it('debe retornar false si wasSent tiene error de DB', async () => {
    const mockDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => {
              throw new Error('DB connection error')
            }),
          })),
        })),
      })),
    }

    // Simular que la DB está disponible pero falla al consultar
    vi.mocked(isDatabaseAvailable).mockReturnValue(true)
    vi.mocked(getDatabase).mockReturnValue(mockDb as unknown as ReturnType<typeof getDatabase>)

    const result = await tracker.wasSent('new_pr', 'delivery123', undefined, 'channel123')

    expect(result).toBe(false)
  })

  it('debe retornar false si wasSent no tiene suficiente información', async () => {
    // Simular que la DB está disponible
    vi.mocked(isDatabaseAvailable).mockReturnValue(true)
    vi.mocked(getDatabase).mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => []),
          })),
        })),
      })),
    } as unknown as ReturnType<typeof getDatabase>)

    const result1 = await tracker.wasSent('new_pr', undefined, undefined, 'channel123')
    expect(result1).toBe(false)

    const result2 = await tracker.wasSent('reminder', undefined, undefined, 'user123')
    expect(result2).toBe(false)
  })

  it('debe manejar error en markAsSent gracefully', async () => {
    const mockDb = {
      insert: vi.fn(() => ({
        values: vi.fn(() => {
          throw new Error('DB insert error')
        }),
      })),
    }

    // Simular que la DB está disponible pero falla al insertar
    vi.mocked(isDatabaseAvailable).mockReturnValue(true)
    vi.mocked(getDatabase).mockReturnValue(mockDb as unknown as ReturnType<typeof getDatabase>)

    // No debe lanzar error
    await expect(
      tracker.markAsSent('new_pr', 'delivery123', undefined, 'channel123', {
        reviewers: ['alice'],
      })
    ).resolves.not.toThrow()
  })

  it('debe retornar false si markAsSent no tiene suficiente información', async () => {
    const mockDb = {
      insert: vi.fn(() => ({
        values: vi.fn().mockResolvedValue(undefined),
      })),
    }

    // Simular que la DB está disponible
    vi.mocked(isDatabaseAvailable).mockReturnValue(true)
    vi.mocked(getDatabase).mockReturnValue(mockDb as unknown as ReturnType<typeof getDatabase>)

    // Para reminder sin prId, no debe hacer nada
    await tracker.markAsSent('reminder', undefined, undefined, 'user123')

    // No debe llamar insert si no hay suficiente información
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it('debe manejar error en checkAndMark gracefully', async () => {
    const mockDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => {
              throw new Error('DB error')
            }),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => {
          throw new Error('DB insert error')
        }),
      })),
    }

    // Simular que la DB está disponible pero falla
    vi.mocked(isDatabaseAvailable).mockReturnValue(true)
    vi.mocked(getDatabase).mockReturnValue(mockDb as unknown as ReturnType<typeof getDatabase>)

    // Debe retornar false (no estaba enviada) aunque haya error
    const result = await tracker.checkAndMark(
      'new_pr',
      'delivery123',
      undefined,
      'channel123'
    )

    expect(result).toBe(false)
  })
})
