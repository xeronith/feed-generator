import { QueryParams } from '../../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../../config'

export const Nothing = { feed: [] }

export interface Definition {
  users?: string[]
  hashtags?: string[]
  mentions?: string[]
  search?: string[]
}

export type Executor = (
  ctx: AppContext,
  params: QueryParams,
  identifier: string,
  definition: Definition,
  authors: string[],
) => Promise<{
  cursor?: string
  feed: { post: any }[]
}>
