import swaggerJsdoc from 'swagger-jsdoc'

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'RobinFeed Server',
      description: '',
      version: '0.5.2',
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: ['./src/feed.ts', './src/feed.js'],
}

export const openapiSpecification = swaggerJsdoc(options)
