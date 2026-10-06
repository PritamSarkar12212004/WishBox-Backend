/**
 * Throwaway: boot the real app for documentation capture.
 * In-memory MongoDB + a mocked gateway, so nothing real is contacted.
 */
import { createHttpMock } from './tests/helpers/http-mock.js';

process.env.NODE_ENV = 'development';
process.env.OTP_DEBUG_RETURN_CODE = 'true';
process.env.LOG_LEVEL = 'warn';
process.env.PORT = '5055';
// The gateway is mocked below; this URL never gets called for real.
process.env.SMS_API_URL = 'https://gateway.test/api/messaging/messages/send';
process.env.SMS_API_TOKEN = 'doc-capture-token';

const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongod = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongod.getUri('wishbox-doc');

const { connectDatabase } = await import('./src/config/database.js');
const { createApp } = await import('./src/app.js');
const { httpClient } = await import('./src/shared/httpClient.js');

const gateway = createHttpMock(httpClient);
gateway.onPost(process.env.SMS_API_URL).reply(200, { message: 'queued', id: 'msg_doc' });

await connectDatabase();

const server = createApp().listen(5055, () => {
  console.log('DOC_SERVER_READY http://127.0.0.1:5055');
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close();
    void mongod.stop().finally(() => process.exit(0));
  });
}
