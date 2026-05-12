import type { Socket } from 'socket.io'
// import type { Authenticators } from '@adonisjs/auth/types'
import { AccessToken } from '@adonisjs/auth/access_tokens'
import User from '#models/user'
import db from '@adonisjs/lucid/services/db'

/**
 * SocketAuthMiddleware
 * Autentica conexiones de Socket.IO usando Access Tokens de AdonisJS.
 */
export default class SocketAuthMiddleware {
  /**
   * El prefijo que usan tus tokens. Generalmente se define en `config/auth.ts`.
   * El valor por defecto para OAT (Opaque Access Tokens) es 'oat_'.
   * ¡DEBES AJUSTAR ESTO AL PREFIJO DE TU APLICACIÓN!
   */
  private tokenPrefix = 'oat_' // <--- ¡IMPORTANTE! Cambia esto si tu prefijo es diferente.

  /**
   * Maneja la autenticación para conexiones Socket.IO.
   * Valida el token siguiendo el flujo correcto de AdonisJS AccessTokens.
   */
  async handleForSocket(
    socket: Socket,
    next: (err?: Error) => void,
    // options: { guards?: (keyof Authenticators)[] } = {}
  ) {
    try {
      // --- PASO 1: Extraer el token del handshake ---
      const tokenValue = this.extractToken(socket)
      if (!tokenValue) {
        console.log('❌ Socket Auth: Token no proporcionado')
        return next(new Error('Token de autenticación requerido'))
      }

      // --- PASO 2: Decodificar el token para obtener su ID y el secreto ---
      // Aquí usamos el método ESTÁTICO `decode`.
      const decodedToken = AccessToken.decode(this.tokenPrefix, tokenValue)
      if (!decodedToken) {
        console.log('❌ Socket Auth: El formato del token es inválido')
        return next(new Error('Formato de token inválido'))
      }
      const { identifier, secret } = decodedToken

      // --- PASO 3: Buscar el token en la base de datos usando su ID ---
      const tokenRecord = await db.from('auth_access_tokens').where('id', identifier).first()
      if (!tokenRecord) {
        console.log(`❌ Socket Auth: Token con ID ${identifier} no encontrado en la BD`)
        return next(new Error('Token no encontrado'))
      }

      // --- PASO 4: Crear una INSTANCIA de AccessToken con los datos de la BD ---
      const tokenInstance = new AccessToken({
        identifier: tokenRecord.id,
        tokenableId: tokenRecord.tokenable_id,
        type: tokenRecord.type,
        hash: tokenRecord.hash,
        name: tokenRecord.name,
        abilities: JSON.parse(tokenRecord.abilities || '[]'),
        createdAt: tokenRecord.created_at,
        updatedAt: tokenRecord.updated_at,
        lastUsedAt: tokenRecord.last_used_at,
        expiresAt: tokenRecord.expires_at,
      })

      // --- PASO 5: VERIFICAR y COMPROBAR EXPIRACIÓN en la INSTANCIA ---
      // ¡Esta es la corrección principal! Usamos los métodos de instancia.
      if (!tokenInstance.verify(secret) || tokenInstance.isExpired()) {
        console.log(`❌ Socket Auth: El token con ID ${identifier} es inválido o ha expirado`)
        // Por seguridad, no damos detalles específicos al cliente.
        return next(new Error('Token inválido o expirado'))
      }

      // --- PASO 6: Buscar al usuario asociado al token ---
      const user = await User.find(tokenInstance.tokenableId)
      if (!user) {
        console.log(`❌ Socket Auth: Usuario no encontrado para el token ID ${identifier}`)
        return next(new Error('Usuario no encontrado'))
      }

      // --- ¡ÉXITO! ---
      // Almacenar información útil en el objeto `socket` para usarla después.
      socket.data.user = user
      socket.data.isAuthenticated = true
      socket.data.accessToken = tokenInstance

      console.log(`✅ Socket Auth: Usuario autenticado - ID: ${user.id}, Email: ${user.email}`)
      next() // Permitir la conexión

    } catch (error) {
      console.error('❌ Socket Auth: Error general en el middleware:', error)
      next(new Error('Error interno de autenticación'))
    }
  }

