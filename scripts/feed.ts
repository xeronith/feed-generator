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

  const host = 'http://localhost:3000'

  const feedEndpoint = `${host}/feed`
  const feedIdentifier = 'astronomy-feed'

  // delete feed
  await axios.delete(`${feedEndpoint}/${feedIdentifier}`)

  // create feed (default state is draft)
  const postFeedResponse = await axios.post(feedEndpoint, {
    identifier: `${feedIdentifier}`,
    displayName: 'Astronomy',
    description: 'Lorem ipsum ...',
    avatar: 'https://picsum.photos/200',
    users: ['user1.bsky.social', 'user2.bsky.social'],
    hashtags: ['#astronomy', '#astrophysics'],
    mentions: ['@user1', '@user2'],
    search: ['nebula', 'galaxy', 'star'],
    type: 'mixed',
  })

  console.log(postFeedResponse.data)

  // get draft feeds
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
    displayName: 'Modified display name',
    description: 'Modified description',
    avatar: 'https://picsum.photos/100',
    users: ['user3.bsky.social', 'user4.bsky.social'],
    hashtags: ['#astronomy-modified', '#astrophysics-modified'],
    mentions: ['@user3', '@user4'],
    search: ['nebula-modified', 'galaxy-modified', 'star-modified'],
  })

  // update avatar
  {
    const data = new FormData()
    const filepath = path.resolve(__dirname, 'feed.png')
    data.append('file', fs.createReadStream(filepath))

    await axios.put(`${feedEndpoint}/${feedIdentifier}/avatar`, data)
  }

  // pin feed
  await axios.put(`${feedEndpoint}/${feedIdentifier}`, {
    pinned: true,
  })

  // bookmark feed
  await axios.put(`${feedEndpoint}/${feedIdentifier}`, {
    favorite: true,
  })

  // get draft feeds
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
    const getFeedResponse = await axios.get(`${feedEndpoint}?state=published`)
    console.log(getFeedResponse.data)
  }

  // update feed state
  await axios.put(`${feedEndpoint}/${feedIdentifier}`, {
    state: 'ready',
  })

  // get feeds by state
  {
    const getFeedResponse = await axios.get(`${feedEndpoint}?state=ready`)
    console.log(getFeedResponse.data)
  }

  // update feed state
  await axios.put(`${feedEndpoint}/${feedIdentifier}`, {
    state: 'published',
  })

  // get feeds by state
  {
    const getFeedResponse = await axios.get(`${feedEndpoint}?state=published`)
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
}

run()
