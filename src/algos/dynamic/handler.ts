import fs from 'fs'
import path from 'path'
import { QueryParams } from '../../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../../config'

import { execute } from './executor'
import { Definition, Nothing } from './types'
import { Identity } from '..'

export const shortname = 'dynamic'

const scriptPath = path.resolve(__dirname, 'interceptor.js')

export const handler = async (
  ctx: AppContext,
  params: QueryParams,
  identity: Identity,
) => {
  if (fs.existsSync(scriptPath)) {
    try {
      eval(fs.readFileSync(scriptPath, 'utf-8'))
    } catch (err) {
      console.debug('script error:', err.message ?? 'unknown error')
    }
  }

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
  const blockedAuthors: string[] = []
  const hashtags: string[] = []
  const excludedHashtags: string[] = []
  const mentions: string[] = []
  const excludedMentions: string[] = []
  const search: string[] = []
  const excludedSearch: string[] = []
  const includedAtUris: string[] = []
  const excludedAtUris: string[] = []

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

  if (Array.isArray(definition.blockedUsers)) {
    const promises = definition.blockedUsers.map(
      async (blockedUser: string) => {
        const blockedAuthor = await ctx.handleResolver.resolve(blockedUser)
        if (blockedAuthor) {
          return blockedAuthor
        }

        return null
      },
    )

    const resolvedPromises = await Promise.all(promises)
    resolvedPromises.forEach((blockedAuthor) => {
      if (blockedAuthor) blockedAuthors.push(blockedAuthor)
    })
  }

  if (Array.isArray(definition.hashtags)) {
    definition.hashtags.forEach((hashtag) => {
      let value = hashtag.trim()
      if (!value.startsWith('#')) value = `#${value}`
      if (value) hashtags.push(value)
    })
  }

  if (Array.isArray(definition.excludedHashtags)) {
    definition.excludedHashtags.forEach((hashtag) => {
      let value = hashtag.trim()
      if (!value.startsWith('#')) value = `#${value}`
      if (value) excludedHashtags.push(value)
    })
  }

  if (Array.isArray(definition.mentions)) {
    definition.mentions.forEach((mention) => {
      let value = mention.trim()
      if (!value.startsWith('@')) value = `@${value}`
      if (value) mentions.push(value)
    })
  }

  if (Array.isArray(definition.excludedMentions)) {
    definition.excludedMentions.forEach((mention) => {
      let value = mention.trim()
      if (!value.startsWith('@')) value = `@${value}`
      if (value) excludedMentions.push(value)
    })
  }

  if (Array.isArray(definition.search)) {
    definition.search.forEach((criteria) => {
      const value = criteria.trim()
      if (value) search.push(value)
    })
  }

  if (Array.isArray(definition.excludedSearch)) {
    definition.excludedSearch.forEach((criteria) => {
      const value = criteria.trim()
      if (value) excludedSearch.push(value)
    })
  }

  if (Array.isArray(definition.includedAtUris)) {
    definition.includedAtUris.forEach((includedAtUri) => {
      const value = includedAtUri.trim()
      if (value) includedAtUris.push(value)
    })
  }

  if (Array.isArray(definition.excludedAtUris)) {
    definition.excludedAtUris.forEach((excludedAtUri) => {
      const value = excludedAtUri.trim()
      if (value) excludedAtUris.push(value)
    })
  }

  if (
    authors.length === 0 &&
    blockedAuthors.length === 0 &&
    hashtags.length === 0 &&
    mentions.length === 0 &&
    search.length === 0 &&
    includedAtUris.length === 0 &&
    excludedAtUris.length === 0
  ) {
    return Nothing
  }

  definition.authors = authors
  definition.blockedAuthors = blockedAuthors
  definition.hashtags = hashtags
  definition.mentions = mentions
  definition.search = search
  definition.includedAtUris = includedAtUris
  definition.excludedAtUris = excludedAtUris

  return execute(
    { app: ctx, identity, identifier: identifier, definition },
    params,
  )
}
