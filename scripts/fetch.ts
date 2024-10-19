import dotenv from 'dotenv'
import axios from 'axios'
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

  const loginResponse = await agent.login({
    identifier: handle,
    password: password,
  })

  axios.defaults.headers.common[
    'Authorization'
  ] = `Bearer ${loginResponse.data.accessJwt}`

  const endpoint = 'http://127.0.0.1:3000'
  const feedEndpoint = `${endpoint}/feed`
  const feedIdentifier = 'astronomy-feed'

  {
    const getFeedResponse = await axios.get(`${feedEndpoint}/${feedIdentifier}`)
    const url = `${endpoint}/xrpc/app.bsky.feed.getFeedSkeleton?feed=${getFeedResponse.data.atUri}&limit=5`
    const getFeedContentResponse = await axios.get(url)
    console.log(getFeedContentResponse.data)
  }
}

run()
