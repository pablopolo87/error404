# Misión 404 · Academia

Juego educativo completo con frontend, servidor Node/Express y persistencia en MongoDB Atlas. El alumnado debe recuperar cinco servicios de una academia: acceso, matrículas, horarios, aula virtual y certificados.

## Qué incluye

- Cinco misiones cargadas automáticamente sin duplicados.
- Pistas que restan puntos.
- Validación y cálculo de puntuación en el servidor.
- Estado visual de cada servicio recuperado.
- Ranking persistente con las diez mejores partidas.
- Diseño responsive para ordenador, tableta y móvil.
- Sin datos de demostración ni almacenamiento local como sustituto de MongoDB.

## La única variable privada

El proyecto necesita `MONGODB_URI`. Su valor es la cadena completa de MongoDB Atlas e incluye el usuario, la contraseña, el servidor y la base `mision_404`.

No escribas el valor en el código, en el README ni en GitHub. El archivo `.env` está excluido mediante `.gitignore`.

## Probar en el ordenador

1. Instala Node.js 20 o superior.
2. Ejecuta `npm install`.
3. Copia `.env.example` como `.env`.
4. Sustituye el ejemplo de `MONGODB_URI` por tu cadena privada.
5. Ejecuta `npm start`.
6. Abre `http://localhost:3000`.

La primera conexión crea la base `mision_404`, las colecciones necesarias y las cinco misiones. No hace falta importar ningún archivo JSON.

## Subir a GitHub

Crea un repositorio nuevo y sube el contenido de esta carpeta. Antes de confirmar los archivos, comprueba que `.env` no aparece. El repositorio sí debe contener `.env.example`, pero solamente con valores inventados.

## Publicar como Web Service en Render

| Campo | Valor |
|---|---|
| Root Directory | Vacío si `package.json` está en la raíz |
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |

En **Environment Variables** añade:

| Key | Value |
|---|---|
| `MONGODB_URI` | Tu cadena privada completa de MongoDB Atlas |

No añadas `PORT`: Render la proporciona automáticamente.

## MongoDB Atlas

La aplicación utiliza:

- Base de datos: `mision_404`
- Colección `challenges`: cinco misiones.
- Colección `runs`: partidas, puntuaciones y servicios recuperados.

Para una prueba temporal puedes permitir `0.0.0.0/0` en Network Access, preferiblemente con caducidad. Elimina esa regla al terminar y no guardes datos personales reales.

## Prueba completa

1. Abre la URL de Render.
2. Comprueba el indicador «MongoDB Atlas conectado».
3. Completa una partida con un alias reconocible.
4. Recarga la página y comprueba el ranking.
5. En Atlas abre `mision_404 > runs` y localiza la partida.

## Rutas del servidor

- `GET /api/health`
- `GET /api/challenges`
- `POST /api/runs/start`
- `POST /api/runs/hint`
- `POST /api/runs/answer`
- `POST /api/runs/finish`
- `GET /api/leaderboard`

Las respuestas correctas, las pistas y los mensajes de recuperación no se entregan al navegador antes de utilizarlos.
