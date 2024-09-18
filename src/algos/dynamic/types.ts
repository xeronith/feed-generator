import { QueryParams } from '../../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../../config'
import { Identity } from '..'

export const Nothing = { feed: [] }

export interface Definition {
  users?: string[]
  authors?: string[]
  hashtags?: string[]
  mentions?: string[]
  search?: string[]
}

export type Executor = (
  ctx: AppContext,
  params: QueryParams,
  identity: Identity,
  identifier: string,
  definition: Definition,
) => Promise<{
  cursor?: string
  feed: { post: any }[]
}>
