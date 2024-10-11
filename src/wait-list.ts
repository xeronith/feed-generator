import express from 'express'
import dotenv from 'dotenv'
import { AppContext } from './config'

interface UpdateRequestBody {
  email: string
  allowedToUseApp: boolean
}

const makeRouter = (ctx: AppContext) => {
  const router = express.Router()

  router.post('/wait-list/allow', async (req, res) => {
    if (req.headers['authorization'] != `Bearer ${process.env.ADMIN_API_KEY}`) {
      return res.status(401).json({
        error: 'missing or invalid api-key',
      })
    }

    const payload = req.body as UpdateRequestBody
    if (!('email' in payload) || typeof payload.email !== 'string') {
      return res.status(400).json({
        error: '"email" is required',
      })
    }

    if (!('allowedToUseApp' in payload)) {
      return res.status(400).json({
        error: '"allowedToUseApp" is required',
      })
    }

    try {
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
          .executeTakeFirst()
      }

      await ctx.db
        .updateTable('wait_list')
        .set({
          allowedToUseApp: payload.allowedToUseApp ? 1 : 0,
        })
        .where('email', '=', payload.email)
        .executeTakeFirst()

      return res.status(200).json({
        email: payload.email,
        allowedToUseApp: payload.allowedToUseApp,
      })
    } catch (error) {
      return res.status(500).json({
        error: error.message,
      })
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
        .where('email', '=', email)
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
        res.status(200).json({
          did: result.did,
          email: result.email,
          createdAt: result.createdAt,
          joined: result.joined > 0,
          allowedToUseApp: result.allowedToUseApp > 0,
        })
      }
    } catch (error) {
      return res.status(500).json({
        error: error.message,
      })
    }
  })

  return router
}

export default makeRouter
