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

  const host = 'http://localhost:3000'

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
    // check wait list again

    // server recognizes the user based on authorization token
    // and no extra parameters are needed.
    const getWaitListResponse = await axios.get(waitListEndpoint)

    console.log(getWaitListResponse.data)
  }
}

run()
