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
    },
  },
  apis: ["./routes/*.js"], // Path to your route files
};

export const swaggerSpec = swaggerJSDoc(options);
