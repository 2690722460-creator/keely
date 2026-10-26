import { createApp, loadConfig, createMailer } from '../backend/server.mjs';

const config = loadConfig(process.env);
let mailer;
const handler = createApp({
  config,
  sendMail: async message => {
    if (!mailer) mailer = createMailer(config).catch(error => { mailer = null; throw error; });
    const transport = await mailer;
    return transport.sendMail(message);
  }
});

// Vercel's Node runtime supplies IncomingMessage/ServerResponse-compatible objects.
export default handler;
