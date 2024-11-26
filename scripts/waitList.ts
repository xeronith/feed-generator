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

  const waitListEndpoint = `${host}/wait-list`

  {
    // check wait list

    // server recognizes the user based on authorization token
    // and no extra parameters are needed.
    const getWaitListResponse = await axios.get(waitListEndpoint)

    console.log(getWaitListResponse.data)
  }

  {
    // allow or disallow users

    const postWaitListResponse = await axios.post(
      `${waitListEndpoint}/allow`,
      {
        // Either email or handle can be provided but not both.
        // handle: 'special-user.bsky.social',
        email: 'special-user@somewhere.com',
        allowedToUseApp: true,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
    )

    console.log(postWaitListResponse.data)
  }

  {
    // get allowed users (omitting 'allowed' query parameter will return all users)

    const getWaitListReportResponse = await axios.get(
      `${waitListEndpoint}/report?allowed=true`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
    )

    console.log(getWaitListReportResponse.data)
  }

  {
    // get wait-list record for a specific handle

    const getWaitListReportResponse = await axios.get(
      `${waitListEndpoint}/report?handle=user.bsky.social`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
    )

    console.log(getWaitListReportResponse.data)
  }

  {
    // check wait list again

    // server recognizes the user based on authorization token
    // and no extra parameters are needed.
    const getWaitListResponse = await axios.get(waitListEndpoint)

    console.log(getWaitListResponse.data)
  }
}

run()
