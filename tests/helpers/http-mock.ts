import MockAdapter from 'axios-mock-adapter';
import type { AxiosInstance } from 'axios';

export function createHttpMock(instance: AxiosInstance): MockAdapter {
  return new MockAdapter(instance as never);
}

export default createHttpMock;
