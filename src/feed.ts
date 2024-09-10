import express from 'express'
import { AppContext } from './config'

interface RegisterRequestBody {
  identifier: string
  displayName: string
  description: string
  avatar: string
  pinned?: boolean
  favorite?: boolean
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
  state?: string
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
      let modified: number = 0
      let builder = ctx.db.updateTable('feed')

      if ('displayName' in payload && payload.displayName) {
        modified++
        builder = builder.set({
          displayName: payload.displayName.trim(),
        })
      }

      if ('description' in payload && payload.description) {
        modified++
        builder = builder.set({
          description: payload.description.trim(),
        })
      }

      if ('avatar' in payload && payload.avatar) {
        modified++
        builder = builder.set({
          avatar: payload.avatar.trim(),
        })
      }

      if ('state' in payload) {
        if (payload.state && !allowedStates.includes(payload.state)) {
          return res.status(400).json({
            error: 'invalid state',
          })
        }

        modified++
        builder = builder.set({
          state: payload.state,
        })
      }

      if ('pinned' in payload) {
        modified++
        builder = builder.set({
          pinned: payload.pinned ? 1 : 0,
        })
      }

      if ('favorite' in payload) {
        modified++
        builder = builder.set({
          favorite: payload.favorite ? 1 : 0,
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
        .select('state')
        .select('createdAt')
        .where('did', '=', req['bsky'].did)
        .where('state', '=', state)
        .orderBy('createdAt', 'desc')
        .execute()

      res.status(200).json(result)
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
    if (!payload.identifier || payload.identifier.trim().length > 15) {
      return res.sendStatus(400)
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

    try {
      const timestamp = new Date().toISOString()
      await ctx.db
        .insertInto('feed')
        .values({
          identifier: payload.identifier,
          displayName: payload.displayName,
          description: payload.description,
          definition: JSON.stringify(payload),
          did: req['bsky'].did,
          avatar: payload.avatar,
          pinned: payload.pinned ? 1 : 0,
          favorite: payload.favorite ? 1 : 0,
          state: payload.state ?? 'draft',
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .execute()
    } catch (error) {
      return res.status(500).json({
        error: 'failed',
      })
    }

    res.status(201).json({
      status: 'created',
    })
  })

  return router
}
export default makeRouter
