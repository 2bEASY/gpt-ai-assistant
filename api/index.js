import express from 'express';
import { handleEvents, printPrompts } from '../app/index.js';
import config from '../config/index.js';
import { validateLineSignature } from '../middleware/index.js';
import storage from '../storage/index.js';
import { fetchVersion, getVersion } from '../utils/index.js';
import { t } from '../locales/index.js';
import { pushMessage } from '../services/line.js';
import Context from '../app/context.js';
import Event from '../app/models/event.js';

const app = express();

app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  },
}));

app.get('/', (req, res) => {
  if (config.APP_URL) {
    res.redirect(config.APP_URL);
    return;
  }
  res.sendStatus(200);
});

app.get('/info', async (req, res) => {
  const currentVersion = getVersion();
  const latestVersion = await fetchVersion();
  res.status(200).send({ currentVersion, latestVersion });
});

app.post(config.APP_WEBHOOK_PATH, validateLineSignature, async (req, res) => {
  let timeoutIds = [];
  try {
    await storage.initialize();
    const events = req.body.events;
    const context = await Promise.all(
      events
        .map((event) => new Event(event))
        .filter((event) => event.isMessage)
        .filter((event) => event.isText || event.isAudio)
        .map((event) => new Context(event))
        .map((context) => context.initialize()),
    );

    context.forEach((item) => {
      const interimPushMessage = {
        userId : item.userId,
        messages: [{
          type: "text",
          text: t('__MESSAGE_CALMING')
        }]
      };
  
      const timeoutId = setTimeout(() => {
        pushMessage(interimPushMessage).catch(console.error);
      }, config.OPENAI_CALMING_TIME);

      timeoutIds.push(timeoutId);

    });
    
    await handleEvents(req.body.events);

    timeoutIds.forEach(clearTimeout);
    
    res.sendStatus(200);
  } catch (err) {
    console.error(err.message);

    if (timeoutIds.length > 0) timeoutIds.forEach(clearTimeout);

    res.sendStatus(500);
  }
  if (config.APP_DEBUG) printPrompts();
});

if (config.APP_PORT) {
  app.listen(config.APP_PORT);
}

export default app;
