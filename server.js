require('dotenv').config();

const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');

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
