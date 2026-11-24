require('dotenv').config();

const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DB_NAME = 'mision_404';
const GAME_ID = 'mision_404';

let client = null;
let db = null;
let lastDatabaseError = 'Conexión pendiente';
let connecting = null;

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

const challenges = [
  {
    gameId: GAME_ID, order: 1, moduleId: 'access', moduleName: 'Acceso', title: 'La puerta digital',
    question: 'Necesitamos un perfil que consulte información, pero que no pueda modificarla. ¿Qué permiso debe tener?',
    options: ['Control total', 'Solo lectura', 'Borrar y editar', 'Administrador'], correctOption: 1,
    hint: 'Piensa en alguien que puede mirar un documento, pero no cambiarlo.', points: 100, active: true,
    restoredMessage: 'Acceso recuperado. El alumnado ya puede identificarse y consultar información sin modificarla.'
  },
  {
    gameId: GAME_ID, order: 2, moduleId: 'enrollment', moduleName: 'Matrículas', title: '¿Qué Ana buscamos?',
    question: 'Hay dos alumnas llamadas Ana. ¿Qué dato permite localizar una matrícula sin confundirlas?',
    options: ['El color favorito', 'Un identificador único', 'El nombre solamente', 'La hora de llegada'], correctOption: 1,
    hint: 'Debe ser un dato que no se repita entre dos matrículas.', points: 100, active: true,
    restoredMessage: 'Matrículas recuperadas. Cada inscripción vuelve a localizarse mediante un identificador único.'
  },
  {
    gameId: GAME_ID, order: 3, moduleId: 'schedule', moduleName: 'Horarios', title: 'El calendario perdido',
    question: 'Para colocar correctamente una clase semanal, ¿qué dato necesitamos junto al nombre de la asignatura?',
    options: ['Día y hora', 'Precio y color', 'Contraseña', 'Número de certificado'], correctOption: 0,
    hint: 'Necesitamos saber cuándo ocurre la clase.', points: 100, active: true,
    restoredMessage: 'Horarios recuperados. Las clases vuelven a mostrarse en el día y la hora correspondientes.'
  },
  {
    gameId: GAME_ID, order: 4, moduleId: 'classroom', moduleName: 'Aula virtual', title: 'Mensaje urgente',
    question: 'Recibes un mensaje que pide tu contraseña mediante un enlace urgente. ¿Qué debes hacer?',
    options: ['Abrirlo inmediatamente', 'Reenviarlo a toda la clase', 'No abrirlo y verificar el origen por otra vía', 'Escribir la contraseña'], correctOption: 2,
    hint: 'La urgencia y la petición de contraseña son señales de alarma.', points: 100, active: true,
    restoredMessage: 'Aula virtual recuperada. El enlace sospechoso se ha bloqueado y el acceso vuelve a estar protegido.'
  },
  {
    gameId: GAME_ID, order: 5, moduleId: 'certificates', moduleName: 'Certificados', title: 'Prueba de finalización',
    question: '¿Cómo podemos comprobar que un certificado corresponde a un curso realmente terminado?',
    options: ['Con un dibujo decorativo', 'Con un código único verificable', 'Solo con el nombre', 'Con el color del documento'], correctOption: 1,
    hint: 'Debe poder buscarse y comprobarse sin depender del aspecto del papel.', points: 100, active: true,
    restoredMessage: 'Certificados recuperados. La academia ya puede emitir documentos con un código de verificación único.'
  }
];

