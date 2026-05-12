# Minsiva - Manual de Configuración del Entorno de Desarrollo

Este documento detalla los pasos para levantar el entorno local de **Minsiva**, la plataforma de comandas digitales. El proyecto está dividido en dos partes principales:

* **Backend (API & WebSockets):** AdonisJS (TypeScript/Node.js)
* **Frontend (App & KDS):** Ionic + Angular (PWA)

---

## 📋 1. Requisitos Previos

Asegúrate de tener instalado el siguiente software en tu máquina:

* **Node.js:** Versión 22.x o superior (LTS recomendada).
* **Gestor de Paquetes:** NPM (viene con Node) o PNPM (recomendado para Adonis).
* **Base de Datos:** MySQL 8.0 o MariaDB.
* **Redis Server:** Versión 8.2.x o superior (LTS recomendada).
* **CLI de Ionic:** Instalado globalmente versión 7.2.2 (`npm install -g @ionic/cli`).
* **Git:** Para el control de versiones.

---

## 🛠️ 2. Configuración del Backend (AdonisJS)

La API maneja la lógica de negocio, autenticación y los WebSockets para tiempo real.

### Paso 2.1: Instalación de Dependencias
Navega a la carpeta del servidor e instala los paquetes:

```bash
cd backend
npm install
# O si usas pnpm:
pnpm install
```

### Paso 2.2: Variables de Entorno (.env)
Duplica el archivo de ejemplo .env.example y renómbralo a .env.

Configura las credenciales de tu base de datos local:

TZ=UTC
PORT=3333
HOST=localhost
LOG_LEVEL=info
APP_KEY=
NODE_ENV=development
DRIVE_DISK=fs
# URL pública que servirá de hook para acceso a recursos como imágenes
APP_URL="http:localhost:3333"
# Palabra secreta para configurar entornos nuevos por medio de ENPOINT
SECRET_WORD="secretword"

# Configuración de Base de Datos
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=root
DB_DATABASE=app

# Configuración de Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=

### Paso 2.3: Generar Key y Base de Datos
Genera la llave de la aplicación:

```bash
node ace generate:key
```
Crea la base de datos en tu gestor MySQL con el nombre minsiva_db.

Ejecuta las migraciones para crear las tablas:

```bash
node ace setup:database
```

el CLI en dado caso te pedirá confirmar tu decisión, escribe en el CLI **Y** y continúa la configuración del entorno.

Levanta el servicio en local
```bash
npm run dev
```

✅ El backend estará corriendo en: http://localhost:3333


# 3. Configuración del Frontend (Ionic + Angular)
La aplicación cliente para meseros y pantalla de cocina.

### Paso 3.1: Instalación
Navega a la carpeta del cliente:

```bash
cd frontend
npm install
```

### Paso 3.2: Configuración de Entorno
Verifica el archivo src/environments/environment.ts. Asegúrate de que apunte a tu backend local:

```bash
export const environment = {
  production: false,
  apiUrl: "http://localhost:3333/api",
  socketUrl: 'http://localhost:3333',
  firebase: {} //acá debe estar la configuración de firebase
};
```

### Paso 3.3: Ejecutar la App
Para ver la aplicación en el navegador con recarga automática

```bash
npm run dev
```

# 🐛 4. Solución de Problemas Comunes
- Error de CORS: Si el frontend no conecta con el backend, verifica el archivo config/cors.ts en Adonis y asegúrate de que enabled esté en true y los orígenes permitan localhost:8100.

- WebSockets no conectan: Asegúrate de que el puerto 3333 no esté bloqueado por el firewall y que la configuración de Ws en el frontend coincida con el puerto del backend.

- Base de datos: Si migration:run falla, verifica que el servicio de MySQL esté activo y las credenciales en el .env sean correctas.