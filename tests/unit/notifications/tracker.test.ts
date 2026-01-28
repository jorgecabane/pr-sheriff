import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NotificationTracker } from '../../../src/notifications/tracker.js'

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

    // Nota: Los tests con DB requieren mockear getDatabase
    // Por ahora solo verificamos la lógica de validación
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
  })

  describe('checkAndMark', () => {
    it('debe marcar como enviada si no estaba enviada', async () => {
      // Mock para que wasSent retorne false
      vi.spyOn(tracker, 'wasSent').mockResolvedValue(false)
      vi.spyOn(tracker, 'markAsSent').mockResolvedValue(undefined)

      const result = await tracker.checkAndMark(
        'new_pr',
        'delivery123',
        undefined,
        'channel123'
      )

      expect(result).toBe(false) // No estaba enviada
      expect(tracker.markAsSent).toHaveBeenCalledWith(
        'new_pr',
        'delivery123',
        undefined,
        'channel123',
        undefined
      )
    })

    it('debe retornar true si ya estaba enviada', async () => {
      vi.spyOn(tracker, 'wasSent').mockResolvedValue(true)

      const result = await tracker.checkAndMark(
        'new_pr',
        'delivery123',
        undefined,
        'channel123'
      )

      expect(result).toBe(true) // Ya estaba enviada
    })
  })
})