const BUZZ_GAME_ID = 'mision_404_buzz';
const buzzChallenges = [
  { category: 'Seguridad', title: 'Contraseña a la vista', question: 'Observa la imagen. ¿Cuál es el principal riesgo?', imageUrl: '/assets/pregunta-seguridad.webp', options: ['La pantalla es demasiado grande', 'La contraseña está expuesta', 'Falta una impresora', 'Hay demasiadas carpetas'], correctOption: 1, explanation: 'Una contraseña visible puede ser copiada por cualquier persona que pase por el puesto.', moduleId: 'access' },
  { category: 'Seguridad', title: 'Mensaje urgente', question: 'Un correo pide tu contraseña y amenaza con cerrar la cuenta. ¿Qué haces?', options: ['Entregarla rápidamente', 'Abrir todos los enlaces', 'Verificar el origen por otra vía', 'Reenviarlo a la clase'], correctOption: 2, explanation: 'La urgencia y la petición de credenciales son señales habituales de fraude.', moduleId: 'classroom' },
  { category: 'Seguridad', title: 'Permiso adecuado', question: 'Una persona solo debe consultar matrículas. ¿Qué permiso necesita?', options: ['Administrador', 'Solo lectura', 'Borrado total', 'Instalación de programas'], correctOption: 1, explanation: 'Debe aplicarse el mínimo permiso necesario para realizar su trabajo.', moduleId: 'enrollment' },
  { category: 'Redes', title: 'Cable desconectado', question: 'Observa la imagen. ¿Qué comprobarías primero si un equipo pierde la red?', imageUrl: '/assets/pregunta-redes.webp', options: ['El cable de red', 'El color de la pared', 'La impresora', 'El tamaño del monitor'], correctOption: 0, explanation: 'Antes de cambiar configuraciones conviene revisar la conexión física.', moduleId: 'classroom' },
  { category: 'Redes', title: 'Dirección de una web', question: '¿Qué utiliza el navegador para localizar un sitio en internet?', options: ['Una URL', 'Un certificado académico', 'Una celda', 'Un altavoz'], correctOption: 0, explanation: 'La URL indica la dirección del recurso que queremos abrir.', moduleId: 'access' },
  { category: 'Redes', title: 'Conexión cifrada', question: '¿Qué indica normalmente el candado junto a una dirección web?', options: ['Que la web es gratuita', 'Que usa una conexión HTTPS cifrada', 'Que no necesita internet', 'Que nunca puede tener errores'], correctOption: 1, explanation: 'HTTPS protege la comunicación, aunque no garantiza por sí solo que todo el contenido sea fiable.', moduleId: 'access' },
  { category: 'Datos', title: 'Dos personas llamadas Ana', question: '¿Qué permite distinguir dos matrículas con el mismo nombre?', options: ['Un identificador único', 'El color de la ficha', 'La primera letra', 'El tamaño del texto'], correctOption: 0, explanation: 'Un identificador único evita confundir registros que comparten otros datos.', moduleId: 'enrollment' },
  { category: 'Datos', title: 'Conservar resultados', question: '¿Dónde deben guardarse las puntuaciones para que continúen después de cerrar la web?', options: ['Solo en la pantalla', 'En MongoDB', 'En el color del botón', 'En una imagen'], correctOption: 1, explanation: 'La base de datos conserva la información independientemente de la pantalla.', moduleId: 'certificates' },
  { category: 'Datos', title: 'Copia de seguridad', question: '¿Para qué sirve principalmente una copia de seguridad?', options: ['Para decorar el sistema', 'Para recuperar información perdida', 'Para aumentar el brillo', 'Para cambiar contraseñas'], correctOption: 1, explanation: 'Una copia permite recuperar información tras una pérdida o un fallo.', moduleId: 'certificates' },
  { category: 'Vida académica', title: 'Clase semanal', question: '¿Qué dato necesitamos junto a la asignatura para colocar una clase?', options: ['Día y hora', 'Precio y color', 'Contraseña', 'Número de factura'], correctOption: 0, explanation: 'El horario necesita situar cada clase en un día y una hora.', moduleId: 'schedule' },
  { category: 'Vida académica', title: 'Certificado verificable', question: '¿Cómo puede comprobarse un certificado sin fiarse solo de su aspecto?', options: ['Con un código único', 'Con una fuente grande', 'Con un borde dorado', 'Con una fotografía'], correctOption: 0, explanation: 'Un código único permite consultar y verificar el registro asociado.', moduleId: 'certificates' },
  { category: 'Vida académica', title: 'Aula virtual', question: '¿Qué función pertenece normalmente a un aula virtual?', options: ['Compartir materiales y actividades', 'Reparar cables', 'Fabricar ordenadores', 'Cambiar la instalación eléctrica'], correctOption: 0, explanation: 'El aula virtual reúne contenidos, tareas y comunicación del curso.', moduleId: 'classroom' }
].map((item, index) => ({ ...item, gameId: BUZZ_GAME_ID, order: index + 1, points: 100, active: true }));

function safeMessage(error) {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, '[URI OCULTA]').slice(0, 240);
}

async function seedChallenges() {
  const collection = db.collection('challenges');
  for (const item of challenges) {
    await collection.updateOne(
      { gameId: GAME_ID, moduleId: item.moduleId },
      { $setOnInsert: item },
      { upsert: true }
    );
  }
  for (const item of buzzChallenges) {
    await collection.updateOne(
      { gameId: BUZZ_GAME_ID, order: item.order },
      { $set: item },
      { upsert: true }
    );
  }
}

async function connectDatabase() {
  if (db) return db;
  if (connecting) return connecting;
  connecting = (async () => {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('Falta la variable privada MONGODB_URI');
    const nextClient = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
    await nextClient.connect();
    const nextDb = nextClient.db(DB_NAME);
    await nextDb.command({ ping: 1 });
    client = nextClient;
    db = nextDb;
    lastDatabaseError = '';
    await seedChallenges();
    await db.collection('runs').createIndex({ completed: 1, score: -1, durationSeconds: 1, finishedAt: 1 });
    await db.collection('rooms').createIndex({ code: 1 }, { unique: true });
    await db.collection('rooms').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    return db;
  })();
  try {
    return await connecting;
  } catch (error) {
    lastDatabaseError = safeMessage(error);
    if (client) await client.close().catch(() => {});
    client = null;
    db = null;
    throw error;
  } finally {
    connecting = null;
  }
}

