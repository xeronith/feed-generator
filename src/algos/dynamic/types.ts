import { QueryParams } from '../../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../../config'
import { Identity } from '..'

export const Nothing = { feed: [] }

export const Epoch = '1970-01-01T00:00:00.000Z'

export interface Definition {
  users?: string[]
  authors?: string[]
  hashtags?: string[]
  mentions?: string[]
  search?: string[]
}

export type ExecutorContext = {
  app: AppContext
  identity: Identity
  identifier: string
  definition: Definition
}

export type Executor = (
  ctx: ExecutorContext,
  params: QueryParams,
) => Promise<{
  cursor?: string
  feed: { post: any }[]
}>
