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

  const host = 'http://127.0.0.1:3000'

  const collectionEndpoint = `${host}/collections`

  // create collection
  const postCollectionResponse = await axios.post(collectionEndpoint, {
    displayName: 'Display name',
  })

  console.log(postCollectionResponse.data)
  const identifier = postCollectionResponse.data.identifier

  // get all collections
  {
    const getCollectionsResponse = await axios.get(collectionEndpoint)
    console.log(getCollectionsResponse.data)
  }

  // get collection with identifier
  {
    const getCollectionResponse = await axios.get(
      `${collectionEndpoint}/${identifier}`,
    )

    console.log(getCollectionResponse.data)
  }

  // update collection
  await axios.put(`${collectionEndpoint}/${identifier}`, {
    displayName: 'Modified display name',
  })

  // get all collections
  {
    const getCollectionsResponse = await axios.get(collectionEndpoint)
    console.log(getCollectionsResponse.data)
  }

  // add post to collection
  await axios.post(`${collectionEndpoint}/${identifier}/posts`, {
    atUri: 'at://did:plc:.../app.bsky.feed.post/...',
    // multiple posts can be added by passing an array
    // atUri: [
    //   'at://did:plc:.../app.bsky.feed.post/...',
    //   'at://did:plc:.../app.bsky.feed.post/...',
    // ],
  })

  // remove post from collection
  await axios.delete(
    `${collectionEndpoint}/${identifier}/posts?atUri=at://did:plc:.../app.bsky.feed.post/...`,
  )

  // delete collection
  await axios.delete(`${collectionEndpoint}/${identifier}`)

  // get all collections
  {
    const getCollectionsResponse = await axios.get(collectionEndpoint)
    console.log(getCollectionsResponse.data)
  }
}

run()
