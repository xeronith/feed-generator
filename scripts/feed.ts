import dotenv from 'dotenv'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import FormData from 'form-data'
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
    password = process.env.FEEDGEN_PUBLISH_APP_PASSWORD,
    apiKey = process.env.ADMIN_API_KEY

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

  const feedEndpoint = `${host}/feed`
  const feedIdentifier = 'astronomy-feed'
  const feedSlug = 'astronomy'

  {
    const authInfoResponse = await axios.delete(`${host}/auth-info`)
    console.log(authInfoResponse.data)
  }

  // delete feed
  await axios.delete(`${feedEndpoint}/${feedIdentifier}`)

  // create feed (default state is draft)
  const postFeedResponse = await axios.post(feedEndpoint, {
    identifier: `${feedIdentifier}`,
    slug: `${feedSlug}`,
    displayName: 'Astronomy',
    description: 'Lorem ipsum ...',
    avatar: 'https://picsum.photos/200',
    users: ['user1.bsky.social', 'user2.bsky.social'],
    authors: ['did:plc:author1', 'did:plc:author2'],
    excludeUsers: ['blocked_user1.bsky.social', 'blocked_user2.bsky.social'],
    excludeAuthors: ['did:plc:blocked_author1', 'did:plc:blocked_author2'],
    hashtags: ['#astronomy', '#astrophysics'],
    excludeHashtags: ['#not-astronomy', '#not-astrophysics'],
    mentions: ['@user1', '@user2'],
    excludeMentions: ['@user3', '@user4'],
    search: ['nebula', 'galaxy', 'star'],
    excludeSearch: ['not-nebula', 'not-galaxy', 'not-star'],
    atUris: ['at://did:plc:.../app.bsky.feed.post/...'],
    excludeAtUris: ['at://did:plc:.../app.bsky.feed.post/...'],
    collections: ['collection1', 'collection2'],
    type: 'mixed',
    operator: 'AND', // defaults to OR if not provided
  })

  console.log(postFeedResponse.data)

  // get all feeds
  {
    const getFeedResponse = await axios.get(feedEndpoint)
    console.log(getFeedResponse.data)
  }

  // get feed with identifier
  {
    const getFeedResponse = await axios.get(`${feedEndpoint}/${feedIdentifier}`)
    console.log(getFeedResponse.data)
  }

  // update feed
  await axios.put(`${feedEndpoint}/${feedIdentifier}`, {
    slug: `${feedSlug}`,
    displayName: 'Modified display name',
    description: 'Modified description',
    avatar: 'https://picsum.photos/100',
    users: ['user3.bsky.social', 'user4.bsky.social'],
    authors: ['did:plc:author3', 'did:plc:author4'],
    excludeUsers: ['blocked_user3.bsky.social', 'blocked_user4.bsky.social'],
    excludeAuthors: ['did:plc:blocked_author3', 'did:plc:blocked_author4'],
    hashtags: ['#astronomy-modified', '#astrophysics-modified'],
    excludeHashtags: ['#not-astronomy-modified', '#not-astrophysics-modified'],
    mentions: ['@user5', '@user6'],
    excludeMentions: ['@user7', '@user8'],
    search: ['nebula-modified', 'galaxy-modified', 'star-modified'],
    excludeSearch: ['not-nebula-modified', 'not-galaxy-modified', 'not-star-modified'],
    atUris: ['at://did:plc:.../app.bsky.feed.post/...'],
    excludeAtUris: ['at://did:plc:.../app.bsky.feed.post/...'],
    collections: ['collection3', 'collection4', 'collection5'],
    operator: 'OR',
  })

  // update avatar
  {
    const data = new FormData()
    const filepath = path.resolve(__dirname, 'feed.png')
    data.append('file', fs.createReadStream(filepath))

    const updateAvatarResponse = await axios.put(
      `${feedEndpoint}/${feedIdentifier}/avatar`,
      data,
    )
    console.log(updateAvatarResponse.data)
  }

  // pin feed
  await axios.put(`${feedEndpoint}/${feedIdentifier}`, {
    pinned: true,
  })

  // bookmark feed
  await axios.put(`${feedEndpoint}/${feedIdentifier}`, {
    bookmark: true,
  })

  // get all feeds
  {
    const getFeedResponse = await axios.get(feedEndpoint)
    console.log(getFeedResponse.data)
  }

  // update feed type
  await axios.put(`${feedEndpoint}/${feedIdentifier}`, {
    type: 'search',
  })

  // get feeds by state
  {
    const getFeedResponse = await axios.get(
      `${feedEndpoint}?state=draft,ready,published`,
    )
    console.log(getFeedResponse.data)
  }

  // update feed state
  await axios.put(`${feedEndpoint}/${feedIdentifier}`, {
    state: 'ready',
  })

  // get feeds by state
  {
    const getFeedResponse = await axios.get(
      `${feedEndpoint}?state=draft,ready,published`,
    )
    console.log(getFeedResponse.data)
  }

  // update feed state
  await axios.put(`${feedEndpoint}/${feedIdentifier}`, {
    state: 'published',
  })

  // get feeds by state
  {
    const getFeedResponse = await axios.get(
      `${feedEndpoint}?state=draft,ready,published`,
    )
    console.log(getFeedResponse.data)
  }

  const logEndpoint = `${host}/log`

  // post user log
  await axios.post(`${logEndpoint}/user`, {
    activity: 'registration',
    content: {
      // You can add your custom data:
      // client: 'Web',
      // clientTimestamp: new Date().toISOString(),
      // ...
    },
  })

  // get user log
  {
    const getLogResponse = await axios.get(
      `${logEndpoint}/user?activity=registration`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
    )
    console.log(getLogResponse.data)
  }
}

run()
