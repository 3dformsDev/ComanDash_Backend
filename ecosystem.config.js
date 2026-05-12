module.exports = {
  apps: [{
    name: 'prod-minsiva-app',
    script: './build/bin/server.js',  // Apunta al build
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',  // Cambia a production
      PORT: 3333,
      HOST: '0.0.0.0'  // Para que escuche en todas las interfaces
    }
  }]
}
