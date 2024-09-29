import express, { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import {
  verifyJwt,
  AuthRequiredError,
  parseReqNsid,
} from '@atproto/xrpc-server'
import { DidResolver } from '@atproto/identity'
import { AtpAgent } from '@atproto/api'

export const validateAuth = async (
  req: express.Request,
  serviceDid: string | null,
  didResolver: DidResolver | null,
): Promise<string> => {
  const { authorization = '' } = req.headers
  if (!authorization.startsWith('Bearer ')) {
    throw new AuthRequiredError()
  }
  const jwt = authorization.replace('Bearer ', '').trim()
  const nsid = parseReqNsid(req)
  const parsed = await verifyJwt(jwt, serviceDid, nsid, async (did: string) => {
    return didResolver ? didResolver.resolveAtprotoKey(did) : ''
  })
  return parsed.iss
}

const agent = new AtpAgent({ service: 'https://bsky.social' })
const tokenCache: Record<
  string,
  { did: string; handle: string; email: string; expiry: number }
> = {}
const CACHE_EXPIRY_MS = 30 * 60 * 1000

const excludedRoutes = [
  '/xrpc/app.bsky.feed.getFeedSkeleton',
  '/.well-known/did.json',
]

export async function AuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers['authorization']
  if (authHeader) {
    const token = authHeader.split(' ')[1]
    try {
      const decodedToken = jwt.decode(token, { complete: true })
      console.debug(decodedToken)
    } catch (err) {
      console.error(err)
    }
  }

  if (excludedRoutes.includes(req.path)) {
    return next()
  }

  if (!authHeader) {
    return res.status(401).json({
      error: 'authorization header missing',
    })
  }

  const token = authHeader.split(' ')[1]

  if (!token) {
    return res
      .status(401)
      .json({ error: 'token missing from authorization header' })
  }

  if (tokenCache[token] && tokenCache[token].expiry > Date.now()) {
    req['bsky'] = {
      did: tokenCache[token].did,
      handle: tokenCache[token].handle,
      email: tokenCache[token].email,
    }

    return next()
  } else {
    try {
      const result = await agent.com.atproto.server.getSession(
        {},
        { headers: { Authorization: authHeader } },
      )

      if (!result.success) {
        delete tokenCache[token]
        return res.status(401).json({ error: 'token could not be verified' })
      }

      tokenCache[token] = {
        did: result.data.did,
        handle: result.data.handle,
        email: result.data.email ?? 'n/a',
        expiry: Date.now() + CACHE_EXPIRY_MS,
      }

      req['bsky'] = {
        did: tokenCache[token].did,
        handle: tokenCache[token].handle,
        email: tokenCache[token].email,
      }

      return next()
    } catch (error) {
      return res.status(401).json({ error: 'invalid token' })
    }
  }
}
