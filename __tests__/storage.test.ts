// Mock external storage backends before importing the module under test
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem:    jest.fn().mockResolvedValue(null),
  setItem:    jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync:    jest.fn().mockResolvedValue(null),
  setItemAsync:    jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { getItemAsync, setItemAsync, deleteItemAsync } from '../utils/storage';

// jest-expo defaults to ios; Platform.OS = 'ios' exercises the SecureStore path.
describe('storage — native platform (ios)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('getItemAsync delegates to SecureStore', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('token-abc');
    const result = await getItemAsync('auth_token');
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('auth_token');
    expect(result).toBe('token-abc');
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
  });

  test('setItemAsync delegates to SecureStore', async () => {
    await setItemAsync('auth_token', 'jwt.value');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('auth_token', 'jwt.value');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  test('deleteItemAsync delegates to SecureStore', async () => {
    await deleteItemAsync('auth_token');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('auth_token');
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  });

  test('getItemAsync returns null when key does not exist', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(null);
    const result = await getItemAsync('missing_key');
    expect(result).toBeNull();
  });
});

// Override Platform.OS to simulate the web path.
describe('storage — web platform', () => {
  const originalOS = Platform.OS;

  beforeAll(() => {
    (Platform as any).OS = 'web';
  });

  afterAll(() => {
    (Platform as any).OS = originalOS;
  });

  beforeEach(() => jest.clearAllMocks());

  test('getItemAsync delegates to AsyncStorage', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('web-token');
    const result = await getItemAsync('auth_token');
    expect(AsyncStorage.getItem).toHaveBeenCalledWith('auth_token');
    expect(result).toBe('web-token');
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
  });

  test('setItemAsync delegates to AsyncStorage', async () => {
    await setItemAsync('auth_token', 'jwt.web');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('auth_token', 'jwt.web');
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  test('deleteItemAsync delegates to AsyncStorage.removeItem', async () => {
    await deleteItemAsync('auth_token');
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('auth_token');
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  test('getItemAsync returns null when key absent from AsyncStorage', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
    const result = await getItemAsync('no_key');
    expect(result).toBeNull();
  });
});
