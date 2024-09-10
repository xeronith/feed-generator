import express from 'express'
import { AppContext } from './config'

interface RegisterRequestBody {
  identifier: string
  displayName: string
  description: string
  avatar: string
  users: string[]
  hashtags: string[]
  search: string[]
}

interface UpdateStateRequestBody {
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
    if (!payload.state) {
      payload.state = 'draft'
    }

    if (!allowedStates.includes(payload.state)) {
      return res.status(400).json({
        error: 'invalid state',
      })
    }

    try {
      await ctx.db
        .updateTable('feed')
        .set({
          state: payload.state,
          updatedAt: new Date().toISOString(),
        })
        .where('identifier', '=', identifier)
        .where('did', '=', req['bsky'].did)
        .execute()
    } catch (error) {
      return res.status(500).json({
        error: 'failed',
      })
    }

    res.status(200).json({
      status: 'updated',
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
          state: 'draft',
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
