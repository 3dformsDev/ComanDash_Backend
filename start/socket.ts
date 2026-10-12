// start/socket.ts

import SocketAuthMiddleware, { createSocketAuthMiddleware } from '#middleware/sockets/socket_auth_middleware'
import KitchenService from '#services/kitchen_service'
import { KitchenOperationError } from '#services/kitchen_state'
import adonisServer from '@adonisjs/core/services/server'
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
        const inventoryUser = socket.data.user;
        if (inventoryUser?.companyId && inventoryUser?.locationId) {
            socket.join(`inventory_${inventoryUser.companyId}_${inventoryUser.locationId}`);
            socket.join(`inventory_company_${inventoryUser.companyId}`);
        }
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
            const user = socket.data.user;
            if (user?.isActive && user.companyId && user.locationId &&
                Number(data?.companyId) === user.companyId && Number(data?.locationId) === user.locationId &&
                !socket.data.accessToken?.isExpired()) {
                const roomName = `kitchen_room_${user.companyId}_${user.locationId}`;
                socket.join(roomName);
                console.log(`🖥️  Socket ${socket.id} se unió a la sala: ${roomName}`);
            } else {
                socket.emit('operation_error', { message: 'No puedes acceder a esta cocina.' });
            }
        });


        socket.on('disconnect', () => {
            console.log('❌ Cliente desconectado:', socket.id)
        })

        socket.on('item_status_changed', async (data) => {
            const user = socket.data.user;
            const orderId = Number(data?.orderId);
            const itemId = Number(data?.itemId);
            const audit = { userId: user?.id, companyId: user?.companyId, locationId: user?.locationId,
                socketId: socket.id, orderId, itemId };
            try {
                if (!user?.isActive || !user.companyId || !user.locationId ||
                    !socket.data.accessToken || socket.data.accessToken.isExpired()) {
                    throw new KitchenOperationError('KITCHEN_UNAUTHORIZED', 'Vuelve a iniciar sesión para continuar.', 401);
                }
                if (!Number.isSafeInteger(orderId) || orderId <= 0 || !Number.isSafeInteger(itemId) || itemId <= 0 ||
                    typeof data?.newStatus !== 'boolean') {
                    throw new KitchenOperationError('KITCHEN_INVALID_EVENT', 'No se pudo identificar el producto.', 400);
                }
                const room = `kitchen_room_${user.companyId}_${user.locationId}`;
                if (!socket.rooms.has(room)) {
                    throw new KitchenOperationError('KITCHEN_ROOM_REQUIRED', 'Abre la cocina antes de cambiar un producto.', 403);
                }
                const result = await KitchenService.changeItem(
                    { companyId: user.companyId, locationId: user.locationId }, orderId, itemId, data.newStatus,
                );
                console.info('[KITCHEN] item_changed', JSON.stringify({ ...audit, ...result }));
                io.to(room).emit('kitchen_item_updated', result);
            } catch (error) {
                if (error instanceof KitchenOperationError) {
                    console.warn('[KITCHEN] item_rejected', JSON.stringify({ ...audit, code: error.code }));
                    socket.emit('operation_error', { orderId, itemId, code: error.code, message: error.message });
                } else {
                    console.error('[KITCHEN] item_failed', audit, error);
                    socket.emit('operation_error', { orderId, itemId, message: 'No se pudo actualizar el producto.' });
                }
            }
        });

    })


}
