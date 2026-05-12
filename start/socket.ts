// start/socket.ts

import SocketAuthMiddleware, { createSocketAuthMiddleware } from '#middleware/sockets/socket_auth_middleware'
import OrderItem from '#models/order_item'
import adonisServer from '@adonisjs/core/services/server'
import { DateTime } from 'luxon'
import { Server } from 'socket.io'

export const io = new Server({
    cors: {
        origin: '*',
    },
    path: '/comandapp-sockets/'
})

export function startSocketServer() {
    const httpServer = adonisServer.getNodeServer()

    if (!httpServer) {
        console.log('--- [B] ERROR: Servidor HTTP no fue encontrado. ---')
        return
    }


    io.attach(httpServer)

    // ✅ ¡AÑADE ESTA LÍNEA AQUÍ!
    console.log('🚀 Servidor de Sockets iniciado y escuchando sobre el servidor HTTP. 🚀')
    const authMiddleware = new SocketAuthMiddleware()

    // ✅ USAR EL HELPER FUNCTION que maneja el async correctamente
    io.use(createSocketAuthMiddleware())

    io.use(authMiddleware.validateTokenOnEvent())

    io.on('connection', (socket) => {
        console.log('✅✅✅ ¡CLIENTE CONECTADO! ID:', socket.id, '✅✅✅')

        // Agregar un pequeño delay para asegurar que la conexión esté lista
        setTimeout(() => {
            socket.emit('welcome', {
                message: '¡Bienvenido! La conexión fue exitosa.',
                socketId: socket.id,
                timestamp: new Date().toISOString()
            })
            console.log(`📤 Mensaje 'welcome' enviado al socket: ${socket.id}`)
        }, 100)

        // Permitimos que los clientes se unan a "salas" específicas.
        // La cocina se unirá a la sala de su compañía.
        socket.on('join_kitchen_room', (data) => {
            if (data && data.companyId && data.locationId) {
                const roomName = `kitchen_room_${data.companyId}_${data.locationId}`;
                socket.join(roomName);
                console.log(`🖥️  Socket ${socket.id} se unió a la sala: ${roomName}`);
            }
        });


        socket.on('disconnect', () => {
            console.log('❌ Cliente desconectado:', socket.id)
        })

        socket.on('item_status_changed', async (data) => {
            try {
                const { orderId, itemId, newStatus } = data;

                // 1. データベース Actualizar el estado en la Base de Datos
                // Buscamos el item específico y actualizamos su estado 'isReady'
                const orderItem = await OrderItem.findOrFail(itemId);

                // ✅ LÓGICA CORREGIDA SEGÚN TU MODELO
                if (newStatus === true) {
                    // Si el frontend dice que está listo (true)
                    orderItem.kitchenStatus = 'pending'
                    // Opcional pero recomendado: registrar el momento exacto en que estuvo listo
                    orderItem.kitchenReadyAt = DateTime.now()
                } else {
                    // Si el frontend lo desmarca (false), lo volvemos a 'pending'
                    orderItem.kitchenStatus = 'in_preparation'
                    // Opcional: limpiar el timestamp de cuándo estuvo listo
                    orderItem.kitchenReadyAt = null
                }

                // Guardamos los cambios en la base de datos
                await orderItem.save();
                console.log(`[DB] Ítem ${itemId} actualizado a kitchenStatus='${orderItem.kitchenStatus}'`);

                // El resto de la lógica para transmitir el cambio es EXACTAMENTE la misma
                const room = Array.from(socket.rooms).find(r => r.startsWith('kitchen_room_'));

                if (room) {
                    console.log(`[Socket] Transmitiendo a la sala ${room}: ítem ${itemId} actualizado.`);
                    io.to(room).emit('kitchen_item_updated', {
                        orderId: orderId,
                        itemId: itemId,
                        newStatus: newStatus, // Seguimos enviando el booleano al frontend
                    });
                } else {
                    console.warn(`[Socket] El socket ${socket.id} intentó actualizar un ítem sin estar en una sala de cocina.`);
                }


            } catch (error) {
                console.error('❌ Error en evento "item_status_changed":', error);
                // Opcional: Notificar al cliente que originó el evento sobre el error
                socket.emit('operation_error', { message: 'No se pudo actualizar el estado del ítem.' });
            }
        });

    })


}