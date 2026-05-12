import type { ApplicationService } from '@adonisjs/core/types'
import adonisServer from '@adonisjs/core/services/server'
import { Server } from 'socket.io'

// Clase para el container binding
class SocketIOService {
  constructor(public io: Server) {}
}

export default class SocketProvider {
    constructor(protected app: ApplicationService) { }

    /**
     * Register bindings to the container
     */
    register() { }

    /**
     * The container bindings have booted
     */
    async boot() { }

    /**
     * The application has been booted
     */
    async start() {
        // Aquí sabemos que el servidor HTTP está completamente listo
        const httpServer = adonisServer.getNodeServer()

        const io = new Server(httpServer, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        })

        // Registrar en el container para usarlo en otros lugares
        this.app.container.singleton(SocketIOService, () => new SocketIOService(io))

        // Configurar event handlers
        io.on('connection', (socket) => {
            console.log('🔌 Cliente conectado:', socket.id)

            socket.emit('msgFromBE', {
                hello: 'from BE',
                socketId: socket.id,
                timestamp: new Date().toISOString()
            })

            socket.on('msgFromFE', (data) => {
                console.log('📨 msgFromFE recibido:', data)

                // Echo back to client
                socket.emit('msgFromBE', {
                    type: 'response',
                    message: 'Mensaje procesado correctamente',
                    originalData: data,
                    timestamp: new Date().toISOString()
                })
            })

            socket.on('disconnect', () => {
                console.log('🔌 Cliente desconectado:', socket.id)
            })
        })

        console.log('✅ Socket.IO Provider inicializado')
    }

    /**
     * Preparing to shutdown the app
     */
    async shutdown() { }
}