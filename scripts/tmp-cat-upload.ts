/** Temporary: upload a category catalogue PDF through the real admin API. */
import { readFile } from 'node:fs/promises';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { UserModel } from '../src/modules/user/user.model.js';
import { signAccessToken } from '../src/shared/tokens.js';

const API = 'http://localhost:5000/api/v1';

async function main(): Promise<void> {
  await connectDatabase();
  const admin = await UserModel.findOne({ phone: '7796419792' });
  if (!admin) throw new Error('admin not found');
  const token = signAccessToken(String(admin._id), admin.phone, admin.role);
  await disconnectDatabase();

  const bytes = await readFile('/tmp/test-catalogue.pdf');
  const file = `data:application/pdf;base64,${bytes.toString('base64')}`;
  console.log('payload bytes', file.length);

  const res = await fetch(`${API}/admin/categories/paper-craft/catalogue`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      title: 'Paper & Craft catalogue',
      description: 'Every paper product in one PDF.',
      file,
    }),
  });
  const body = (await res.json()) as {
    message?: string;
    error?: { message?: string } | null;
    data?: { catalogue?: { url: string; title: string } };
  };

  console.log('status', res.status, 'message', body.message, 'error', body.error?.message ?? 'none');
  const url = body.data?.catalogue?.url;
  console.log('url', url);

  if (url) {
    const head = await fetch(url);
    console.log('delivery', head.status, head.headers.get('content-type'));
  }
}

main().catch((error: unknown) => {
  console.error('failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
