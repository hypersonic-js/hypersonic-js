import type { PrismaClientLike, AdminModelMeta } from '../types.js'

// ── Internal Prisma delegate interface ───────────────────────────────────────
// Matches the shape of a Prisma model delegate at runtime.

interface PrismaDelegate {
  findMany(args: object): Promise<unknown[]>
  findUnique(args: object): Promise<unknown>
  create(args: object): Promise<unknown>
  update(args: object): Promise<unknown>
  delete(args: object): Promise<unknown>
  count(args: object): Promise<number>
}

/**
 * Looks up the Prisma model delegate by camelCase model name.
 * Throws a descriptive error if the delegate is not found.
 */
export function getDelegate(prisma: PrismaClientLike, modelName: string): PrismaDelegate {
  const key = modelName.charAt(0).toLowerCase() + modelName.slice(1)
  const delegate = (prisma as unknown as Record<string, unknown>)[key]

  if (delegate === null || delegate === undefined || typeof delegate !== 'object') {
    throw new Error(
      `Admin: Prisma delegate not found for model "${modelName}". ` +
        `Ensure the model exists in your schema and the client has been generated.`,
    )
  }

  return delegate as PrismaDelegate
}

/**
 * Coerces raw form string values to the correct JS types based on field metadata.
 * Skips fields not present in model.formFields to prevent mass-assignment.
 */
export function coerceData(
  data: Record<string, unknown>,
  model: AdminModelMeta,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(data)) {
    const field = model.formFields.find((f) => f.name === key)
    if (field === undefined) continue

    if (value === '' || value === null || value === undefined) {
      result[key] = field.isRequired ? undefined : null
      continue
    }

    switch (field.prismaType) {
      case 'Int':
      case 'Float':
        result[key] = Number(value)
        break
      case 'Boolean':
        result[key] = value === 'true' || value === true
        break
      case 'DateTime':
        result[key] = new Date(String(value))
        break
      default:
        result[key] = value
    }
  }

  return result
}

export interface FindManyResult {
  records: unknown[]
  total: number
}

/** Fetches a paginated list of records and the total count in parallel. */
export async function findMany(
  prisma: PrismaClientLike,
  model: AdminModelMeta,
  pagination: { skip: number; take: number },
): Promise<FindManyResult> {
  const delegate = getDelegate(prisma, model.name)
  const [records, total] = await Promise.all([
    delegate.findMany({ skip: pagination.skip, take: pagination.take }),
    delegate.count({}),
  ])
  return { records, total }
}

/** Returns only the record count for a model — used on the dashboard. */
export async function countRecords(
  prisma: PrismaClientLike,
  model: AdminModelMeta,
): Promise<number> {
  const delegate = getDelegate(prisma, model.name)
  return delegate.count({})
}

/**
 * Fetches a single record by its primary key.
 * Coerces the id string to a number if the model's idType is 'number'.
 */
export async function findUnique(
  prisma: PrismaClientLike,
  model: AdminModelMeta,
  id: string,
): Promise<unknown> {
  const delegate = getDelegate(prisma, model.name)
  const idValue: unknown =
    model.idType === 'number' ? parseInt(id, 10) : id

  return delegate.findUnique({ where: { [model.idField]: idValue } })
}

/** Creates a new record, coercing form values to correct types. */
export async function createRecord(
  prisma: PrismaClientLike,
  model: AdminModelMeta,
  data: Record<string, unknown>,
): Promise<unknown> {
  const delegate = getDelegate(prisma, model.name)
  return delegate.create({ data: coerceData(data, model) })
}

/** Updates an existing record by primary key, coercing form values. */
export async function updateRecord(
  prisma: PrismaClientLike,
  model: AdminModelMeta,
  id: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  const delegate = getDelegate(prisma, model.name)
  const idValue: unknown =
    model.idType === 'number' ? parseInt(id, 10) : id

  return delegate.update({
    where: { [model.idField]: idValue },
    data: coerceData(data, model),
  })
}

/** Deletes a record by primary key. */
export async function deleteRecord(
  prisma: PrismaClientLike,
  model: AdminModelMeta,
  id: string,
): Promise<void> {
  const delegate = getDelegate(prisma, model.name)
  const idValue: unknown =
    model.idType === 'number' ? parseInt(id, 10) : id

  await delegate.delete({ where: { [model.idField]: idValue } })
}
