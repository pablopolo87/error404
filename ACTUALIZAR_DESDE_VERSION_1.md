# Actualizar Misión 404 al modo concurso

Esta versión conserva el modo individual y añade el concurso en `/duel.html`.

## Actualizar el repositorio actual

1. Descarga y descomprime el ZIP de la versión 2.
2. Abre el repositorio de Misión 404 en GitHub.
3. Sube todos los archivos y carpetas de la versión 2, aceptando la sustitución de los archivos anteriores.
4. Comprueba que GitHub contiene `public/duel.html`, `public/duel.js`, `public/duel.css` y las dos imágenes nuevas.
5. Confirma los cambios mediante **Commit changes**.
6. Render detectará el nuevo commit. Si no comienza, utiliza **Manual Deploy → Deploy latest commit**.

No cambies la variable `MONGODB_URI`. La versión nueva utiliza la misma base `mision_404` y crea automáticamente:

- Las preguntas del concurso dentro de `challenges`.
- Las salas temporales dentro de `rooms`.

Las partidas individuales anteriores de `runs` no se eliminan.

## Comprobación

1. Abre la portada y comprueba que el modo individual sigue funcionando.
2. Pulsa **Abrir concurso**.
3. Crea una sala de duelo desde un navegador.
4. Abre una ventana privada, introduce otro alias y únete con el código.
5. Comienza el concurso y completa al menos dos rondas.
6. Prueba una pregunta de rebote fallando la primera respuesta.
7. En Atlas, abre `mision_404 → rooms` y localiza el código de la sala.

## Modalidades

- **Duelo:** exactamente dos operadores.
- **Equipos:** hasta ocho participantes, cuatro por Equipo Coral y cuatro por Equipo Cian. Debe haber al menos una persona en cada equipo.

Cada sala tiene ocho rondas y desaparece automáticamente de MongoDB seis horas después de su creación.