async function requireDatabase(req, res, next) {
  try {
    await connectDatabase();
    next();
  } catch (error) {
    res.status(503).json({ ok: false, error: 'MongoDB Atlas no está disponible', detail: safeMessage(error) });
  }
}

function validId(value) {
  return typeof value === 'string' && ObjectId.isValid(value);
}

app.get('/api/health', async (req, res) => {
  try {
    await connectDatabase();
    res.json({ ok: true, server: 'active', mongodb: 'connected' });
  } catch (error) {
    res.status(503).json({ ok: false, server: 'active', mongodb: 'disconnected', error: lastDatabaseError });
  }
});

app.get('/api/challenges', requireDatabase, async (req, res) => {
  const list = await db.collection('challenges').find(
    { gameId: GAME_ID, active: true },
    { projection: { correctOption: 0, hint: 0, restoredMessage: 0 } }
  ).sort({ order: 1 }).toArray();
  res.json(list);
});

app.post('/api/runs/start', requireDatabase, async (req, res) => {
  const player = String(req.body.player || '').trim();
  if (player.length < 2 || player.length > 20) {
    return res.status(400).json({ error: 'El alias debe tener entre 2 y 20 caracteres.' });
  }
  const run = {
    gameId: GAME_ID, player, startedAt: new Date(), finishedAt: null,
    answeredChallengeIds: [], hintedChallengeIds: [], restoredModules: [],
    correctAnswers: 0, hintsUsed: 0, score: 0, durationSeconds: null, completed: false
  };
  const result = await db.collection('runs').insertOne(run);
  res.status(201).json({ runId: result.insertedId, player, score: 0 });
});

app.post('/api/runs/hint', requireDatabase, async (req, res) => {
  const { runId, challengeId } = req.body;
  if (!validId(runId) || !validId(challengeId)) return res.status(400).json({ error: 'Identificador no válido.' });
  const runObjectId = new ObjectId(runId);
  const challengeObjectId = new ObjectId(challengeId);
  const [run, challenge] = await Promise.all([
    db.collection('runs').findOne({ _id: runObjectId, gameId: GAME_ID }),
    db.collection('challenges').findOne({ _id: challengeObjectId, gameId: GAME_ID, active: true })
  ]);
  if (!run || !challenge) return res.status(404).json({ error: 'Partida o misión no encontrada.' });
  if (run.completed) return res.status(409).json({ error: 'La partida ya ha terminado.' });
  if (run.hintedChallengeIds.some((id) => id.equals(challengeObjectId))) {
    return res.json({ hint: challenge.hint, score: run.score, alreadyUsed: true });
  }
  const nextScore = Math.max(0, run.score - 25);
  await db.collection('runs').updateOne(
    { _id: runObjectId, completed: false, hintedChallengeIds: { $ne: challengeObjectId } },
    { $push: { hintedChallengeIds: challengeObjectId }, $inc: { hintsUsed: 1 }, $set: { score: nextScore } }
  );
  res.json({ hint: challenge.hint, score: nextScore, alreadyUsed: false });
});

app.post('/api/runs/answer', requireDatabase, async (req, res) => {
  const { runId, challengeId, optionIndex } = req.body;
  if (!validId(runId) || !validId(challengeId) || !Number.isInteger(optionIndex)) {
    return res.status(400).json({ error: 'Respuesta no válida.' });
  }
  const runObjectId = new ObjectId(runId);
  const challengeObjectId = new ObjectId(challengeId);
  const challenge = await db.collection('challenges').findOne({ _id: challengeObjectId, gameId: GAME_ID, active: true });
  if (!challenge || optionIndex < 0 || optionIndex >= challenge.options.length) {
    return res.status(400).json({ error: 'Misión u opción no válida.' });
  }
  const correct = optionIndex === challenge.correctOption;
  const update = { $push: { answeredChallengeIds: challengeObjectId } };
  if (correct) {
    update.$inc = { score: challenge.points, correctAnswers: 1 };
    update.$addToSet = { restoredModules: challenge.moduleId };
  }
  const result = await db.collection('runs').findOneAndUpdate(
    { _id: runObjectId, gameId: GAME_ID, completed: false, answeredChallengeIds: { $ne: challengeObjectId } },
    update,
    { returnDocument: 'after' }
  );
  if (!result) return res.status(409).json({ error: 'Esta misión ya fue respondida o la partida terminó.' });
  res.json({
    correct, score: result.score, correctAnswers: result.correctAnswers,
    restoredModules: result.restoredModules,
    restoredMessage: correct ? challenge.restoredMessage : 'El servicio continúa bloqueado. Revisa la explicación y sigue con la recuperación.',
    explanation: correct ? 'Respuesta correcta.' : `La opción correcta era: ${challenge.options[challenge.correctOption]}.`
  });
});

