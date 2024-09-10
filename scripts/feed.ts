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

  const feedEndpoint = 'http://localhost:3000/feed'

  // delete feed
  await axios.delete(`${feedEndpoint}/astronomy-feed`);

  // create feed (default state is draft)
  await axios.post(feedEndpoint, {
    identifier: 'astronomy-feed',
    displayName: 'Astronomy',
    description: 'Lorem ipsum ...',
    avatar: 'https://picsum.photos/200',
    users: ['user1.bsky.social', 'user2.bsky.social'],
    hashtags: ['#astronomy', '#astrophysics'],
    mentions: ['@user1', '@user2'],
    search: ['nebula', 'galaxy', 'star']
  })

  // get draft feeds
  {
    const getFeedResponse = await axios.get(feedEndpoint)
    console.log(getFeedResponse.data)
  }

  // update feed
  await axios.put(`${feedEndpoint}/astronomy-feed`, {
    displayName: 'Modified display name',
    description: 'Modified description',
    avatar: 'https://picsum.photos/100',
  })

  // pin feed
  await axios.put(`${feedEndpoint}/astronomy-feed`, {
    pinned: true,
  })

  // bookmark feed
  await axios.put(`${feedEndpoint}/astronomy-feed`, {
    favorite: true,
  })

  // get draft feeds
  {
    const getFeedResponse = await axios.get(feedEndpoint)
    console.log(getFeedResponse.data)
  }

  // update feed state
  await axios.put(`${feedEndpoint}/astronomy-feed`, {
    state: 'ready',
  })

  // get feeds by state
  {
    const getFeedResponse = await axios.get(`${feedEndpoint}?state=ready`)
    console.log(getFeedResponse.data)
  }

  // update feed state
  await axios.put(`${feedEndpoint}/astronomy-feed`, {
    state: 'published',
  })

  // get feeds by state
  {
    const getFeedResponse = await axios.get(`${feedEndpoint}?state=published`)
    console.log(getFeedResponse.data)
  }
}

run()
