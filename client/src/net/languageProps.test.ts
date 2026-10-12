import { describe, expect, it } from 'vitest';
import { languageProps } from './backend';

describe('languageProps', () => {
  it('lists the host and browser languages, at most four each', () => {
    const host = { languages: () => ['en-US'] };
    expect(languageProps(host, ['vi-VN', 'vi', 'en-US', 'en', 'fr'])).toEqual({ langs: 'en-US', navLangs: 'vi-VN,vi,en-US,en' });
  });

  it('leaves the browser list empty where there is none', () => {
    expect(languageProps({ languages: () => [] }, undefined)).toEqual({ langs: '', navLangs: '' });
  });
});