app.post('/api/runs/finish', requireDatabase, async (req, res) => {
  const { runId } = req.body;
  if (!validId(runId)) return res.status(400).json({ error: 'Partida no válida.' });
  const run = await db.collection('runs').findOne({ _id: new ObjectId(runId), gameId: GAME_ID });
  if (!run) return res.status(404).json({ error: 'Partida no encontrada.' });
  if (run.completed) return res.json(run);
  const total = await db.collection('challenges').countDocuments({ gameId: GAME_ID, active: true });
  if (run.answeredChallengeIds.length < total) return res.status(409).json({ error: 'Todavía quedan misiones por responder.' });
  const finishedAt = new Date();
  const durationSeconds = Math.max(1, Math.round((finishedAt - run.startedAt) / 1000));
  const result = await db.collection('runs').findOneAndUpdate(
    { _id: run._id, completed: false },
    { $set: { completed: true, finishedAt, durationSeconds } },
    { returnDocument: 'after' }
  );
  res.json(result || { ...run, completed: true, finishedAt, durationSeconds });
});

app.get('/api/leaderboard', requireDatabase, async (req, res) => {
  const list = await db.collection('runs').find(
    { gameId: GAME_ID, completed: true },
    { projection: { player: 1, score: 1, correctAnswers: 1, hintsUsed: 1, durationSeconds: 1, restoredModules: 1, finishedAt: 1 } }
  ).sort({ score: -1, durationSeconds: 1, finishedAt: 1 }).limit(10).toArray();
  res.json(list);
});

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeRoomCode() {
  return Array.from({ length: 6 }, () => ROOM_ALPHABET[crypto.randomInt(ROOM_ALPHABET.length)]).join('');
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function newRoomPlayer(alias, host = false) {
  const token = crypto.randomBytes(24).toString('hex');
  return {
    token,
    stored: {
      playerId: crypto.randomUUID(), alias, host, tokenHash: tokenHash(token), joinedAt: new Date(),
      score: 0, correctAnswers: 0, hintsUsed: 0, answeredChallengeIds: [],
      hintedChallengeIds: [], restoredModules: [], startedAt: null, finishedAt: null,
      durationSeconds: null, completed: false
    }
  };
}

function publicRoom(room) {
  return {
    code: room.code, status: room.status, createdAt: room.createdAt, startedAt: room.startedAt,
    winnerPlayerId: room.winnerPlayerId || null,
    players: room.players.map(({ tokenHash: hidden, answeredChallengeIds, hintedChallengeIds, ...player }) => ({
      ...player, answeredCount: answeredChallengeIds.length
    }))
  };
}

async function authenticateRoom(req, res, next) {
  const code = String(req.params.code || '').trim().toUpperCase();
  const playerId = String(req.get('x-player-id') || '');
  const token = String(req.get('x-room-token') || '');
  const room = await db.collection('rooms').findOne({ code });
  const player = room?.players.find((item) => item.playerId === playerId);
  if (!room || !player || !token || player.tokenHash !== tokenHash(token)) {
    return res.status(401).json({ error: 'No se pudo validar al operador de esta sala.' });
  }
  req.room = room;
  req.roomPlayer = player;
  next();
}

app.post('/api/rooms', requireDatabase, async (req, res) => {
  const alias = String(req.body.player || '').trim();
  if (alias.length < 2 || alias.length > 20) return res.status(400).json({ error: 'El alias debe tener entre 2 y 20 caracteres.' });
  const created = newRoomPlayer(alias, true);
  let room;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    room = {
      code: makeRoomCode(), gameId: GAME_ID, status: 'waiting', createdAt: new Date(),
      expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000), startedAt: null,
      finishedAt: null, winnerPlayerId: null, players: [created.stored]
    };
    try {
      await db.collection('rooms').insertOne(room);
      return res.status(201).json({ room: publicRoom(room), playerId: created.stored.playerId, token: created.token });
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }
  res.status(503).json({ error: 'No se pudo generar un código de sala. Inténtalo de nuevo.' });
});

app.post('/api/rooms/:code/join', requireDatabase, async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const alias = String(req.body.player || '').trim();
  if (alias.length < 2 || alias.length > 20) return res.status(400).json({ error: 'El alias debe tener entre 2 y 20 caracteres.' });
  const current = await db.collection('rooms').findOne({ code });
  if (!current) return res.status(404).json({ error: 'No existe una sala con ese código.' });
  if (current.status !== 'waiting') return res.status(409).json({ error: 'La sala ya ha comenzado.' });
  if (current.players.length >= 2) return res.status(409).json({ error: 'La sala ya está completa.' });
  if (current.players.some((player) => player.alias.toLowerCase() === alias.toLowerCase())) return res.status(409).json({ error: 'El otro operador ya utiliza ese alias.' });
  const joined = newRoomPlayer(alias, false);
  const result = await db.collection('rooms').findOneAndUpdate(
    { code, status: 'waiting', 'players.1': { $exists: false } },
    { $push: { players: joined.stored } },
    { returnDocument: 'after' }
  );
  if (!result) return res.status(409).json({ error: 'La sala se ha completado mientras intentabas entrar.' });
  res.json({ room: publicRoom(result), playerId: joined.stored.playerId, token: joined.token });
});

