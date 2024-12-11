import express from 'express'
import { AppContext } from './config'
import { InProcCache } from './algos/dynamic/cache'
import { removeFileFromStorage } from './util/gcs'
import { handleError } from './util/errors'

interface PostRequestBody {
  identifier: string
  slug?: string
  displayName: string
  description: string
  avatar: string
  pinned?: boolean
  bookmark?: boolean
  operator: string
  type?: string
  state?: string
  users: string[]
  authors: string[]
  excludeUsers: string[]
  excludeAuthors: string[]
  hashtags: string[]
  excludeHashtags: string[]
  mentions: string[]
  excludeMentions: string[]
  search: string[]
  excludeSearch: string[]
  atUris: string[]
  excludeAtUris: string[]
}

interface PutRequestBody {
  displayName?: string
  slug?: string
  description?: string
  avatar?: string
  pinned?: boolean
  bookmark?: boolean
  operator: string
  type?: string
  state?: string
  users: string[]
  authors: string[]
  excludeUsers: string[]
  excludeAuthors: string[]
  hashtags: string[]
  excludeHashtags: string[]
  mentions: string[]
  excludeMentions: string[]
  search: string[]
  excludeSearch: string[]
  atUris: string[]
  excludeAtUris: string[]
}

const makeRouter = (ctx: AppContext) => {
  const router = express.Router()
  const allowedStates = ['draft', 'ready', 'published']

  /**
   * @openapi
   * /feed:
   *   get:
   *     description: Retrieve a list of feeds
   *     tags: [Feed]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Returns the list of feeds
   *       404:
   *         description: No feeds found
   */
  router.get('/feed', async (req, res) => {
    if (!ctx.cfg.serviceDid.endsWith(ctx.cfg.hostname)) {
      return res.sendStatus(404)
    }

    try {
      let builder = ctx.db
        .selectFrom('feed')
        .select('identifier')
        .select('did')
        .select('slug')
        .select('displayName')
        .select('description')
        .select('definition')
        .select('avatar')
        .select('pinned')
        .select('bookmark')
        .select('type')
        .select('state')
        .select('createdAt')
        .select('updatedAt')
        .where('did', '=', req['bsky'].did)
        .where('deletedAt', '=', '')

      if (req.query.state && typeof req.query.state === 'string') {
        const states: string[] = []

        const queryState = req.query.state.split(',') || []
        for (let i = 0; i < queryState.length; i++) {
          queryState[i] = queryState[i].trim().toLowerCase()
          if (!allowedStates.includes(queryState[i])) {
            return res.status(400).json({
              error: "invalid state. must be 'draft', 'ready', or 'published'",
            })
          }

          states.push(queryState[i])
        }

        if (states.length > 0) {
          builder = builder.where('state', 'in', states)
        }
      }

      const result = await builder.orderBy('createdAt', 'desc').execute()

      return res.status(200).json(
        result.map((feed) => {
          const definition = JSON.parse(feed.definition)

          return {
            identifier: feed.identifier,
            slug: feed.slug,
            displayName: feed.displayName,
            description: feed.description,
            avatar: feed.avatar,
            users: definition.users ?? [],
            authors: definition.authors ?? [],
            excludeUsers: definition.excludeUsers ?? [],
            excludeAuthors: definition.excludeAuthors ?? [],
            hashtags: definition.hashtags ?? [],
            excludeHashtags: definition.excludeHashtags ?? [],
            mentions: definition.mentions ?? [],
            excludeMentions: definition.excludeMentions ?? [],
            search: definition.search ?? [],
            excludeSearch: definition.excludeSearch ?? [],
            atUris: definition.atUris ?? [],
            excludeAtUris: definition.excludeAtUris ?? [],
            pinned: feed.pinned,
            bookmark: feed.bookmark,
            operator: definition.operator ?? 'OR',
            type: feed.type,
            state: feed.state,
            createdAt: feed.createdAt,
            updatedAt: feed.updatedAt,
            atUri: `at://${feed.did}/app.bsky.feed.generator/${feed.slug}`,
          }
        }),
      )
    } catch (error) {
      return handleError(res, error)
    }
  })

  /**
   * @openapi
   * /feed/{identifier}:
   *   get:
   *     description: Retrieve a feed by identifier
   *     tags: [Feed]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: identifier
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Returns the feed data
   *       404:
   *         description: Feed not found
   */
  router.get('/feed/:identifier', async (req, res) => {
    if (!ctx.cfg.serviceDid.endsWith(ctx.cfg.hostname)) {
      return res.sendStatus(404)
    }

    const identifier = req.params.identifier

    try {
      const result = await ctx.db
        .selectFrom('feed')
        .select('identifier')
        .select('did')
        .select('slug')
        .select('displayName')
        .select('description')
        .select('definition')
        .select('avatar')
        .select('pinned')
        .select('bookmark')
        .select('type')
        .select('state')
        .select('createdAt')
        .select('updatedAt')
        .where('did', '=', req['bsky'].did)
        .where('identifier', '=', identifier)
        .where('deletedAt', '=', '')
        .executeTakeFirst()

      if (!result) {
        return res.sendStatus(404)
      }

      const definition = JSON.parse(result.definition)

      res.status(200).json({
        identifier: result.identifier,
        slug: result.slug,
        displayName: result.displayName,
        description: result.description,
        avatar: result.avatar,
        users: definition.users ?? [],
        authors: definition.users ?? [],
        excludeUsers: definition.excludeUsers ?? [],
        excludeAuthors: definition.excludeAuthors ?? [],
        hashtags: definition.hashtags ?? [],
        excludeHashtags: definition.excludeHashtags ?? [],
        mentions: definition.mentions ?? [],
        excludeMentions: definition.excludeMentions ?? [],
        search: definition.search ?? [],
        excludeSearch: definition.excludeSearch ?? [],
        atUris: definition.atUris ?? [],
        excludeAtUris: definition.excludeAtUris ?? [],
        pinned: result.pinned,
        bookmark: result.bookmark,
        operator: definition.operator ?? 'OR',
        type: result.type,
        state: result.state,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
        atUri: `at://${result.did}/app.bsky.feed.generator/${result.slug}`,
      })
    } catch (error) {
      return handleError(res, error)
    }
  })

  /**
   * @openapi
   * /feed:
   *   post:
   *     description: Create a new feed
   *     tags: [Feed]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               identifier:
   *                 type: string
   *               slug:
   *                 type: string
   *               displayName:
   *                 type: string
   *               description:
   *                 type: string
   *               avatar:
   *                 type: string
   *               users:
   *                 type: array
   *                 items:
   *                   type: string
   *               authors:
   *                 type: array
   *                 items:
   *                   type: string
   *               excludeUsers:
   *                 type: array
   *                 items:
   *                   type: string
   *               excludeAuthors:
   *                 type: array
   *                 items:
   *                   type: string
   *               hashtags:
   *                 type: array
   *                 items:
   *                   type: string
   *               excludeHashtags:
   *                 type: array
   *                 items:
   *                   type: string
   *               mentions:
   *                 type: array
   *                 items:
   *                   type: string
   *               excludeMentions:
   *                 type: array
   *                 items:
   *                   type: string
   *               search:
   *                 type: array
   *                 items:
   *                   type: string
   *               excludeSearch:
   *                 type: array
   *                 items:
   *                   type: string
   *               atUris:
   *                 type: array
   *                 items:
   *                   type: string
   *               excludeAtUris:
   *                 type: array
   *                 items:
   *                   type: string
   *               type:
   *                 type: string
   *               state:
   *                 type: string
   *                 enum:
   *                   - draft
   *                   - ready
   *                   - published
   *     responses:
   *       201:
   *         description: Feed created successfully
   *       400:
   *         description: Invalid request or feed data
   */
  router.post('/feed', async (req, res) => {
    if (!ctx.cfg.serviceDid.endsWith(ctx.cfg.hostname)) {
      return res.sendStatus(404)
    }

    const payload = req.body as PostRequestBody
    if (
      !payload.identifier ||
      payload.identifier.trim().length < 2 ||
      payload.identifier.trim().length > 15
    ) {
      return res.status(400).json({
        error: 'invalid identifier (required, min-length: 2, max-length: 15)',
      })
    }

    if ('state' in payload && !allowedStates.includes(payload.state ?? '')) {
      return res.status(400).json({
        error: 'invalid state',
      })
    }

    if ('operator' in payload && typeof payload.operator === 'string') {
      payload.operator =
        payload.operator.trim().toUpperCase() === 'AND' ? 'AND' : 'OR'
    } else {
      payload.operator = 'OR'
    }

    const did = req['bsky'].did
    const identifier = payload.identifier.trim()
    const slug = payload.slug?.trim() ?? identifier

    try {
      const timestamp = new Date().toISOString()
      await ctx.db
        .insertInto('feed')
        .values({
          identifier: identifier,
          slug: slug,
          displayName: payload.displayName?.trim() ?? '',
          description: payload.description?.trim() ?? '',
          definition: JSON.stringify(payload),
          did: did,
          avatar: payload.avatar?.trim() ?? '',
          pinned: payload.pinned ? 1 : 0,
          bookmark: payload.bookmark ? 1 : 0,
          type: payload.type ?? '',
          state: payload.state ?? 'draft',
          createdAt: timestamp,
          updatedAt: timestamp,
          deletedAt: '',
        })
        .execute()
    } catch (error) {
      return handleError(res, error)
    }

    res.status(201).json({
      status: 'created',
      identifier: identifier,
      did: did,
      atUri: `at://${did}/app.bsky.feed.generator/${slug}`,
    })
  })

  /**
   * @openapi
   * /feed/{identifier}:
   *   put:
   *     description: Update the state of a feed by identifier
   *     tags: [Feed]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: identifier
   *         required: true
   *         schema:
   *           type: string
   *       - in: body
   *         name: state
   *         required: true
   *         schema:
   *           type: object
   *           properties:
   *             slug:
   *               type: string
   *             displayName:
   *               type: string
   *             description:
   *               type: string
   *             avatar:
   *               type: string
   *             users:
   *               type: array
   *               items:
   *                 type: string
   *             authors:
   *               type: array
   *               items:
   *                 type: string
   *             excludeUsers:
   *               type: array
   *               items:
   *                 type: string
   *             excludeAuthors:
   *               type: array
   *               items:
   *                 type: string
   *             hashtags:
   *               type: array
   *               items:
   *                 type: string
   *             excludeHashtags:
   *               type: array
   *               items:
   *                 type: string
   *             mentions:
   *               type: array
   *               items:
   *                 type: string
   *             excludeMentions:
   *               type: array
   *               items:
   *                 type: string
   *             search:
   *               type: array
   *               items:
   *                 type: string
   *             excludeSearch:
   *               type: array
   *               items:
   *                 type: string
   *             atUris:
   *               type: array
   *               items:
   *                 type: string
   *             excludeAtUris:
   *               type: array
   *               items:
   *                 type: string
   *             type:
   *               type: string
   *             state:
   *               type: string
   *               enum:
   *                 - draft
   *                 - ready
   *                 - published
   *     responses:
   *       200:
   *         description: State updated successfully
   *       400:
   *         description: Invalid request or state
   *       404:
   *         description: Feed not found
   */
  router.put('/feed/:identifier', async (req, res) => {
    if (!ctx.cfg.serviceDid.endsWith(ctx.cfg.hostname)) {
      return res.sendStatus(404)
    }

    const identifier = req.params.identifier
    const payload = req.body as PutRequestBody

    try {
      const record = await ctx.db
        .selectFrom('feed')
        .selectAll()
        .where('did', '=', req['bsky'].did)
        .where('identifier', '=', identifier)
        .executeTakeFirst()

      if (!record) {
        return res.sendStatus(404)
      }

      const definition = JSON.parse(record.definition)

      let modified: number = 0
      let cacheInvalidated = false
      let builder = ctx.db.updateTable('feed')

      if ('slug' in payload && payload.slug) {
        modified++

        definition.slug = payload.slug.trim()
        builder = builder.set({
          slug: definition.slug,
          definition: JSON.stringify(definition),
        })
      }

      if ('displayName' in payload) {
        modified++

        definition.displayName = payload.displayName?.trim() ?? ''
        builder = builder.set({
          displayName: definition.displayName,
          definition: JSON.stringify(definition),
        })
      }

      if ('description' in payload) {
        modified++

        definition.description = payload.description?.trim() ?? ''
        builder = builder.set({
          description: definition.description,
          definition: JSON.stringify(definition),
        })
      }

      if ('avatar' in payload) {
        if (record.avatar !== payload.avatar) {
          removeFileFromStorage(ctx, record.avatar)
        }

        modified++

        definition.avatar = payload.avatar?.trim() ?? ''
        builder = builder.set({
          avatar: definition.avatar,
          definition: JSON.stringify(definition),
        })
      }

      if ('type' in payload) {
        modified++

        definition.type = payload.type ?? ''
        builder = builder.set({
          type: definition.type,
          definition: JSON.stringify(definition),
        })
      }

      if ('state' in payload) {
        if (!allowedStates.includes(payload.state ?? '')) {
          return res.status(400).json({
            error: 'invalid state',
          })
        }

        modified++

        definition.state = payload.state
        builder = builder.set({
          state: definition.state,
          definition: JSON.stringify(definition),
        })
      }

      if ('pinned' in payload) {
        modified++

        definition.pinned = payload.pinned ? 1 : 0
        builder = builder.set({
          pinned: definition.pinned,
          definition: JSON.stringify(definition),
        })
      }

      if ('bookmark' in payload) {
        modified++

        definition.bookmark = payload.bookmark ? 1 : 0
        builder = builder.set({
          bookmark: definition.bookmark,
          definition: JSON.stringify(definition),
        })
      }

      if ('operator' in payload && typeof payload.operator === 'string') {
        modified++

        definition.operator =
          payload.operator.trim().toUpperCase() === 'AND' ? 'AND' : 'OR'
        builder = builder.set({
          definition: JSON.stringify(definition),
        })
      }

      if ('users' in payload) {
        modified++
        cacheInvalidated = true

        definition.users = payload.users
        builder = builder.set({
          definition: JSON.stringify(definition),
        })
      }
      
      if ('authors' in payload) {
        modified++
        cacheInvalidated = true

        definition.authors = payload.authors
        builder = builder.set({
          definition: JSON.stringify(definition),
        })
      }

      if ('excludeUsers' in payload) {
        modified++
        cacheInvalidated = true

        definition.excludeUsers = payload.excludeUsers
        builder = builder.set({
          definition: JSON.stringify(definition),
        })
      }

      if ('excludeAuthors' in payload) {
        modified++
        cacheInvalidated = true

        definition.excludeAuthors = payload.excludeAuthors
        builder = builder.set({
          definition: JSON.stringify(definition),
        })
      }

      if ('hashtags' in payload) {
        modified++
        cacheInvalidated = true

        definition.hashtags = payload.hashtags
        builder = builder.set({
          definition: JSON.stringify(definition),
        })
      }

      if ('excludeHashtags' in payload) {
        modified++
        cacheInvalidated = true

        definition.excludeHashtags = payload.excludeHashtags
        builder = builder.set({
          definition: JSON.stringify(definition),
        })
      }

      if ('mentions' in payload) {
        modified++
        cacheInvalidated = true

        definition.mentions = payload.mentions
        builder = builder.set({
          definition: JSON.stringify(definition),
        })
      }

      if ('excludeMentions' in payload) {
        modified++
        cacheInvalidated = true

        definition.excludeMentions = payload.excludeMentions
        builder = builder.set({
          definition: JSON.stringify(definition),
        })
      }

      if ('search' in payload) {
        modified++
        cacheInvalidated = true

        definition.search = payload.search
        builder = builder.set({
          definition: JSON.stringify(definition),
        })
      }

      if ('excludeSearch' in payload) {
        modified++
        cacheInvalidated = true

        definition.excludeSearch = payload.excludeSearch
        builder = builder.set({
          definition: JSON.stringify(definition),
        })
      }

      if ('atUris' in payload) {
        modified++
        cacheInvalidated = true

        definition.atUris = payload.atUris
        builder = builder.set({
          definition: JSON.stringify(definition),
        })
      }

      if ('excludeAtUris' in payload) {
        modified++
        cacheInvalidated = true

        definition.excludeAtUris = payload.excludeAtUris
        builder = builder.set({
          definition: JSON.stringify(definition),
        })
      }

      if (modified > 0) {
        builder = builder.set({
          updatedAt: new Date().toISOString(),
        })

        builder = builder
          .where('identifier', '=', identifier)
          .where('did', '=', req['bsky'].did)
          .where('deletedAt', '=', '')

        await builder.execute()

        if (cacheInvalidated) {
          await ctx.db
            .deleteFrom('cache')
            .where('identifier', '=', identifier)
            .execute()

          delete InProcCache[identifier]
        }
      }
    } catch (error) {
      return handleError(res, error)
    }

    res.status(200).json({
      status: 'updated',
    })
  })

  /**
   * @openapi
   * /feed/{identifier}/avatar:
   *   put:
   *     description: Update the avatar of a feed by identifier
   *     tags: [Feed]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: identifier
   *         required: true
   *         schema:
   *           type: string
   *       - in: formData
   *         name: file
   *         required: true
   *         schema:
   *           type: file
   *           format: binary
   *     responses:
   *       200:
   *         description: Avatar updated successfully
   *       400:
   *         description: Invalid request or file size exceeds limit
   *       404:
   *         description: Feed not found
   */
  router.put(
    '/feed/:identifier/avatar',
    ctx.uploader.single('file'),
    async (req, res) => {
      if (!ctx.cfg.serviceDid.endsWith(ctx.cfg.hostname)) {
        return res.sendStatus(404)
      }

      const did = req['bsky'].did
      const identifier = req.params.identifier
      const file = req.file

      if (!file) {
        return res
          .status(400)
          .send('No file uploaded or file size exceeds 64kb limit.')
      }

      const avatarUrl = file['linkUrl']

      try {
        const record = await ctx.db
          .selectFrom('feed')
          .selectAll()
          .where('did', '=', did)
          .where('identifier', '=', identifier)
          .where('deletedAt', '=', '')
          .executeTakeFirst()

        if (!record) {
          return res.sendStatus(404)
        }

        let avatarUpdatedAt = record.updatedAt
        const definition = JSON.parse(record.definition)
        if (definition.avatar !== avatarUrl) {
          removeFileFromStorage(ctx, record.avatar)

          avatarUpdatedAt = new Date().toISOString()
          definition.avatar = avatarUrl

          ctx.db
            .updateTable('feed')
            .set({
              avatar: avatarUrl,
              definition: JSON.stringify(definition),
              updatedAt: avatarUpdatedAt,
            })
            .where('did', '=', did)
            .where('identifier', '=', identifier)
            .where('deletedAt', '=', '')
            .execute()
        }

        res.status(200).json({
          url: avatarUrl,
          updatedAt: avatarUpdatedAt,
        })
      } catch (error) {
        return handleError(res, error)
      }
    },
  )

  /**
   * @openapi
   * /feed/{identifier}:
   *   delete:
   *     description: Delete a feed by identifier
   *     tags: [Feed]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: identifier
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Feed deleted successfully
   *       404:
   *         description: Feed not found
   */
  router.delete('/feed/:identifier', async (req, res) => {
    if (!ctx.cfg.serviceDid.endsWith(ctx.cfg.hostname)) {
      return res.sendStatus(404)
    }

    const identifier = req.params.identifier

    try {
      await ctx.db
        .deleteFrom('cache')
        .where('identifier', '=', identifier)
        .execute()

      delete InProcCache[identifier]

      const now = new Date()

      await ctx.db
        .updateTable('feed')
        .set({
          identifier: `${identifier}-${now.getTime()}`,
          slug: `${identifier}-${now.getTime()}`,
          deletedAt: now.toISOString(),
        })
        .where('identifier', '=', identifier)
        .where('did', '=', req['bsky'].did)
        .where('deletedAt', '=', '')
        .execute()
    } catch (error) {
      return handleError(res, error)
    }

    res.status(200).json({
      status: 'deleted',
    })
  })

  return router
}

export default makeRouter
