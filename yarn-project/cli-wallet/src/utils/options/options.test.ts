import { isDebugCaptureEnvEnabled } from './options.js';

describe('debug capture env parsing', () => {
  it.each(['1', 'true', 'TRUE', 'yes', 'on'])('treats %s as enabled', value => {
    expect(isDebugCaptureEnvEnabled(value)).toBe(true);
  });

  it.each([undefined, '', '0', 'false', 'no', 'off', 'random'])('treats %s as disabled', value => {
    expect(isDebugCaptureEnvEnabled(value)).toBe(false);
  });
});