app.get('/api/rooms/:code', requireDatabase, authenticateRoom, async (req, res) => {
  res.json(publicRoom(req.room));
});

app.post('/api/rooms/:code/start', requireDatabase, authenticateRoom, async (req, res) => {
  if (!req.roomPlayer.host) return res.status(403).json({ error: 'Solo el creador puede comenzar el duelo.' });
  if (req.room.players.length !== 2) return res.status(409).json({ error: 'Deben entrar dos operadores.' });
  if (req.room.status !== 'waiting') return res.status(409).json({ error: 'El duelo ya ha comenzado.' });
  const now = new Date();
  const result = await db.collection('rooms').findOneAndUpdate(
    { code: req.room.code, status: 'waiting', 'players.1': { $exists: true } },
    { $set: { status: 'playing', startedAt: now, 'players.0.startedAt': now, 'players.1.startedAt': now } },
    { returnDocument: 'after' }
  );
  res.json(publicRoom(result));
});

app.post('/api/rooms/:code/hint', requireDatabase, authenticateRoom, async (req, res) => {
  if (req.room.status !== 'playing') return res.status(409).json({ error: 'El duelo no está en curso.' });
  const challengeId = String(req.body.challengeId || '');
  if (!validId(challengeId)) return res.status(400).json({ error: 'Misión no válida.' });
  const challengeObjectId = new ObjectId(challengeId);
  const challenge = await db.collection('challenges').findOne({ _id: challengeObjectId, gameId: GAME_ID, active: true });
  if (!challenge) return res.status(404).json({ error: 'Misión no encontrada.' });
  const player = req.room.players.find((item) => item.playerId === req.roomPlayer.playerId);
  if (player.hintedChallengeIds.some((id) => id.equals(challengeObjectId))) return res.json({ hint: challenge.hint, score: player.score, alreadyUsed: true });
  const nextScore = Math.max(0, player.score - 25);
  await db.collection('rooms').updateOne(
    { code: req.room.code, status: 'playing', players: { $elemMatch: { playerId: player.playerId, hintedChallengeIds: { $ne: challengeObjectId } } } },
    { $push: { 'players.$.hintedChallengeIds': challengeObjectId }, $inc: { 'players.$.hintsUsed': 1 }, $set: { 'players.$.score': nextScore } }
  );
  res.json({ hint: challenge.hint, score: nextScore, alreadyUsed: false });
});

app.post('/api/rooms/:code/answer', requireDatabase, authenticateRoom, async (req, res) => {
  if (req.room.status !== 'playing') return res.status(409).json({ error: 'El duelo no está en curso.' });
  const challengeId = String(req.body.challengeId || '');
  const optionIndex = req.body.optionIndex;
  if (!validId(challengeId) || !Number.isInteger(optionIndex)) return res.status(400).json({ error: 'Respuesta no válida.' });
  const challengeObjectId = new ObjectId(challengeId);
  const challenge = await db.collection('challenges').findOne({ _id: challengeObjectId, gameId: GAME_ID, active: true });
  if (!challenge || optionIndex < 0 || optionIndex >= challenge.options.length) return res.status(400).json({ error: 'Misión u opción no válida.' });
  const correct = optionIndex === challenge.correctOption;
  const update = { $push: { 'players.$.answeredChallengeIds': challengeObjectId } };
  if (correct) {
    update.$inc = { 'players.$.score': challenge.points, 'players.$.correctAnswers': 1 };
    update.$addToSet = { 'players.$.restoredModules': challenge.moduleId };
  }
  const result = await db.collection('rooms').findOneAndUpdate(
    { code: req.room.code, status: 'playing', players: { $elemMatch: { playerId: req.roomPlayer.playerId, completed: false, answeredChallengeIds: { $ne: challengeObjectId } } } },
    update,
    { returnDocument: 'after' }
  );
  if (!result) return res.status(409).json({ error: 'Esta misión ya fue respondida.' });
  const player = result.players.find((item) => item.playerId === req.roomPlayer.playerId);
  res.json({ correct, score: player.score, correctAnswers: player.correctAnswers, restoredModules: player.restoredModules,
    restoredMessage: correct ? challenge.restoredMessage : 'El servicio continúa bloqueado.',
    explanation: correct ? 'Respuesta correcta.' : `La opción correcta era: ${challenge.options[challenge.correctOption]}.` });
});

