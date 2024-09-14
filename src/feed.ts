import express from 'express'
import { AppContext } from './config'

interface RegisterRequestBody {
  identifier: string
  displayName: string
  description: string
  avatar: string
  pinned?: boolean
  favorite?: boolean
  type?: string
  state?: string
  users: string[]
  hashtags: string[]
  mentions: string[]
  search: string[]
}

interface UpdateStateRequestBody {
  displayName?: string
  description?: string
  avatar?: string
  pinned?: boolean
  favorite?: boolean
  type?: string
  state?: string
  users: string[]
  hashtags: string[]
  mentions: string[]
  search: string[]
}

const makeRouter = (ctx: AppContext) => {
  const router = express.Router()

  const allowedStates = ['draft', 'ready', 'published']
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
      let builder = ctx.db.updateTable('feed')

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
        if (payload.state && !allowedStates.includes(payload.state)) {
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

      if ('favorite' in payload) {
        modified++

        definition.favorite = payload.favorite ? 1 : 0
        builder = builder.set({
          favorite: definition.favorite,
          definition: JSON.stringify(definition),
        })
      }

      if ('users' in payload) {
        modified++

        definition.users = payload.users
        builder = builder.set({
          definition: JSON.stringify(definition),
        })
      }

      if ('hashtags' in payload) {
        modified++

        definition.hashtags = payload.hashtags
        builder = builder.set({
          definition: JSON.stringify(definition),
        })
      }

      if ('mentions' in payload) {
        modified++

        definition.mentions = payload.mentions
        builder = builder.set({
          definition: JSON.stringify(definition),
        })
      }

      if ('search' in payload) {
        modified++

        definition.search = payload.search
        builder = builder.set({
          definition: JSON.stringify(definition),
        })
      }

      if (modified > 0) {
        builder = builder.set({
          updatedAt: new Date().toISOString(),
        })
      }

      builder = builder
        .where('identifier', '=', identifier)
        .where('did', '=', req['bsky'].did)

      await builder.execute()
    } catch (error) {
      return res.status(500).json({
        error: 'failed',
      })
    }

    res.status(200).json({
      status: 'updated',
    })
  })

  router.delete('/feed/:identifier', async (req, res) => {
    if (!ctx.cfg.serviceDid.endsWith(ctx.cfg.hostname)) {
      return res.sendStatus(404)
    }

    const identifier = req.params.identifier

    try {
      await ctx.db
        .deleteFrom('feed')
        .where('identifier', '=', identifier)
        .where('did', '=', req['bsky'].did)
        .execute()
    } catch (error) {
      return res.status(500).json({
        error: 'failed',
      })
    }

    res.status(200).json({
      status: 'deleted',
    })
  })

  router.get('/feed/:identifier', async (req, res) => {
    if (!ctx.cfg.serviceDid.endsWith(ctx.cfg.hostname)) {
      return res.sendStatus(404)
    }

    const identifier = req.params.identifier

    try {
      const result = await ctx.db
        .selectFrom('feed')
        .select('identifier')
        .select('displayName')
        .select('description')
        .select('definition')
        .select('avatar')
        .select('pinned')
        .select('favorite')
        .select('type')
        .select('state')
        .select('createdAt')
        .where('did', '=', req['bsky'].did)
        .where('identifier', '=', identifier)
        .executeTakeFirst()

      if (!result) {
        return res.sendStatus(404)
      }

      res.status(200).json({
        ...result,
        url: `https://${ctx.cfg.hostname}/xrpc/app.bsky.feed.getFeedSkeleton?feed=at://${req['bsky'].did}/app.bsky.feed.generator/${result.identifier}`,
      })
    } catch (error) {
      return res.status(500).json({
        error: 'failed',
      })
    }
  })

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
        .select('displayName')
        .select('description')
        .select('definition')
        .select('avatar')
        .select('pinned')
        .select('favorite')
        .select('type')
        .select('state')
        .select('createdAt')
        .where('did', '=', req['bsky'].did)
        .where('state', '=', state)
        .orderBy('createdAt', 'desc')
        .execute()

      res.status(200).json(
        result.map((feed) => ({
          ...feed,
          url: `https://${ctx.cfg.hostname}/xrpc/app.bsky.feed.getFeedSkeleton?feed=at://${req['bsky'].did}/app.bsky.feed.generator/${feed.identifier}`,
        })),
      )
    } catch (error) {
      return res.status(500).json({
        error: 'failed',
      })
    }
  })

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
        error: 'invalid identifier',
      })
    }

    if (
      'state' in payload &&
      payload.state &&
      !allowedStates.includes(payload.state)
    ) {
      return res.status(400).json({
        error: 'invalid state',
      })
    }

    const did = req['bsky'].did
    const identifier = payload.identifier.trim()

    try {
      const timestamp = new Date().toISOString()
      await ctx.db
        .insertInto('feed')
        .values({
          identifier: identifier,
          displayName: payload.displayName?.trim(),
          description: payload.description?.trim(),
          definition: JSON.stringify(payload),
          did: did,
          avatar: payload.avatar.trim(),
          pinned: payload.pinned ? 1 : 0,
          favorite: payload.favorite ? 1 : 0,
          type: payload.type ?? '',
          state: payload.state ?? 'draft',
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .execute()
    } catch (error) {
      if (error.code && error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
        return res.status(400).json({
          error: 'feed identifier already exists',
        })
      }

      return res.status(500).json({
        error: 'failed',
      })
    }

    res.status(201).json({
      status: 'created',
      identifier: identifier,
      did: did,
      url: `https://${ctx.cfg.hostname}/xrpc/app.bsky.feed.getFeedSkeleton?feed=at://${did}/app.bsky.feed.generator/${identifier}`,
    })
  })

  return router
}
export default makeRouter
