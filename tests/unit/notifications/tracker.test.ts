import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NotificationTracker } from '../../../src/notifications/tracker.js'
import { getDatabase, isDatabaseAvailable } from '../../../src/db/client.js'

vi.mock('../../../src/db/client.js', () => ({
  getDatabase: vi.fn(),
  isDatabaseAvailable: vi.fn(),
}))

describe('NotificationTracker', () => {
  let tracker: NotificationTracker

  beforeEach(() => {
    tracker = new NotificationTracker()
    vi.clearAllMocks()
  })

  describe('wasSent', () => {
    it('debe retornar false si no hay suficiente información para new_pr', async () => {
      const result = await tracker.wasSent('new_pr')
      expect(result).toBe(false)
    })

    it('debe retornar false si no hay suficiente información para reminder', async () => {
      const result = await tracker.wasSent('reminder', undefined, undefined, 'user123')
      expect(result).toBe(false)
    })

    it('debe retornar false si no hay suficiente información para blame', async () => {
      const result = await tracker.wasSent('blame', undefined, undefined, 'channel123')
      expect(result).toBe(false)
    })

    it('debe retornar false si la DB no está disponible', async () => {
      vi.mocked(isDatabaseAvailable).mockReturnValue(false)
      const result = await tracker.wasSent('new_pr', 'delivery123', undefined, 'channel123')
      expect(result).toBe(false)
    })

    it('debe retornar true si ya existe el registro en la DB', async () => {
      const mockDb = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([
                { id: 'new_pr/delivery123', type: 'new_pr', metadata: null },
              ]),
            })),
          })),
        })),
      }
      vi.mocked(isDatabaseAvailable).mockReturnValue(true)
      vi.mocked(getDatabase).mockReturnValue(mockDb as unknown as ReturnType<typeof getDatabase>)

      const result = await tracker.wasSent('new_pr', 'delivery123', undefined, 'channel123')
      expect(result).toBe(true)
    })
  })

  describe('markAsSent', () => {
    it('debe manejar errores gracefully', async () => {
      // Este test verifica que markAsSent no lanza errores
      // incluso si la DB no está disponible
      await expect(
        tracker.markAsSent('new_pr', 'delivery123', undefined, 'channel123', {
          reviewers: ['alice'],
        })
      ).resolves.not.toThrow()
    })

    it('no debe insertar si la DB no está disponible', async () => {
      vi.mocked(isDatabaseAvailable).mockReturnValue(false)
      const mockDb = { insert: vi.fn() }
      vi.mocked(getDatabase).mockReturnValue(mockDb as unknown as ReturnType<typeof getDatabase>)

      await tracker.markAsSent('new_pr', 'delivery123', undefined, 'channel123')

      expect(mockDb.insert).not.toHaveBeenCalled()
    })
  })

  describe('checkAndMark', () => {
    it('debe marcar como enviada si no estaba enviada', async () => {
      // checkAndMark consulta la DB; sin registro existente llama a markAsSent
      const mockInsert = vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) }))
      const mockDb = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([]), // No existe → marcar y enviar
            })),
          })),
        })),
        insert: mockInsert,
      }

      vi.mocked(isDatabaseAvailable).mockReturnValue(true)
      vi.mocked(getDatabase).mockReturnValue(mockDb as unknown as ReturnType<typeof getDatabase>)

      vi.spyOn(tracker, 'markAsSent').mockResolvedValue(undefined)

      const result = await tracker.checkAndMark(
        'new_pr',
        'delivery123',
        undefined,
        'channel123'
      )

      expect(result).toBe(false) // No estaba enviada → enviar
      expect(tracker.markAsSent).toHaveBeenCalledWith(
        'new_pr',
        'delivery123',
        undefined,
        'channel123',
        undefined
      )
    })

    it('debe retornar true si ya estaba enviada', async () => {
      // checkAndMark consulta la DB; con registro existente retorna true (ya enviado)
      const mockDb = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([
                { id: 'new_pr/delivery123', type: 'new_pr', metadata: null },
              ]),
            })),
          })),
        })),
      }

      vi.mocked(isDatabaseAvailable).mockReturnValue(true)
      vi.mocked(getDatabase).mockReturnValue(mockDb as unknown as ReturnType<typeof getDatabase>)

      const result = await tracker.checkAndMark(
        'new_pr',
        'delivery123',
        undefined,
        'channel123'
      )

      expect(result).toBe(true) // Ya estaba enviada
    })

    it('debe retornar false si la DB no está disponible', async () => {
      vi.mocked(isDatabaseAvailable).mockReturnValue(false)
      const result = await tracker.checkAndMark(
        'new_pr',
        'delivery123',
        undefined,
        'channel123'
      )
      expect(result).toBe(false)
    })

    it('reminder con mismos PRs debe retornar true (no reenviar)', async () => {
      const reminderId = 'reviewer/alice'
      const recipient = 'U123'
      const existingRow = {
        id: `reminder/${reminderId}/${recipient}`,
        type: 'reminder',
        metadata: { prNumbers: [1, 2] },
        recipient,
      }
      const mockDb = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([existingRow]),
            })),
          })),
        })),
      }
      vi.mocked(isDatabaseAvailable).mockReturnValue(true)
      vi.mocked(getDatabase).mockReturnValue(mockDb as unknown as ReturnType<typeof getDatabase>)

      const result = await tracker.checkAndMark(
        'reminder',
        undefined,
        reminderId,
        'U123',
        { prNumbers: [1, 2] }
      )

      expect(result).toBe(true)
    })

    it('reminder con PRs distintos debe actualizar y retornar false (reenviar)', async () => {
      const reminderId = 'reviewer/alice'
      const recipient = 'U123'
      const existingRow = {
        id: `reminder/${reminderId}/${recipient}`,
        type: 'reminder',
        metadata: { prNumbers: [1] },
        recipient,
      }
      const mockUpdate = vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(undefined),
        })),
      }))
      const mockDb = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([existingRow]),
            })),
          })),
        })),
        update: mockUpdate,
      }
      vi.mocked(isDatabaseAvailable).mockReturnValue(true)
      vi.mocked(getDatabase).mockReturnValue(mockDb as unknown as ReturnType<typeof getDatabase>)

      const result = await tracker.checkAndMark(
        'reminder',
        undefined,
        reminderId,
        'U123',
        { prNumbers: [1, 2] }
      )

      expect(result).toBe(false)
      expect(mockUpdate).toHaveBeenCalled()
    })

    it('reminder existente sin metadata.prNumbers en la llamada debe retornar true', async () => {
      const reminderId = 'reviewer/bob'
      const recipient = 'U456'
      const existingRow = {
        id: `reminder/${reminderId}/${recipient}`,
        type: 'reminder',
        metadata: null,
        recipient,
      }
      const mockDb = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([existingRow]),
            })),
          })),
        })),
      }
      vi.mocked(isDatabaseAvailable).mockReturnValue(true)
      vi.mocked(getDatabase).mockReturnValue(mockDb as unknown as ReturnType<typeof getDatabase>)

      const result = await tracker.checkAndMark(
        'reminder',
        undefined,
        reminderId,
        'U456',
        { reviewers: ['bob'] }
      )

      expect(result).toBe(true)
    })
  })
})
