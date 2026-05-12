// config/cache.ts
import { defineConfig, store, drivers } from '@adonisjs/cache'

const cacheConfig = defineConfig({
  // Ahora 'redis' es una clave válida porque existe en 'stores'
  default: 'redis',

  stores: {
    memoryOnly: store().useL1Layer(drivers.memory()),

    // ✅ CAMBIO: Renombra 'default' a 'redis'
    redis: store()
      .useL1Layer(drivers.memory({ maxSize: '100mb' }))
      .useL2Layer(drivers.redis({ connectionName: 'main' }))
      .useBus(drivers.redisBus({ connectionName: 'main' })),
  }
})

export default cacheConfig

declare module '@adonisjs/cache/types' {
  interface CacheStores extends InferStores<typeof cacheConfig> { }
}