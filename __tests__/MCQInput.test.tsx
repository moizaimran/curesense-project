import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import MCQInput from '../components/interview/MCQInput';

const OPTIONS = ['Option A', 'Option B', 'Option C'];

describe('MCQInput — rendering', () => {
  test('renders all option chips', async () => {
    const { getByText } = await render(<MCQInput options={OPTIONS} onSubmit={jest.fn()} />);
    OPTIONS.forEach(opt => expect(getByText(opt)).toBeTruthy());
  });

  test('options list is capped at 5', async () => {
    const many = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const { queryByText } = await render(<MCQInput options={many} onSubmit={jest.fn()} />);
    expect(queryByText('F')).toBeNull();
    expect(queryByText('G')).toBeNull();
  });

  test('renders custom text input and Send button', async () => {
    const { getByPlaceholderText, getByText } = await render(
      <MCQInput options={OPTIONS} onSubmit={jest.fn()} />
    );
    expect(getByPlaceholderText(/type your own answer/i)).toBeTruthy();
    expect(getByText('Send')).toBeTruthy();
  });
});

describe('MCQInput — submission', () => {
  test('pressing Send with no selection does nothing', async () => {
    const onSubmit = jest.fn();
    const { getByText } = await render(<MCQInput options={OPTIONS} onSubmit={onSubmit} />);
    await fireEvent.press(getByText('Send'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('selecting an option then Send calls onSubmit with that option', async () => {
    const onSubmit = jest.fn();
    const { getByText } = await render(<MCQInput options={OPTIONS} onSubmit={onSubmit} />);
    await fireEvent.press(getByText('Option A'));
    await fireEvent.press(getByText('Send'));
    expect(onSubmit).toHaveBeenCalledWith('Option A');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test('typing custom text then Send calls onSubmit with typed text', async () => {
    const onSubmit = jest.fn();
    const { getByText, getByPlaceholderText } = await render(
      <MCQInput options={OPTIONS} onSubmit={onSubmit} />
    );
    await fireEvent.changeText(getByPlaceholderText(/type your own answer/i), 'custom answer');
    await fireEvent.press(getByText('Send'));
    expect(onSubmit).toHaveBeenCalledWith('custom answer');
  });

  test('custom text takes precedence over chip selection', async () => {
    const onSubmit = jest.fn();
    const { getByText, getByPlaceholderText } = await render(
      <MCQInput options={OPTIONS} onSubmit={onSubmit} />
    );
    await fireEvent.press(getByText('Option B'));
    await fireEvent.changeText(getByPlaceholderText(/type your own answer/i), 'my override');
    await fireEvent.press(getByText('Send'));
    expect(onSubmit).toHaveBeenCalledWith('my override');
  });

  test('after submit, state is reset and Send does nothing on second press', async () => {
    const onSubmit = jest.fn();
    const { getByText, getByPlaceholderText } = await render(
      <MCQInput options={OPTIONS} onSubmit={onSubmit} />
    );
    await fireEvent.changeText(getByPlaceholderText(/type your own answer/i), 'first answer');
    await fireEvent.press(getByText('Send'));
    await fireEvent.press(getByText('Send'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('MCQInput — chip toggle', () => {
  test('pressing a selected chip deselects it so Send does nothing', async () => {
    const onSubmit = jest.fn();
    const { getByText } = await render(<MCQInput options={OPTIONS} onSubmit={onSubmit} />);
    await fireEvent.press(getByText('Option C'));
    await fireEvent.press(getByText('Option C')); // deselect
    await fireEvent.press(getByText('Send'));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
