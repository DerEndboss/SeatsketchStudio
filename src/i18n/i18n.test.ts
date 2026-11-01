import { describe, expect, it } from 'vitest';
import { currentLocale, tr, useI18n, type MsgKey } from './index';

describe('English product copy', () => {
  it('uses English names and measurement locale', () => {
    expect(useI18n.getState().lang).toBe('en');
    expect(currentLocale()).toBe('en-GB');
    expect(tr('name.room')).toBe('Room');
    expect(tr('name.untitled')).toBe('Untitled plan');
  });
  it('keeps unknown dynamic shortcut keys available for their caller fallback', () => {
    expect(tr('key.T' as MsgKey)).toBe('key.T');
  });
});
