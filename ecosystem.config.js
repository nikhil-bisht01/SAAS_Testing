module.exports = {
  apps: [
    {
      name: "saas-backend",
      script: "index.js", // Change if your main file is app.js or server.js
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
}