app.post('/api/rooms/:code/finish', requireDatabase, authenticateRoom, async (req, res) => {
  const player = req.room.players.find((item) => item.playerId === req.roomPlayer.playerId);
  if (player.completed) return res.json(publicRoom(req.room));
  const total = await db.collection('challenges').countDocuments({ gameId: GAME_ID, active: true });
  if (player.answeredChallengeIds.length < total) return res.status(409).json({ error: 'Todavía quedan misiones.' });
  const now = new Date();
  const durationSeconds = Math.max(1, Math.round((now - player.startedAt) / 1000));
  let room = await db.collection('rooms').findOneAndUpdate(
    { code: req.room.code, players: { $elemMatch: { playerId: player.playerId, completed: false } } },
    { $set: { 'players.$.completed': true, 'players.$.finishedAt': now, 'players.$.durationSeconds': durationSeconds } },
    { returnDocument: 'after' }
  );
  if (room.players.every((item) => item.completed)) {
    const ranked = [...room.players].sort((a, b) => b.score - a.score || b.correctAnswers - a.correctAnswers || a.durationSeconds - b.durationSeconds || a.finishedAt - b.finishedAt);
    room = await db.collection('rooms').findOneAndUpdate(
      { code: room.code, status: 'playing' },
      { $set: { status: 'finished', finishedAt: new Date(), winnerPlayerId: ranked[0].playerId } },
      { returnDocument: 'after' }
    );
  }
  res.json(publicRoom(room));
});

const BUZZ_CATEGORIES = ['Seguridad', 'Redes', 'Datos', 'Vida académica'];

function newBuzzPlayer(alias, host, team) {
  const token = crypto.randomBytes(24).toString('hex');
  return { token, stored: { playerId: crypto.randomUUID(), alias, host, team, tokenHash: tokenHash(token), joinedAt: new Date(), score: 0, correctAnswers: 0, answeredCount: 0 } };
}

async function publicBuzzRoom(room) {
  let currentQuestion = null;
  if (room.currentChallengeId && ['answering', 'rebound'].includes(room.phase)) {
    const challenge = await db.collection('challenges').findOne(
      { _id: room.currentChallengeId, gameId: BUZZ_GAME_ID },
      { projection: { correctOption: 0, explanation: 0 } }
    );
    currentQuestion = challenge;
  }
  return {
    code: room.code, mode: room.mode, status: room.status, phase: room.phase,
    roundNumber: room.roundNumber, maxRounds: room.maxRounds, categories: BUZZ_CATEGORIES,
    currentTurnPlayerId: room.currentTurnPlayerId, answeringPlayerId: room.answeringPlayerId,
    currentCategory: room.currentCategory || null, currentQuestion, lastResult: room.lastResult || null,
    teamScores: room.teamScores, winnerPlayerId: room.winnerPlayerId || null, winnerTeam: room.winnerTeam || null,
    players: room.players.map(({ tokenHash: hidden, ...player }) => player)
  };
}

async function authenticateBuzz(req, res, next) {
  const code = String(req.params.code || '').trim().toUpperCase();
  const playerId = String(req.get('x-player-id') || '');
  const token = String(req.get('x-room-token') || '');
  const room = await db.collection('rooms').findOne({ code, variant: 'buzz' });
  const player = room?.players.find((item) => item.playerId === playerId);
  if (!room || !player || !token || player.tokenHash !== tokenHash(token)) return res.status(401).json({ error: 'No se pudo validar al operador.' });
  req.buzzRoom = room; req.buzzPlayer = player; next();
}

app.post('/api/buzz/rooms', requireDatabase, async (req, res) => {
  const alias = String(req.body.player || '').trim();
  const mode = req.body.mode === 'teams' ? 'teams' : 'duel';
  if (alias.length < 2 || alias.length > 20) return res.status(400).json({ error: 'El alias debe tener entre 2 y 20 caracteres.' });
  const created = newBuzzPlayer(alias, true, mode === 'teams' ? 'coral' : null);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const room = {
      code: makeRoomCode(), variant: 'buzz', gameId: BUZZ_GAME_ID, mode, status: 'waiting', phase: 'waiting',
      createdAt: new Date(), expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000), startedAt: null, finishedAt: null,
      roundNumber: 0, maxRounds: 8, currentTurnPlayerId: created.stored.playerId, answeringPlayerId: null,
      currentCategory: null, currentChallengeId: null, usedChallengeIds: [], lastResult: null,
      teamScores: { coral: 0, cyan: 0 }, winnerPlayerId: null, winnerTeam: null, players: [created.stored]
    };
    try {
      await db.collection('rooms').insertOne(room);
      return res.status(201).json({ room: await publicBuzzRoom(room), playerId: created.stored.playerId, token: created.token });
    } catch (error) { if (error.code !== 11000) throw error; }
  }
  res.status(503).json({ error: 'No se pudo generar el código.' });
});

