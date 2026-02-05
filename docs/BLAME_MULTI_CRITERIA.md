# Blame multi-criterio: diseño genérico

## Objetivo

Un solo job de blame que agrupe varios criterios de "PR que necesita atención", con un mensaje que indique **por qué** está cada PR (secciones por criterio).

## Criterios

| Criterio | Descripción | Datos necesarios | API extra |
|----------|-------------|------------------|-----------|
| **stale** | Antiguo y sin actividad en X días | `created_at`, `updated_at` (ya en list PRs) | Ninguna |
| **changes_requested** | Hay cambios solicitados y sin respuesta del autor en X días | Reviews del PR (`getPullRequestReviews`) | 1 GET por PR abierto |
| **approved_not_merged** | Todos los reviewers aprobaron y el PR sigue abierto | Mismas reviews | Misma llamada |

Un PR solo entra en **una** categoría (la de mayor prioridad): `approved_not_merged` > `changes_requested` > `stale`.

## Coste

- **Solo stale (comportamiento actual):** 0 llamadas extra.
- **Incluir changes_requested y/o approved_not_merged:** 1 llamada `GET /repos/:owner/:repo/pulls/:number/reviews` por cada PR abierto del repo.  
  Ejemplo: 8 PRs abiertos → 8 llamadas más por repo por ejecución del job. Asumible para crons diarios.

## Diseño genérico

### 1. Tipos

```ts
type BlameReason = 'stale' | 'changes_requested' | 'approved_not_merged'

interface BlameGroup {
  reason: BlameReason
  label: string           // ej. "Sin actividad en X días"
  prs: GitHubPullRequest[]
}
```

### 2. Clasificación por PR

- Por cada PR abierto (respeta mismo filtro que hoy: draft, labels, etc.):
  - Si vamos a evaluar algún criterio que use reviews → **una sola** llamada `getPullRequestReviews(owner, repo, pr.number)` y reutilizar el resultado para todos los criterios.
  - Evaluar en orden: ¿approved_not_merged? → ¿changes_requested? → ¿stale?
  - Asignar el PR al primer criterio que cumpla y no seguir.

Lógica por criterio:

- **approved_not_merged:**  
  `requested_reviewers` no vacío, y para cada uno hay al menos un review con `state === 'APPROVED'` (no DISMISSED), y no hay ningún review `CHANGES_REQUESTED` después del último APPROVED por ese reviewer.  
  (O bien: "último review de cada requested_reviewer es APPROVED".)

- **changes_requested:**  
  Hay al menos un review con `state === 'CHANGES_REQUESTED'` no DISMISSED, y el más reciente de ese tipo tiene `submitted_at` (o `updated_at` del PR) hace más de X días.

- **stale:**  
  Igual que hoy: `created_at` y `updated_at` con más de X días.

### 3. Config (genérico y opcional por criterio)

En `.pr-sheriff.yml` se puede dejar uno solo que habilite/deshabilite y use el mismo `after_days`, o afinar después:

```yaml
blame:
  enabled: true
  channel: "C0ABFQMFQA0"
  after_days: 2
  # Opcional: activar/desactivar criterios (por defecto todos true)
  reasons:
    stale: true
    changes_requested: true
    approved_not_merged: true
```

Si no se pone `reasons`, se asume los tres en `true`. Así se puede hacer genérico y seguir siendo barato de config.

### 4. Mensaje

- Entrada: `Map<BlameReason, PRInfo[]>` o `{ [K in BlameReason]?: PRInfo[] }`.
- Por cada razón que tenga al menos un PR:
  - Un **header** distinto por criterio, ej.:
    - "Sin actividad en X días"
    - "Cambios solicitados sin respuesta (más de X días)"
    - "Aprobado, pendiente de merge"
  - La misma lista de PRs que ya usas (enlace, autor, revisores, etc.).

Así el mensaje es genérico: mismo formato de lista, solo cambia el título de la sección según el criterio.

### 5. Tracker

- Sigue siendo un solo envío por repo por día (mismo `blameId` y canal).  
- No hace falta un `checkAndMark` por criterio; el contenido del mensaje ya diferencia los motivos.

## Resumen

- **Coste:** bajo. Solo añade 1 GET de reviews por PR abierto cuando uses criterios que lo necesiten.
- **Genérico:** criterios como funciones puras `(pr, reviews?, config) => boolean`, agrupación por razón, y un formateador que recibe un mapa razón → PRs y pinta una sección por razón.
- **Config:** un único bloque `blame` con `reasons` opcional; por defecto los tres criterios activos.
- **Mensaje:** una sección por criterio con título distinto; el cuerpo de cada sección puede ser el mismo que hoy (lista de PRs con enlace, autor, revisores).

Si quieres, el siguiente paso es bajar esto a cambios concretos en `src/jobs/blame.ts`, `formatBlameMessage` y el schema de config.
