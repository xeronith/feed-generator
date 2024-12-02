import express from 'express'
import { Request, Response } from 'express'
import { AppContext } from './config'
import { handleError } from './util/errors'
const crypto = require('crypto')

interface CollectionRequestBody {
  displayName: string
}

const makeRouter = (ctx: AppContext) => {
  const router = express.Router()

  /**
   * @openapi
   * /collections:
   *   get:
   *     description: Retrieve a list of collections
   *     tags: [Collection]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: A list of collections
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 type: object
   *                 properties:
   *                   identifier:
   *                     type: string
   *                   displayName:
   *                     type: string
   */
  router.get('/collections', async (req: Request, res: Response) => {
    try {
      const collections = await ctx.db
        .selectFrom('collection')
        .select('identifier')
        .select('displayName')
        .where('did', '=', req['bsky'].did)
        .where('deletedAt', '=', '')
        .execute()

      const response = collections.map((collection) => ({
        identifier: collection.identifier,
        displayName: collection.displayName,
      }))

      return res.status(200).json(response)
    } catch (error) {
      return handleError(res, error)
    }
  })

  /**
   * @openapi
   * /collections/{identifier}:
   *   get:
   *     description: Retrieve a specific collection
   *     tags: [Collection]
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
   *         description: A specific collection
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 identifier:
   *                   type: string
   *                 displayName:
   *                   type: string
   */
  router.get(
    '/collections/:identifier',
    async (req: Request, res: Response) => {
      const identifier = req.params.identifier

      try {
        const collection = await ctx.db
          .selectFrom('collection')
          .select('identifier')
          .select('displayName')
          .where('identifier', '=', identifier)
          .where('did', '=', req['bsky'].did)
          .where('deletedAt', '=', '')
          .executeTakeFirst()

        if (collection) {
          const response = {
            identifier: collection.identifier,
            displayName: collection.displayName,
          }

          return res.status(200).json(response)
        } else {
          return res.sendStatus(404)
        }
      } catch (error) {
        return handleError(res, error)
      }
    },
  )

  /**
   * @openapi
   * /collections:
   *   post:
   *     description: Create a new collection
   *     tags: [Collection]
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
   *               displayName:
   *                 type: string
   *     responses:
   *       201:
   *         description: Collection created
   */
  router.post('/collections', async (req: Request, res: Response) => {
    const payload = req.body as CollectionRequestBody
    const identifier = crypto.randomUUID()

    try {
      const timestamp = new Date().toISOString()

      await ctx.db
        .insertInto('collection')
        .values({
          identifier: identifier,
          displayName: payload.displayName,
          parent: '',
          did: req['bsky'].did,
          createdAt: timestamp,
          updatedAt: timestamp,
          deletedAt: '',
        })
        .execute()
    } catch (error) {
      return handleError(res, error)
    }

    return res.status(201).json({
      identifier: identifier,
      displayName: payload.displayName,
    })
  })

  /**
   * @openapi
   * /collections/{identifier}:
   *   put:
   *     description: Update an existing collection
   *     tags: [Collection]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: identifier
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               displayName:
   *                 type: string
   *     responses:
   *       200:
   *         description: Collection updated
   */
  router.put(
    '/collections/:identifier',
    async (req: Request, res: Response) => {
      const identifier = req.params.identifier
      const payload = req.body as CollectionRequestBody

      try {
        const collection = await ctx.db
          .selectFrom('collection')
          .select('identifier')
          .select('displayName')
          .where('identifier', '=', identifier)
          .where('did', '=', req['bsky'].did)
          .where('deletedAt', '=', '')
          .executeTakeFirst()

        if (!collection) {
          return res.sendStatus(404)
        }

        await ctx.db
          .updateTable('collection')
          .set({
            displayName: payload.displayName,
            updatedAt: new Date().toISOString(),
          })
          .where('identifier', '=', identifier)
          .execute()

        const response = {
          identifier: identifier,
          displayName: payload.displayName,
        }

        return res.status(200).json(response)
      } catch (error) {
        return handleError(res, error)
      }
    },
  )
  /**
   * @openapi
   * /collections/{identifier}:
   *   delete:
   *     description: Delete an existing collection
   *     tags: [Collection]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: identifier
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       204:
   *         description: Collection deleted
   */
  router.delete(
    '/collections/:identifier',
    async (req: Request, res: Response) => {
      const identifier = req.params.identifier

      try {
        const collection = await ctx.db
          .selectFrom('collection')
          .select('identifier')
          .where('identifier', '=', identifier)
          .where('did', '=', req['bsky'].did)
          .where('deletedAt', '=', '')
          .executeTakeFirst()

        if (!collection) {
          return res.sendStatus(404)
        }

        await ctx.db
          .updateTable('collection')
          .set({ deletedAt: new Date().toISOString() })
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
    },
  )

  return router
}

export default makeRouter
