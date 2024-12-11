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
  const excludeAuthors: string[] = []
  const hashtags: string[] = []
  const excludeHashtags: string[] = []
  const mentions: string[] = []
  const excludeMentions: string[] = []
  const search: string[] = []
  const excludeSearch: string[] = []
  const atUris: string[] = []
  const excludeAtUris: string[] = []

  if (Array.isArray(definition.authors)) {
    authors.push(...definition.authors)
  }

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

  if (Array.isArray(definition.excludeAuthors)) {
    authors.push(...definition.excludeAuthors)
  }

  if (Array.isArray(definition.excludeUsers)) {
    const promises = definition.excludeUsers.map(
      async (user: string) => {
        const author = await ctx.handleResolver.resolve(user)
        if (author) {
          return author
        }

        return null
      },
    )

    const resolvedPromises = await Promise.all(promises)
    resolvedPromises.forEach((author) => {
      if (author) excludeAuthors.push(author)
    })
  }

  if (Array.isArray(definition.hashtags)) {
    definition.hashtags.forEach((hashtag) => {
      let value = hashtag.trim()
      if (!value.startsWith('#')) value = `#${value}`
      if (value) hashtags.push(value)
    })
  }

  if (Array.isArray(definition.excludeHashtags)) {
    definition.excludeHashtags.forEach((hashtag) => {
      let value = hashtag.trim()
      if (!value.startsWith('#')) value = `#${value}`
      if (value) excludeHashtags.push(value)
    })
  }

  if (Array.isArray(definition.mentions)) {
    definition.mentions.forEach((mention) => {
      let value = mention.trim()
      if (!value.startsWith('@')) value = `@${value}`
      if (value) mentions.push(value)
    })
  }

  if (Array.isArray(definition.excludeMentions)) {
    definition.excludeMentions.forEach((mention) => {
      let value = mention.trim()
      if (!value.startsWith('@')) value = `@${value}`
      if (value) excludeMentions.push(value)
    })
  }

  if (Array.isArray(definition.search)) {
    definition.search.forEach((criteria) => {
      const value = criteria.trim()
      if (value) search.push(value)
    })
  }

  if (Array.isArray(definition.excludeSearch)) {
    definition.excludeSearch.forEach((criteria) => {
      const value = criteria.trim()
      if (value) excludeSearch.push(value)
    })
  }

  if (Array.isArray(definition.atUris)) {
    definition.atUris.forEach((includedAtUri) => {
      const value = includedAtUri.trim()
      if (value) atUris.push(value)
    })
  }

  if (Array.isArray(definition.excludeAtUris)) {
    definition.excludeAtUris.forEach((excludedAtUri) => {
      const value = excludedAtUri.trim()
      if (value) excludeAtUris.push(value)
    })
  }

  if (
    authors.length === 0 &&
    excludeAuthors.length === 0 &&
    hashtags.length === 0 &&
    mentions.length === 0 &&
    search.length === 0 &&
    atUris.length === 0 &&
    excludeAtUris.length === 0
  ) {
    return Nothing
  }

  definition.authors = authors
  definition.excludeAuthors = excludeAuthors
  definition.hashtags = hashtags
  definition.mentions = mentions
  definition.search = search
  definition.atUris = atUris
  definition.excludeAtUris = excludeAtUris

  return execute(
    { app: ctx, identity, identifier: identifier, definition },
    params,
  )
}
