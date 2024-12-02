import { AppContext } from '../../config'
import { Identity } from '..'

export const Nothing = { feed: [] }

export const Epoch = '1970-01-01T00:00:00.000Z'

export interface Definition {
  users?: string[]
  blockedUsers?: string[]
  authors?: string[]
  blockedAuthors?: string[]
  hashtags?: string[]
  excludedHashtags?: string[]
  mentions?: string[]
  excludedMentions?: string[]
  search?: string[]
  excludedSearch?: string[]
  includedAtUris?: string[]
  excludedAtUris?: string[]
  operator: string
}

export type ExecutorContext = {
  app: AppContext
  identity: Identity
  identifier: string
  definition: Definition
}
