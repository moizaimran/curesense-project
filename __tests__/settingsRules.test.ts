import { passwordProblem, phoneProblem } from '../utils/settingsRules';

describe('settings rules', () => {
  test('password rule matches the backend', () => {
    expect(passwordProblem('Abcdefg1')).toBe('');
    expect(passwordProblem('short1')).toMatch(/8 characters/);
    expect(passwordProblem('abcdefgh')).toMatch(/number/);
    expect(passwordProblem('12345678')).toMatch(/letter/);
  });

  test('phone rule accepts Pakistani mobiles or empty', () => {
    expect(phoneProblem('')).toBe('');
    expect(phoneProblem('0300 123 4567')).toBe('');
    expect(phoneProblem('+923001234567')).toBe('');
    expect(phoneProblem('12345')).not.toBe('');
  });
});
