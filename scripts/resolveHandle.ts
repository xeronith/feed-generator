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

  // only update this if in a test environment
  const agent = new AtpAgent({ service: 'https://bsky.social' })
  await agent.login({ identifier: handle, password })

  try {
    // Use the resolveHandle method to get the DID
    const result = await agent.api.com.atproto.identity.resolveHandle({
      handle,
    })

    // Check if the DID was successfully resolved
    if (result?.data?.did) {
      console.log(`The DID for handle "${handle}" is: ${result.data.did}`)
      return result.data.did
    } else {
      console.log(`No DID found for handle "${handle}".`)
    }
  } catch (error) {
    console.error('Error resolving handle to DID:', error)
  }
}

run()
