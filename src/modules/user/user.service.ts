import { createChildLogger } from '../../config/logger.js';
import { toPublicUser, type PublicUser, type UserDocument } from './user.model.js';
import type { UpdateProfileInput } from './user.validation.js';

const log = createChildLogger('user');

export function getProfile(user: UserDocument): PublicUser {
  return toPublicUser(user);
}

export async function updateProfile(
  user: UserDocument,
  input: UpdateProfileInput,
): Promise<PublicUser> {
  if (input.name !== undefined && input.name !== user.name) {
    user.name = input.name;
    await user.save();
    log.info({ userId: user.id }, 'Profile name updated');
  }

  return toPublicUser(user);
}