  /**
   * Middleware para validar token en CADA EVENTO (no solo al conectar)
   */
  validateTokenOnEvent() {
    return async (socket: Socket, next: (err?: Error) => void) => {
      try {
        // Extraer token nuevamente (puede haber cambiado)
        const tokenValue = this.extractToken(socket)
        if (!tokenValue) {
          socket.emit('token_expired', { message: 'Token requerido' })
          socket.disconnect()
          return next(new Error('Token requerido'))
        }

        // Revalidar token completo
        const validation = await this.validateToken(tokenValue)
        if (!validation.valid) {
          console.log(`❌ Socket Event Auth: ${validation.error}`)
          // Desconectar el socket si el token expiró
          socket.emit('token_expired', { message: validation.error })
          socket.disconnect()
          return next(new Error(validation.error))
        }

        // Actualizar datos del usuario en el socket
        socket.data.user = validation.user
        socket.data.accessToken = validation.tokenInstance
        next()

      } catch (error) {
        console.error('Error validando token en evento:', error)
        socket.emit('token_expired', { message: 'Error de autenticación' })
        socket.disconnect()
        next(new Error('Error de autenticación'))
      }
    }
  }

  /**
     * Método privado para validar un token completo
     */
  private async validateToken(tokenValue: string): Promise<{
    valid: boolean,
    error?: string,
    user?: User,
    tokenInstance?: AccessToken
  }> {
    try {
      // Decodificar el token para obtener su ID y el secreto
      const decodedToken = AccessToken.decode(this.tokenPrefix, tokenValue)
      if (!decodedToken) {
        return { valid: false, error: 'Formato de token inválido' }
      }

      const { identifier, secret } = decodedToken

      // Buscar el token en la base de datos usando su ID
      const tokenRecord = await db.from('auth_access_tokens').where('id', identifier).first()
      if (!tokenRecord) {
        return { valid: false, error: 'Token no encontrado' }
      }

      // Crear una INSTANCIA de AccessToken con los datos de la BD
      const tokenInstance = new AccessToken({
        identifier: tokenRecord.id,
        tokenableId: tokenRecord.tokenable_id,
        type: tokenRecord.type,
        hash: tokenRecord.hash,
        name: tokenRecord.name,
        abilities: JSON.parse(tokenRecord.abilities || '[]'),
        createdAt: tokenRecord.created_at,
        updatedAt: tokenRecord.updated_at,
        lastUsedAt: tokenRecord.last_used_at,
        expiresAt: tokenRecord.expires_at,
      })

      // VERIFICAR y COMPROBAR EXPIRACIÓN en la INSTANCIA
      if (!tokenInstance.verify(secret)) {
        return { valid: false, error: 'Token inválido' }
      }

      if (tokenInstance.isExpired()) {
        return { valid: false, error: 'Token expirado' }
      }

      // Buscar al usuario asociado al token
      const user = await User.find(tokenInstance.tokenableId)
      if (!user) {
        return { valid: false, error: 'Usuario no encontrado' }
      }

      return {
        valid: true,
        user,
        tokenInstance
      }

    } catch (error) {
      console.error('Error en validateToken:', error)
      return { valid: false, error: 'Error interno de validación' }
    }
  }

  /**
   * Extrae el token desde diferentes fuentes posibles.
   */
  private extractToken(socket: Socket): string | null {
    // 1. Desde auth object (recomendado)
    if (socket.handshake.auth?.token) {
      return socket.handshake.auth.token
    }
    // 2. Desde headers Authorization
    const authHeader = socket.handshake.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7)
    }
    // 3. Desde query parameters
    if (socket.handshake.query?.token) {
      return Array.isArray(socket.handshake.query.token)
        ? socket.handshake.query.token[0]
        : socket.handshake.query.token
    }
    return null
  }
}

/**
 * Helper function para crear una instancia del middleware y usarla en tu archivo de sockets.
 */
export function createSocketAuthMiddleware() {
  const middleware = new SocketAuthMiddleware()
  return (socket: Socket, next: (err?: Error) => void) => {
    // Llama al método correcto del middleware.
    middleware.handleForSocket(socket, next)
  }
}
