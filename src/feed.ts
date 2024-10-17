import express from 'express'
import { AppContext } from './config'
import { InProcCache } from './algos/dynamic/cache'

interface RegisterRequestBody {
  identifier: string
  slug?: string
  displayName: string
  description: string
  avatar: string
  pinned?: boolean
  bookmark?: boolean
  type?: string
  state?: string
  users: string[]
  hashtags: string[]
  mentions: string[]
  search: string[]
}

interface UpdateStateRequestBody {
  displayName?: string
  slug?: string
  description?: string
  avatar?: string
  pinned?: boolean
  bookmark?: boolean
  type?: string
  state?: string
  users: string[]
  hashtags: string[]
  mentions: string[]
  search: string[]
}

const makeRouter = (ctx: AppContext) => {
  const router = express.Router()

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

    const queryState = req.query.state as string | undefined
    let state = 'draft'
    if (queryState && allowedStates.includes(queryState)) {
      state = queryState
    }

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
        .where('deletedAt', '=', '')
        // .where('state', '=', state)
        .orderBy('createdAt', 'desc')
        .execute()

      res.status(200).json(
        result.map((feed) => {
          const definition = JSON.parse(feed.definition)

          return {
            identifier: feed.identifier,
            slug: feed.slug,
            displayName: feed.displayName,
            description: feed.description,
            avatar: feed.avatar,
            users: definition.users ?? [],
            hashtags: definition.hashtags ?? [],
            mentions: definition.mentions ?? [],
            search: definition.search ?? [],
            pinned: feed.pinned,
            bookmark: feed.bookmark,
            type: feed.type,
            state: feed.state,
            createdAt: feed.createdAt,
            updatedAt: feed.updatedAt,
            atUri: `at://${feed.did}/app.bsky.feed.generator/${feed.slug}`,
          }
        }),
      )
    } catch (error) {
      return res.status(500).json({
        error: error.message,
      })
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
        hashtags: definition.hashtags ?? [],
        mentions: definition.mentions ?? [],
        search: definition.search ?? [],
        pinned: result.pinned,
        bookmark: result.bookmark,
        type: result.type,
        state: result.state,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
        atUri: `at://${result.did}/app.bsky.feed.generator/${result.slug}`,
      })
    } catch (error) {
      return res.status(500).json({
        error: error.message,
      })
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
   *               hashtags:
   *                 type: array
   *                 items:
   *                   type: string
   *               mentions:
   *                 type: array
   *                 items:
   *                   type: string
   *               search:
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

    const payload = req.body as RegisterRequestBody
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
      if (error.code) {
        switch (error.code) {
          case 'SQLITE_CONSTRAINT_PRIMARYKEY':
            return res.status(409).json({
              error: 'feed identifier already exists',
            })
          case 'SQLITE_CONSTRAINT_UNIQUE':
            return res.status(409).json({
              error: 'feed slug already exists',
            })
        }
      }

      return res.status(500).json({
        error: error.message,
      })
    }

    res.status(201).json({
      status: 'created',
      identifier: identifier,
      did: did,
      atUri: `at://${did}/app.bsky.feed.generator/${slug}`,
    })
  })

  const allowedStates = ['draft', 'ready', 'published']
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
   *             hashtags:
   *               type: array
   *               items:
   *                 type: string
   *             mentions:
   *               type: array
   *               items:
   *                 type: string
   *             search:
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
    const payload = req.body as UpdateStateRequestBody

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

      if ('displayName' in payload && payload.displayName) {
        modified++

        definition.displayName = payload.displayName.trim()
        builder = builder.set({
          displayName: definition.displayName,
          definition: JSON.stringify(definition),
        })
      }

      if ('description' in payload && payload.description) {
        modified++

        definition.description = payload.description.trim()
        builder = builder.set({
          description: definition.description,
          definition: JSON.stringify(definition),
        })
      }

      if ('avatar' in payload && payload.avatar) {
        modified++

        definition.avatar = payload.avatar.trim()
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

      if ('users' in payload) {
        modified++
        cacheInvalidated = true

        definition.users = payload.users
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

      if ('mentions' in payload) {
        modified++
        cacheInvalidated = true

        definition.mentions = payload.mentions
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
      return res.status(500).json({
        error: error.message,
      })
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

        const definition = JSON.parse(record.definition)
        if (definition.avatar !== avatarUrl) {
          definition.avatar = avatarUrl

          ctx.db
            .updateTable('feed')
            .set({
              avatar: avatarUrl,
              definition: JSON.stringify(definition),
              updatedAt: new Date().toISOString(),
            })
            .where('did', '=', did)
            .where('identifier', '=', identifier)
            .where('deletedAt', '=', '')
            .execute()
        }
      } catch (error) {
        return res.status(500).json({
          error: error.message,
        })
      }

      res.status(200).json({
        url: avatarUrl,
      })
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
      return res.status(500).json({
        error: error.message,
      })
    }

    res.status(200).json({
      status: 'deleted',
    })
  })

  return router
}
export default makeRouter
