import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import YesNoInput from '../components/interview/YesNoInput';

describe('YesNoInput', () => {
  test('renders Yes and No buttons', async () => {
    const { getByText } = await render(<YesNoInput onSubmit={jest.fn()} />);
    expect(getByText('Yes')).toBeTruthy();
    expect(getByText('No')).toBeTruthy();
  });

  test('pressing Yes calls onSubmit("Yes")', async () => {
    const onSubmit = jest.fn();
    const { getByText } = await render(<YesNoInput onSubmit={onSubmit} />);
    await fireEvent.press(getByText('Yes'));
    expect(onSubmit).toHaveBeenCalledWith('Yes');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test('pressing No calls onSubmit("No")', async () => {
    const onSubmit = jest.fn();
    const { getByText } = await render(<YesNoInput onSubmit={onSubmit} />);
    await fireEvent.press(getByText('No'));
    expect(onSubmit).toHaveBeenCalledWith('No');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test('pressing Yes and No each calls onSubmit once', async () => {
    const onSubmit = jest.fn();
    const { getByText } = await render(<YesNoInput onSubmit={onSubmit} />);
    await fireEvent.press(getByText('Yes'));
    await fireEvent.press(getByText('No'));
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit).toHaveBeenNthCalledWith(1, 'Yes');
    expect(onSubmit).toHaveBeenNthCalledWith(2, 'No');
  });

  test('disabled prop prevents onSubmit from being called', async () => {
    const onSubmit = jest.fn();
    const { getByText } = await render(<YesNoInput onSubmit={onSubmit} disabled />);
    await fireEvent.press(getByText('Yes'));
    await fireEvent.press(getByText('No'));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