app.post('/api/buzz/rooms/:code/join', requireDatabase, async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const alias = String(req.body.player || '').trim();
  const room = await db.collection('rooms').findOne({ code, variant: 'buzz' });
  if (!room) return res.status(404).json({ error: 'No existe esa sala.' });
  if (room.status !== 'waiting') return res.status(409).json({ error: 'La partida ya ha comenzado.' });
  const limit = room.mode === 'teams' ? 8 : 2;
  if (room.players.length >= limit) return res.status(409).json({ error: 'La sala está completa.' });
  if (alias.length < 2 || alias.length > 20) return res.status(400).json({ error: 'El alias debe tener entre 2 y 20 caracteres.' });
  if (room.players.some((p) => p.alias.toLowerCase() === alias.toLowerCase())) return res.status(409).json({ error: 'Ese alias ya está en la sala.' });
  let team = null;
  if (room.mode === 'teams') {
    team = req.body.team === 'cyan' ? 'cyan' : 'coral';
    if (room.players.filter((p) => p.team === team).length >= 4) return res.status(409).json({ error: 'Ese equipo ya tiene cuatro participantes.' });
  }
  const joined = newBuzzPlayer(alias, false, team);
  const result = await db.collection('rooms').findOneAndUpdate(
    { code, variant: 'buzz', status: 'waiting', [`players.${limit - 1}`]: { $exists: false } },
    { $push: { players: joined.stored } }, { returnDocument: 'after' }
  );
  if (!result) return res.status(409).json({ error: 'La sala acaba de completarse.' });
  res.json({ room: await publicBuzzRoom(result), playerId: joined.stored.playerId, token: joined.token });
});

app.get('/api/buzz/rooms/:code', requireDatabase, authenticateBuzz, async (req, res) => res.json(await publicBuzzRoom(req.buzzRoom)));

app.post('/api/buzz/rooms/:code/start', requireDatabase, authenticateBuzz, async (req, res) => {
  const room = req.buzzRoom;
  if (!req.buzzPlayer.host) return res.status(403).json({ error: 'Solo el anfitrión puede comenzar.' });
  if (room.mode === 'duel' && room.players.length !== 2) return res.status(409).json({ error: 'El duelo necesita dos operadores.' });
  if (room.mode === 'teams' && (!room.players.some((p) => p.team === 'coral') || !room.players.some((p) => p.team === 'cyan'))) return res.status(409).json({ error: 'Debe haber participantes en los dos equipos.' });
  const result = await db.collection('rooms').findOneAndUpdate(
    { code: room.code, variant: 'buzz', status: 'waiting' },
    { $set: { status: 'playing', phase: 'choosing', startedAt: new Date() } }, { returnDocument: 'after' }
  );
  res.json(await publicBuzzRoom(result));
});

