import dotenv from 'dotenv'
import { AtpAgent } from '@atproto/api'

const run = async () => {
  dotenv.config()

  if (!process.env.FEEDGEN_PUBLISH_HANDLE) {
    throw new Error('Please provide a handle in the .env file')
  }

  if (!process.env.FEEDGEN_PUBLISH_APP_PASSWORD) {
    throw new Error('Please provide an app password in the .env file')
  }

  const handle = process.env.FEEDGEN_PUBLISH_HANDLE,
    password = process.env.FEEDGEN_PUBLISH_APP_PASSWORD

  let profileHandle = process.env.FEEDGEN_PUBLISH_HANDLE
  if (process.argv[2]) {
    profileHandle = process.argv[2]
  }

  // only update this if in a test environment
  const agent = new AtpAgent({ service: 'https://bsky.social' })
  await agent.login({ identifier: handle, password })

  console.log(
    await agent.api.app.bsky.actor.getProfile({
      actor: profileHandle,
    }),
  )
}

run()
