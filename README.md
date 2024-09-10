# Robin Feed Generator

This is a kit for creating custom ATProto feeds.

## Overview

Feed Generators are services that provide custom algorithms to users through the AT Protocol.

They work very simply: the server receives a request from a user's server and returns a list of [post URIs](https://atproto.com/specs/at-uri-scheme) with some optional metadata attached. Those posts are then hydrated into full views by the requesting server and sent back to the client. This route is described in the [`app.bsky.feed.getFeedSkeleton` lexicon](https://atproto.com/lexicons/app-bsky-feed#appbskyfeedgetfeedskeleton).

A Feed Generator service can host one or more algorithms. The service itself is identified by DID, while each algorithm that it hosts is declared by a record in the repo of the account that created it. For instance, feeds offered by Bluesky will likely be declared in `@bsky.app`'s repo. Therefore, a given algorithm is identified by the at-uri of the declaration record. This declaration record includes a pointer to the service's DID along with some profile information for the feed.

The general flow of providing a custom algorithm to a user is as follows:
- A user requests a feed from their server (PDS) using the at-uri of the declared feed
- The PDS resolves the at-uri and finds the DID doc of the Feed Generator
- The PDS sends a `getFeedSkeleton` request to the service endpoint declared in the Feed Generator's DID doc
  - This request is authenticated by a JWT signed by the user's repo signing key
- The Feed Generator returns a skeleton of the feed to the user's PDS
- The PDS hydrates the feed (user info, post contents, aggregates, etc.)
  - In the future, the PDS will hydrate the feed with the help of an App View, but for now, the PDS handles hydration itself
- The PDS returns the hydrated feed to the user

For users, this should feel like visiting a page in the app. Once they subscribe to a custom algorithm, it will appear in their home interface as one of their available feeds.

## Getting Started

Create and populate a `.env` file based on the `.env.example` included.

## Running the Server

Install dependencies with `yarn` and then run the server with `yarn start`. This will start the server on port 3000, or what's defined in `.env`.

### Creating a New Feed

To create a custom feed simply post a json payload like the sample below to [http://localhost:3000/feed](http://localhost:3000/feed).

```json
{
    "identifier": "sample",
    "users": ["user1.bsky.social", "user2.bsky.social"],
    "hashtags": ["astronomy"],
    "search": ["galaxy", "start"]
}
```

This will create a feed at [http://localhost:3000/xrpc/app.bsky.feed.getFeedSkeleton?feed=at://did:example:alice/app.bsky.feed.generator/sample](http://localhost:3000/xrpc/app.bsky.feed.getFeedSkeleton?feed=at://did:example:alice/app.bsky.feed.generator/sample) which includes all posts from the specified handles and filtered by the provided tags. Tags are optional. 

Please take a note that it might take quite a while for the firehose to populate the database with enough data that would match your criteria so for testing purposes try to create a feed as general as possible. Here's a sample that usually returns some data within a few minutes.

```json
{
    "identifier": "the-feed",
    "users": ["news-feed.bsky.social"],
    "hashtags": [],
    "search": ["the"]
}
```

This can be accessed at [http://localhost:3000/xrpc/app.bsky.feed.getFeedSkeleton?feed=at://did:example:alice/app.bsky.feed.generator/the-feed](http://localhost:3000/xrpc/app.bsky.feed.getFeedSkeleton?feed=at://did:example:alice/app.bsky.feed.generator/the-feed)

Here's a sample of how you can authenticate, create and retrieve your feeds:

```typescript
import axios from 'axios'
import { AtpAgent } from '@atproto/api'

const run = async () => {
  const feedEndpoint = 'http://localhost:3000/feed'
  const agent = new AtpAgent({ service: 'https://bsky.social' })
  
  const loginResponse = await agent.login({
    identifier: "", // Use your Bluesky account
    password: "", // Use your app password
  })

  axios.defaults.headers.common['Authorization'] = `Bearer ${loginResponse.data.accessJwt}`;

  await axios.post(feedEndpoint, {
    identifier: 'astronomy-feed',
    displayName: 'Astronomy',
    description: 'Lorem ipsum ...',
    avatar: 'https://picsum.photos/200',
    users: ['user1.bsky.social', 'user2.bsky.social'],
    hashtags: ['#astronomy', '#astrophysics'],
    search: ['nebula', 'galaxy', 'star'],
  })

  const getFeedResponse = await axios.get(feedEndpoint)

  console.log(getFeedResponse.data)
}

run()
```
