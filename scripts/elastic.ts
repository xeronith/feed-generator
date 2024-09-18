import { Client } from '@elastic/elasticsearch'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

dotenv.config()

const certificate = path.resolve(__dirname, '../.cache/elastic/http_ca.crt')

const client = new Client({
  node: `${process.env.ELASTIC_NODE}`,
  auth: {
    username: `${process.env.ELASTIC_USER}`,
    password: `${process.env.ELASTIC_PASSWORD}`,
  },
  tls: {
    ca: fs.readFileSync(certificate),
  },
})

interface Document {
  character: string
  quote: string
}

async function seed() {
  await client.index({
    index: 'game-of-thrones',
    document: {
      character: 'Ned Stark',
      quote: 'Winter is coming.',
    },
  })

  await client.index({
    index: 'game-of-thrones',
    document: {
      character: 'Daenerys Targaryen',
      quote: 'I am the blood of the dragon.',
    },
  })

  await client.index({
    index: 'game-of-thrones',
    document: {
      character: 'Tyrion Lannister',
      quote: 'A mind needs books like a sword needs a whetstone.',
    },
  })

  await client.indices.refresh({ index: 'game-of-thrones' })
}

async function run() {
  const exists = await client.indices.exists({
    index: 'game-of-thrones',
  })

  if (!exists) {
    await seed()
  }

  const result = await client.search<Document>({
    index: 'game-of-thrones',
    query: {
      match: { quote: 'winter' },
    },
  })

  console.log(result.hits.hits)
}

run().catch(console.log)
