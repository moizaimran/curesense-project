import { formatExpiry, formatPKR, groupCardNumber, luhnValid } from '../utils/payment';

describe('payment helpers', () => {
  test('formatPKR', () => {
    expect(formatPKR(1500)).toBe('Rs 1,500');
    expect(formatPKR(0)).toBe('Rs 0');
  });

  test('luhnValid accepts test cards and rejects typos', () => {
    expect(luhnValid('4242424242424242')).toBe(true);
    expect(luhnValid('5555555555554444')).toBe(true);
    expect(luhnValid('4242424242424241')).toBe(false);
    expect(luhnValid('1234')).toBe(false);
    expect(luhnValid('abcd')).toBe(false);
  });

  test('groupCardNumber groups in fours and strips non-digits', () => {
    expect(groupCardNumber('4242424242424242')).toBe('4242 4242 4242 4242');
    expect(groupCardNumber('4242-4242 42')).toBe('4242 4242 42');
  });

  test('formatExpiry inserts the slash', () => {
    expect(formatExpiry('1')).toBe('1');
    expect(formatExpiry('12')).toBe('12');
    expect(formatExpiry('1230')).toBe('12/30');
    expect(formatExpiry('12/309')).toBe('12/30');
  });
});
