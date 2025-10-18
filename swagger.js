import swaggerJSDoc from "swagger-jsdoc";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "FlowChat API",
      version: "1.0.0",
      description: "API documentation for FlowChat",
    },
    servers: [
      {
        url: "https://flowchat-81ni.onrender.com",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        User: {
          type: "object",
          properties: {
            id: { type: "string" },
            fullName: { type: "string" },
            email: { type: "string", format: "email" },
            profilePic: { type: "string", nullable: true },
          },
        },
        Error: {
          type: "object",
          properties: {
            message: { type: "string" },
            errors: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
      },
    },
  },
  apis: ["./docs/*.js"],
};

export const swaggerSpec = swaggerJSDoc(options);