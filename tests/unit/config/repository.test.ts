import { describe, it, expect } from 'vitest'
import { loadRepositoryConfig } from '../../../src/config/repository.js'

describe('loadRepositoryConfig', () => {
  it('debe cargar configuración válida desde YAML', async () => {
    const yamlContent = `
version: 0.1
team:
  name: "Test Team"
  members:
    - github: "alice"
      slack: "U1"
    - github: "bob"
      slack: "U2"
github:
  auto_assign:
    enabled: true
    reviewers_per_pr: 1
    assignment_strategy: "round-robin"
    exclude_authors: true
notifications:
  new_pr_notifications:
    enabled: true
    channel: "C123"
    include_reviewers: true
    include_assignees: true
    include_description: true
    include_labels: true
  daily_reminders:
    enabled: true
    message_type: "dm"
  blame:
    enabled: true
    channel: "C123"
    after_days: 2
rules:
  exclude_labels:
    - "draft"
    - "wip"
  include_labels: []
`

    const config = await loadRepositoryConfig(yamlContent)

    expect(config.team.name).toBe('Test Team')
    expect(config.team.members).toHaveLength(2)
    expect(config.team.members[0].github).toBe('alice')
    expect(config.team.members[0].slack).toBe('U1')
    expect(config.github.auto_assign.enabled).toBe(true)
    expect(config.github.auto_assign.reviewers_per_pr).toBe(1)
    expect(config.notifications.new_pr_notifications.channel).toBe('C123')
  })

  it('debe aceptar version como número o string', async () => {
    const yamlWithNumberVersion = `
version: 0.1
team:
  name: "Test"
  members:
    - github: "alice"
      slack: "U1"
github:
  auto_assign:
    enabled: true
    reviewers_per_pr: 1
    assignment_strategy: "round-robin"
    exclude_authors: true
notifications:
  new_pr_notifications:
    enabled: true
    channel: "C123"
    include_reviewers: true
    include_assignees: true
    include_description: true
    include_labels: true
  daily_reminders:
    enabled: true
    message_type: "dm"
  blame:
    enabled: true
    channel: "C123"
    after_days: 2
rules:
  exclude_labels: []
  include_labels: []
`

    const config1 = await loadRepositoryConfig(yamlWithNumberVersion)
    expect(config1.version).toBe(0.1)

    const yamlWithStringVersion = yamlWithNumberVersion.replace('version: 0.1', 'version: "0.1"')
    const config2 = await loadRepositoryConfig(yamlWithStringVersion)
    expect(config2.version).toBe('0.1')
  })

  it('debe usar valores por defecto para campos opcionales', async () => {
    const yamlContent = `
team:
  name: "Test"
  members:
    - github: "alice"
      slack: "U1"
github:
  auto_assign:
    enabled: true
    reviewers_per_pr: 1
    assignment_strategy: "round-robin"
    exclude_authors: true
notifications:
  new_pr_notifications:
    enabled: true
    channel: "C123"
    include_reviewers: true
    include_assignees: true
    include_description: true
    include_labels: true
  daily_reminders:
    enabled: true
    message_type: "dm"
  blame:
    enabled: true
    channel: "C123"
    after_days: 2
rules:
  exclude_labels: []
  include_labels: []
`

    const config = await loadRepositoryConfig(yamlContent)

    expect(config.notifications.new_pr_notifications.include_reviewers).toBe(true)
    expect(config.notifications.daily_reminders.message_type).toBe('dm')
    expect(config.rules.include_labels).toEqual([])
  })

  it('debe lanzar error si el YAML es inválido', async () => {
    const invalidYaml = 'invalid: yaml: content: [unclosed'

    await expect(loadRepositoryConfig(invalidYaml)).rejects.toThrow()
  })

  it('debe lanzar error si faltan campos requeridos', async () => {
    const incompleteYaml = `
team:
  name: "Test"
  # members faltante
github:
  auto_assign:
    enabled: true
`

    await expect(loadRepositoryConfig(incompleteYaml)).rejects.toThrow()
  })

  it('debe lanzar error si el schema no coincide', async () => {
    const wrongTypeYaml = `
team:
  name: "Test"
  members: "not-an-array"
github:
  auto_assign:
    enabled: true
`

    await expect(loadRepositoryConfig(wrongTypeYaml)).rejects.toThrow()
  })

  it('debe manejar configuración mínima válida', async () => {
    const minimalYaml = `
team:
  name: "Test"
  members:
    - github: "alice"
      slack: "U1"
github:
  auto_assign:
    enabled: false
    reviewers_per_pr: 1
    assignment_strategy: "round-robin"
    exclude_authors: false
notifications:
  new_pr_notifications:
    enabled: false
    channel: "C123"
    include_reviewers: true
    include_assignees: true
    include_description: true
    include_labels: true
  daily_reminders:
    enabled: false
    message_type: "dm"
  blame:
    enabled: false
    channel: "C123"
    after_days: 2
rules:
  exclude_labels: []
  include_labels: []
`

    const config = await loadRepositoryConfig(minimalYaml)

    expect(config.github.auto_assign.enabled).toBe(false)
    expect(config.notifications.new_pr_notifications.enabled).toBe(false)
  })
})