app.post('/api/buzz/rooms/:code/choose', requireDatabase, authenticateBuzz, async (req, res) => {
  const room = req.buzzRoom;
  const category = String(req.body.category || '');
  if (room.phase !== 'choosing' || room.currentTurnPlayerId !== req.buzzPlayer.playerId) return res.status(409).json({ error: 'No es tu turno de elegir.' });
  if (!BUZZ_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Categoría no válida.' });
  const available = await db.collection('challenges').find({ gameId: BUZZ_GAME_ID, active: true, category, _id: { $nin: room.usedChallengeIds } }).toArray();
  if (!available.length) return res.status(409).json({ error: 'No quedan preguntas en esta categoría. Elige otra.' });
  const challenge = available[crypto.randomInt(available.length)];
  const result = await db.collection('rooms').findOneAndUpdate(
    { code: room.code, variant: 'buzz', phase: 'choosing', currentTurnPlayerId: req.buzzPlayer.playerId },
    { $set: { phase: 'answering', currentCategory: category, currentChallengeId: challenge._id, answeringPlayerId: req.buzzPlayer.playerId, lastResult: null }, $addToSet: { usedChallengeIds: challenge._id } },
    { returnDocument: 'after' }
  );
  res.json(await publicBuzzRoom(result));
});

function reboundPlayer(room, currentPlayer) {
  if (room.mode === 'duel') return room.players.find((p) => p.playerId !== currentPlayer.playerId);
  const otherTeam = currentPlayer.team === 'coral' ? 'cyan' : 'coral';
  const candidates = room.players.filter((p) => p.team === otherTeam);
  return candidates[room.roundNumber % candidates.length];
}

app.post('/api/buzz/rooms/:code/answer', requireDatabase, authenticateBuzz, async (req, res) => {
  const room = req.buzzRoom;
  if (!['answering', 'rebound'].includes(room.phase) || room.answeringPlayerId !== req.buzzPlayer.playerId) return res.status(409).json({ error: 'Ahora no te corresponde responder.' });
  const optionIndex = req.body.optionIndex;
  const challenge = await db.collection('challenges').findOne({ _id: room.currentChallengeId, gameId: BUZZ_GAME_ID });
  if (!challenge || !Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex > 3) return res.status(400).json({ error: 'Respuesta no válida.' });
  const correct = optionIndex === challenge.correctOption;
  const isRebound = room.phase === 'rebound';
  if (correct) {
    const points = isRebound ? 50 : 100;
    const teamInc = room.mode === 'teams' ? { [`teamScores.${req.buzzPlayer.team}`]: points } : {};
    const result = await db.collection('rooms').findOneAndUpdate(
      { code: room.code, variant: 'buzz', phase: room.phase, answeringPlayerId: req.buzzPlayer.playerId },
      { $inc: { 'players.$[player].score': points, 'players.$[player].correctAnswers': 1, 'players.$[player].answeredCount': 1, ...teamInc },
        $set: { phase: 'resolved', lastResult: { correct: true, playerId: req.buzzPlayer.playerId, alias: req.buzzPlayer.alias, points, correctText: challenge.options[challenge.correctOption], explanation: challenge.explanation } } },
      { arrayFilters: [{ 'player.playerId': req.buzzPlayer.playerId }], returnDocument: 'after' }
    );
    return res.json(await publicBuzzRoom(result));
  }
  const updateAnswered = { $inc: { 'players.$[player].answeredCount': 1 } };
  if (!isRebound) {
    const rebound = reboundPlayer(room, req.buzzPlayer);
    updateAnswered.$set = { phase: 'rebound', answeringPlayerId: rebound.playerId, lastResult: { correct: false, playerId: req.buzzPlayer.playerId, alias: req.buzzPlayer.alias, points: 0, message: `Rebote para ${rebound.alias}` } };
  } else {
    updateAnswered.$set = { phase: 'resolved', lastResult: { correct: false, playerId: req.buzzPlayer.playerId, alias: req.buzzPlayer.alias, points: 0, correctText: challenge.options[challenge.correctOption], explanation: challenge.explanation } };
  }
  const result = await db.collection('rooms').findOneAndUpdate(
    { code: room.code, variant: 'buzz', phase: room.phase, answeringPlayerId: req.buzzPlayer.playerId },
    updateAnswered, { arrayFilters: [{ 'player.playerId': req.buzzPlayer.playerId }], returnDocument: 'after' }
  );
  res.json(await publicBuzzRoom(result));
});

function chooseNextBuzzPlayer(room) {
  const current = room.players.find((p) => p.playerId === room.currentTurnPlayerId);
  if (room.mode === 'duel') return room.players.find((p) => p.playerId !== current.playerId);
  const nextTeam = current.team === 'coral' ? 'cyan' : 'coral';
  const candidates = room.players.filter((p) => p.team === nextTeam);
  return candidates[Math.floor((room.roundNumber + 1) / 2) % candidates.length];
}

app.post('/api/buzz/rooms/:code/next', requireDatabase, authenticateBuzz, async (req, res) => {
  const room = req.buzzRoom;
  if (room.phase !== 'resolved') return res.status(409).json({ error: 'La ronda todavía no ha terminado.' });
  if (!req.buzzPlayer.host && req.buzzPlayer.playerId !== room.currentTurnPlayerId) return res.status(403).json({ error: 'Espera a que avance quien eligió la categoría.' });
  const nextRound = room.roundNumber + 1;
  const finished = nextRound >= room.maxRounds;
  let set;
  if (finished) {
    let winnerPlayerId = null, winnerTeam = null;
    if (room.mode === 'duel') winnerPlayerId = [...room.players].sort((a, b) => b.score - a.score || b.correctAnswers - a.correctAnswers || a.joinedAt - b.joinedAt)[0].playerId;
    else winnerTeam = room.teamScores.coral === room.teamScores.cyan ? 'draw' : (room.teamScores.coral > room.teamScores.cyan ? 'coral' : 'cyan');
    set = { status: 'finished', phase: 'finished', finishedAt: new Date(), winnerPlayerId, winnerTeam, roundNumber: nextRound };
  } else {
    const next = chooseNextBuzzPlayer(room);
    set = { phase: 'choosing', roundNumber: nextRound, currentTurnPlayerId: next.playerId, answeringPlayerId: null, currentCategory: null, currentChallengeId: null, lastResult: null };
  }
  const result = await db.collection('rooms').findOneAndUpdate({ code: room.code, variant: 'buzz', phase: 'resolved' }, { $set: set }, { returnDocument: 'after' });
  res.json(await publicBuzzRoom(result));
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Misión 404 disponible en el puerto ${PORT}`);
  connectDatabase().then(() => console.log('MongoDB Atlas conectado')).catch((error) => console.error(`Atlas: ${safeMessage(error)}`));
});

async function shutdown() {
  if (client) await client.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
