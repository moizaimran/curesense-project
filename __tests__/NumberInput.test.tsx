import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import NumberInput from '../components/interview/NumberInput';

describe('NumberInput — rendering', () => {
  test('renders a numeric input field', async () => {
    const { getByPlaceholderText } = await render(<NumberInput onSubmit={jest.fn()} />);
    expect(getByPlaceholderText('Enter a number')).toBeTruthy();
  });
});

describe('NumberInput — submission', () => {
  test('typing a number and pressing send calls onSubmit', async () => {
    const onSubmit = jest.fn();
    const { getByPlaceholderText, getByText } = await render(<NumberInput onSubmit={onSubmit} />);
    await fireEvent.changeText(getByPlaceholderText('Enter a number'), '42');
    await fireEvent.press(getByText('➤'));
    expect(onSubmit).toHaveBeenCalledWith('42');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test('pressing send with empty input does nothing', async () => {
    const onSubmit = jest.fn();
    const { getByText } = await render(<NumberInput onSubmit={onSubmit} />);
    await fireEvent.press(getByText('➤'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('decimal values are accepted', async () => {
    const onSubmit = jest.fn();
    const { getByPlaceholderText, getByText } = await render(<NumberInput onSubmit={onSubmit} />);
    await fireEvent.changeText(getByPlaceholderText('Enter a number'), '98.6');
    await fireEvent.press(getByText('➤'));
    expect(onSubmit).toHaveBeenCalledWith('98.6');
  });

  test('after submit the input is cleared and a second press does nothing', async () => {
    const onSubmit = jest.fn();
    const { getByPlaceholderText, getByText } = await render(<NumberInput onSubmit={onSubmit} />);
    await fireEvent.changeText(getByPlaceholderText('Enter a number'), '100');
    await fireEvent.press(getByText('➤'));
    await fireEvent.press(getByText('➤'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test('pressing return key (onSubmitEditing) calls onSubmit', async () => {
    const onSubmit = jest.fn();
    const { getByPlaceholderText } = await render(<NumberInput onSubmit={onSubmit} />);
    const input = getByPlaceholderText('Enter a number');
    await fireEvent.changeText(input, '37');
    await fireEvent(input, 'submitEditing');
    expect(onSubmit).toHaveBeenCalledWith('37');
  });
});

describe('NumberInput — input sanitisation', () => {
  test('non-numeric characters are stripped', async () => {
    const onSubmit = jest.fn();
    const { getByPlaceholderText, getByText } = await render(<NumberInput onSubmit={onSubmit} />);
    await fireEvent.changeText(getByPlaceholderText('Enter a number'), '12.5abc');
    await fireEvent.press(getByText('➤'));
    expect(onSubmit).toHaveBeenCalledWith('12.5');
  });

  test('whitespace-only string (stripped to empty) does not trigger onSubmit', async () => {
    const onSubmit = jest.fn();
    const { getByPlaceholderText, getByText } = await render(<NumberInput onSubmit={onSubmit} />);
    await fireEvent.changeText(getByPlaceholderText('Enter a number'), '   ');
    await fireEvent.press(getByText('➤'));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
