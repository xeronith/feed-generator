import express from 'express'
import { AppContext } from './config'

interface RegisterRequestBody {
  identifier: string
  users: string[]
  hashtags: string[]
  search: string[]
}

const makeRouter = (ctx: AppContext) => {
  const router = express.Router()

  router.get('/feed', async (_req, res) => {
    if (!ctx.cfg.serviceDid.endsWith(ctx.cfg.hostname)) {
      return res.sendStatus(404)
    }

    try {
      const result = await ctx.db
        .selectFrom('feed')
        .selectAll()
        .orderBy('createdAt', 'desc')
        .execute()

      res.status(200).json(result)
    } catch (error) {
      return res.status(500).json({
        error: 'failed',
      })
    }
  })

  router.post('/feed', async (_req, res) => {
    if (!ctx.cfg.serviceDid.endsWith(ctx.cfg.hostname)) {
      return res.sendStatus(404)
    }

    const payload = _req.body as RegisterRequestBody
    if (!payload.identifier || payload.identifier.trim().length > 15) {
      return res.sendStatus(400)
    }

    try {
      const timestamp = new Date().toISOString()
      await ctx.db
        .insertInto('feed')
        .values({
          identifier: payload.identifier,
          definition: JSON.stringify(payload),
          draft: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .execute()
    } catch (error) {
      console.log(error)
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
