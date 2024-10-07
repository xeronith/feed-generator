import { QueryParams } from '../../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../../config'

import { execute } from './executor'
import { Definition, Nothing } from './types'
import { Identity } from '..'

export const shortname = 'dynamic'

export const handler = async (
  ctx: AppContext,
  params: QueryParams,
  identity: Identity,
) => {
  const did = params['feed-host']
  const slug = params[shortname]

  const record = await ctx.db
    .selectFrom('feed')
    .selectAll()
    .where('did', '=', did)
    .where('slug', '=', slug)
    .executeTakeFirst()

  if (!record) {
    return Nothing
  }

  const identifier: string = record.identifier
  const definition: Definition = JSON.parse(record.definition)

  const authors: string[] = []
  const hashtags: string[] = []
  const mentions: string[] = []
  const search: string[] = []

  if (Array.isArray(definition.users)) {
    const promises = definition.users.map(async (user: string) => {
      const author = await ctx.handleResolver.resolve(user)
      if (author) {
        return author
      }

      return null
    })

    const resolvedPromises = await Promise.all(promises)
    resolvedPromises.forEach((author) => {
      if (author) authors.push(author)
    })
  }

  if (Array.isArray(definition.hashtags)) {
    definition.hashtags.forEach((hashtag) => {
      let value = hashtag.trim()
      if (!value.startsWith('#')) value = `#${value}`
      if (value) hashtags.push(value)
    })
  }

  if (Array.isArray(definition.mentions)) {
    definition.mentions.forEach((mention) => {
      let value = mention.trim()
      if (!value.startsWith('@')) value = `@${value}`
      if (value) mentions.push(value)
    })
  }

  if (Array.isArray(definition.search)) {
    definition.search.forEach((criteria) => {
      const value = criteria.trim()
      if (value) search.push(value)
    })
  }

  if (
    authors.length === 0 &&
    hashtags.length === 0 &&
    mentions.length === 0 &&
    search.length === 0
  ) {
    return Nothing
  }

  definition.authors = authors
  definition.hashtags = hashtags
  definition.mentions = mentions
  definition.search = search

  return execute({ app: ctx, identity, identifier: identifier, definition }, params)
}
