import swaggerJsdoc from 'swagger-jsdoc'

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'RobinFeed Server',
      description: `

#### Feed Generators are services that provide custom algorithms to users through the AT Protocol.

They work like this: the server receives a request from a user's server and returns a list of post URIs with some optional metadata attached. Those posts are then hydrated into full views by the requesting server and sent back to the client. This route is described in the app.bsky.feed.getFeedSkeleton lexicon.

A Feed Generator service can host one or more algorithms. The service itself is identified by DID, while each algorithm that it hosts is declared by a record in the repo of the account that created it. For instance, feeds offered by Bluesky will likely be declared in @bsky.app's repo. Therefore, a given algorithm is identified by the at-uri of the declaration record. This declaration record includes a pointer to the service's DID along with some profile information for the feed.

The general flow of providing a custom algorithm to a user is as follows:

- A user requests a feed from their server (PDS) using the at-uri of the declared feed

- The PDS resolves the at-uri and finds the DID doc of the Feed Generator

- The PDS sends a getFeedSkeleton request to the service endpoint declared in the Feed Generator's DID doc

  - This request is authenticated by a JWT signed by the user's repo signing key

- The Feed Generator returns a skeleton of the feed to the user's PDS

- The PDS hydrates the feed (user info, post contents, aggregates, etc.)

  - In the future, the PDS will hydrate the feed with the help of an App View, but for now, the PDS handles hydration itself

- The PDS returns the hydrated feed to the user

For users, this should feel like visiting a page in the app. Once they subscribe to a custom algorithm, it will appear in their home interface as one of their available feeds.

      `,
      version: '0.5.2',
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'Should be a valid Bluesky token. Check this link on how to create a valid session: https://docs.bsky.app/docs/get-started#create-a-session',
        },
      },
    },
  },
  apis: [
    './src/feed.ts',
    './feed.js',
    './dist/feed.js',
    './src/collection.ts',
    './collection.js',
    './dist/collection.js',
  ],
}

export const openapiSpecification = swaggerJsdoc(options)
