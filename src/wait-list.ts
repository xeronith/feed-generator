import express from 'express'
import { AppContext } from './config'
import { handleError } from './util/errors'

interface UpdateRequestBody {
  handle: string
  email: string
  allowedToUseApp: boolean
}

const makeRouter = (ctx: AppContext) => {
  const router = express.Router()

  router.post('/wait-list/allow', async (req, res) => {
    const payload = req.body as UpdateRequestBody
    if (!('allowedToUseApp' in payload)) {
      return res.status(400).json({
        error: '"allowedToUseApp" is required',
      })
    }

    let handleProvided = false,
      emailProvided = false

    if ('handle' in payload && typeof payload.handle === 'string') {
      handleProvided = true
    }

    if ('email' in payload && typeof payload.email === 'string') {
      emailProvided = true
    }

    if (
      (handleProvided && emailProvided) ||
      (!handleProvided && !emailProvided)
    ) {
      return res.status(400).json({
        error: 'either "handle" or "email" is required but not both',
      })
    }

    try {
      if (emailProvided) {
        const emailAlreadyRegistered = await ctx.db
          .selectFrom('email_lookup')
          .select('email')
          .where('email', '=', payload.email)
          .executeTakeFirst()

        if (!emailAlreadyRegistered) {
          await ctx.db
            .insertInto('email_lookup')
            .values({
              id: payload.email,
              email: payload.email,
              createdAt: new Date().toISOString(),
              allowedToUseApp: payload.allowedToUseApp ? 1 : 0,
            })
            .execute()
        } else {
          await ctx.db
            .updateTable('email_lookup')
            .set({
              allowedToUseApp: payload.allowedToUseApp ? 1 : 0,
            })
            .where('email', '=', payload.email)
            .execute()
        }

        await ctx.db
          .updateTable('wait_list')
          .set({
            allowedToUseApp: payload.allowedToUseApp ? 1 : 0,
          })
          .where('email', '=', payload.email)
          .execute()
      } else {
        const now = new Date().toISOString()
        const did = await ctx.handleResolver.resolve(payload.handle)

        if (!did) {
          return res.status(400).json({
            error: 'failed to resolve handle',
          })
        }

        await ctx.db
          .insertInto('wait_list')
          .values({
            did: did,
            email: '',
            createdAt: now,
            updatedAt: now,
            joined: 0,
            allowedToUseApp: payload.allowedToUseApp ? 1 : 0,
          })
          .onConflict((e) =>
            e.doUpdateSet({
              updatedAt: now,
              allowedToUseApp: payload.allowedToUseApp ? 1 : 0,
            }),
          )
          .execute()
      }

      return res.status(200).json({
        handle: payload.handle,
        email: payload.email,
        allowedToUseApp: payload.allowedToUseApp,
      })
    } catch (error) {
      return handleError(res, error)
    }
  })

  router.get('/wait-list', async (req, res) => {
    const did = req['bsky'].did
    const email = req['bsky'].email

    if (!email) {
      return res.status(404).json({
        error: 'Bluesky email not found',
      })
    }

    try {
      let allowedToUseApp = 0,
        createdAt = new Date().toISOString()

      const emailAlreadyRegistered = await ctx.db
        .selectFrom('email_lookup')
        .select('createdAt')
        .select('allowedToUseApp')
        .where('email', '=', email)
        .executeTakeFirst()

      if (emailAlreadyRegistered) {
        createdAt = new Date(emailAlreadyRegistered.createdAt).toISOString()
        allowedToUseApp = emailAlreadyRegistered.allowedToUseApp
      }

      const result = await ctx.db
        .selectFrom('wait_list')
        .select('did')
        .select('email')
        .select('joined')
        .select('allowedToUseApp')
        .select('createdAt')
        .select('updatedAt')
        .where('did', '=', did)
        .executeTakeFirst()

      if (!result) {
        await ctx.db
          .insertInto('wait_list')
          .values({
            did: did,
            email: email,
            createdAt: createdAt,
            updatedAt: createdAt,
            joined: 0,
            allowedToUseApp: allowedToUseApp,
          })
          .execute()

        res.status(200).json({
          did: did,
          email: email,
          createdAt: createdAt,
          joined: false,
          allowedToUseApp: allowedToUseApp > 0,
        })
      } else {
        await ctx.db
          .updateTable('wait_list')
          .set({
            email: email,
            updatedAt: new Date().toISOString(),
          })
          .where('did', '=', did)
          .execute()

        res.status(200).json({
          did: result.did,
          email: result.email,
          createdAt: result.createdAt,
          joined: result.joined > 0,
          allowedToUseApp: result.allowedToUseApp > 0,
        })
      }
    } catch (error) {
      return handleError(res, error)
    }
  })

  router.get('/wait-list/report', async (req, res) => {
    try {
      let builder = ctx.db
        .selectFrom('wait_list')
        .select('did')
        .select('email')
        .select('allowedToUseApp')
        .select('createdAt')

      if ('allowed' in req.query) {
        builder = builder.where(
          'allowedToUseApp',
          '=',
          req.query.allowed === 'true' ? 1 : 0,
        )
      }

      const result = await builder.execute()

      return res.status(200).json(
        result.map((item) => {
          return {
            did: item.did,
            email: item.email,
            allowedToUseApp: item.allowedToUseApp > 0,
            createdAt: item.createdAt,
          }
        }),
      )
    } catch (error) {
      return handleError(res, error)
    }
  })

  return router
}

export default makeRouter
