/**
 * Verification probe (session 1596fc7a, doc 147): the host answer reader. No test in the suite
 * exercised `hostAnswerText`, the one gate between a 4 MB-capped host body and a parser that
 * would read a prefix as a whole file (the IBTrACS-sized answers are read by the iframe, but
 * ERSST's 730 KB a month and FEWS NET's pages go through here).
 */
import { describe, expect, it } from 'vitest';
import { hostAnswerText } from './host';

describe('hostAnswerText (probe)', () => {
  it('refuses a truncated body instead of parsing a prefix', () => {
    expect(() => hostAnswerText({ status: 200, body: '{"table":', truncated: true })).toThrow('TRUNCATED');
  });
  it('refuses an answer without a body', () => {
    expect(() => hostAnswerText({ status: 200 })).toThrow('NO_BODY');
    expect(() => hostAnswerText(null)).toThrow('NO_BODY');
  });
  it('decodes a base64 body as UTF-8 (accents survive)', () => {
    const text = 'El Niño · 2 °C';
    const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(text)));
    expect(hostAnswerText({ status: 200, body: b64, encoding: 'base64' })).toBe(text);
  });
  it('passes a plain body through untouched', () => {
    expect(hostAnswerText({ status: 200, body: 'abc', encoding: 'utf8' })).toBe('abc');
  });
});
