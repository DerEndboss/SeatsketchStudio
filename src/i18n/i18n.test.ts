import { afterEach, describe, expect, it } from 'vitest';
import { currentLocale, tr, useI18n, translate, LANGS, type MsgKey } from './index';

describe('Language preferences', () => {
  afterEach(() => useI18n.getState().setLang('en'));
  it('uses English names and measurement locale', () => {
    expect(useI18n.getState().lang).toBe('en');
    expect(currentLocale()).toBe('en-GB');
    expect(tr('name.room')).toBe('Room');
    expect(tr('name.untitled')).toBe('Untitled plan');
  });
  it('keeps unknown dynamic shortcut keys available for their caller fallback', () => {
    expect(tr('key.T' as MsgKey)).toBe('key.T');
  });
  it('updates translations and measurement locale for an explicit choice', () => {
    useI18n.getState().setLang('de');
    expect(currentLocale()).toBe('de-DE');
    expect(tr('name.room')).toBe('Raum');
    expect(tr('count.chairs', { n: 2 })).toBe('2 Stühle');
  });
  it('provides the new inline editor copy in every offered language', () => {
    for (const { id } of LANGS) {
      expect(translate(id, 'start.title')).not.toBe('start.title');
      expect(translate(id, 'templates.title')).not.toBe('templates.title');
    }
  });
});
