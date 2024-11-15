import express, { Request, Response, NextFunction } from 'express'
import { AppContext } from './config'
import { handleError } from './util/errors'

interface UserLogRequestBody {
  activity: string
  content: any
}

export async function LogMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  let identity: string = 'anonymous'

  if (req['bsky']) {
    identity = req['bsky'].did ?? 'anonymous'
  } else if (req.headers['authorization']) {
    identity = 'bearer-token'
  }

  console.log('REQ <-', req.method, req.path, identity)

  return next()
}

const makeRouter = (ctx: AppContext) => {
  const router = express.Router()

  router.get('/log/user', async (req, res) => {
    if (!ctx.cfg.serviceDid.endsWith(ctx.cfg.hostname)) {
      return res.sendStatus(404)
    }

    const activity = req.query.activity as string
    if (!activity) {
      return res.status(400).json({
        error: 'activity is required',
      })
    }

    try {
      const result = await ctx.db
        .selectFrom('user_log')
        .where('activity', '=', activity)
        .selectAll()
        .orderBy('timestamp', 'desc')
        .execute()

      res.status(200).json(result)
    } catch (error) {
      return handleError(res, error)
    }
  })

  router.post('/log/user', async (req, res) => {
    if (!ctx.cfg.serviceDid.endsWith(ctx.cfg.hostname)) {
      return res.sendStatus(404)
    }

    const payload = req.body as UserLogRequestBody
    if (!payload.activity?.trim() || !payload.content) {
      return res.status(400).json({
        error: 'activity and content are required',
      })
    }

    const did = req['bsky'].did
    const handle = req['bsky'].handle

    try {
      const timestamp = new Date()
      await ctx.db
        .insertInto('user_log')
        .values({
          userDid: did,
          userHandle: handle,
          activity: payload.activity.trim(),
          content: JSON.stringify(payload.content),
          timestamp: timestamp.getTime(),
          createdAt: timestamp.toISOString(),
        })
        .execute()
    } catch (error) {
      return handleError(res, error)
    }

    res.status(201).json({
      status: 'created',
    })
  })

  return router
}

export default makeRouter
