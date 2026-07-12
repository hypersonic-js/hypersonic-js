export interface DmmfEnumValue {
  name: string
  dbName: string | null
}

export interface DmmfEnum {
  name: string
  values: DmmfEnumValue[]
  dbName: string | null
}

export interface DmmfField {
  name: string
  type: string
  kind: 'scalar' | 'object' | 'enum' | 'unsupported'
  isRequired: boolean
  isUnique: boolean
  isId: boolean
  isList: boolean
  hasDefaultValue: boolean
  isReadOnly: boolean
  isGenerated?: boolean
  isUpdatedAt: boolean
  relationName?: string | null
  relationFromFields?: string[]
  relationToFields?: string[]
  /** The field's Prisma doc comment (`///`), if any. Used to detect the `@admin.file` directive. */
  documentation?: string
}

export interface DmmfModel {
  name: string
  fields: DmmfField[]
  dbName: string | null
}

export interface DmmfDocument {
  datamodel: {
    models: DmmfModel[]
    enums: DmmfEnum[]
  }
}