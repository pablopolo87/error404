const fs = require('fs');
const path = require('path');

const required = ['server.js', 'public/index.html', 'public/styles.css', 'public/app.js', 'public/duel.html', 'public/duel.css', 'public/duel.js', 'public/assets/pregunta-seguridad.webp', 'public/assets/pregunta-redes.webp'];
const missing = required.filter((file) => !fs.existsSync(path.join(__dirname, '..', file)));
if (missing.length) {
  console.error(`Faltan archivos: ${missing.join(', ')}`);
  process.exit(1);
}
console.log('Proyecto comprobado: servidor y frontend preparados.');
