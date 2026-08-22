import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ScaleInput from '../components/interview/ScaleInput';

describe('ScaleInput — rendering', () => {
  test('renders badge with default value of 5 and /10 suffix', async () => {
    const { getAllByText, getByText } = await render(<ScaleInput onSubmit={jest.fn()} />);
    expect(getAllByText('5').length).toBeGreaterThanOrEqual(1);
    expect(getByText('/10')).toBeTruthy();
  });

  test('renders the severity label for value 5 ("Noticeable")', async () => {
    const { getByText } = await render(<ScaleInput onSubmit={jest.fn()} />);
    expect(getByText('Noticeable')).toBeTruthy();
  });

  test('submit button shows current value', async () => {
    const { getByText } = await render(<ScaleInput onSubmit={jest.fn()} />);
    expect(getByText('Submit — 5/10')).toBeTruthy();
  });

  test('renders all 10 tick marks', async () => {
    const { getAllByText } = await render(<ScaleInput onSubmit={jest.fn()} />);
    for (let i = 1; i <= 10; i++) {
      expect(getAllByText(String(i)).length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('ScaleInput — submission', () => {
  test('pressing Submit calls onSubmit("5 out of 10") for default value', async () => {
    const onSubmit = jest.fn();
    const { getByText } = await render(<ScaleInput onSubmit={onSubmit} />);
    await fireEvent.press(getByText('Submit — 5/10'));
    expect(onSubmit).toHaveBeenCalledWith('5 out of 10');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test('disabled prop prevents submission', async () => {
    const onSubmit = jest.fn();
    const { getByText } = await render(<ScaleInput onSubmit={onSubmit} disabled />);
    await fireEvent.press(getByText('Submit — 5/10'));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('ScaleInput — slider interaction', () => {
  test('slider onValueChange updates the displayed value and label', async () => {
    const { getByTestId, getAllByText, getByText } = await render(
      <ScaleInput onSubmit={jest.fn()} />
    );
    const slider = getByTestId('pain-slider');
    await fireEvent(slider, 'valueChange', 8);
    expect(getAllByText('8').length).toBeGreaterThanOrEqual(1);
    expect(getByText('Very severe')).toBeTruthy();
    expect(getByText('Submit — 8/10')).toBeTruthy();
  });

  test('after slider change, onSubmit receives updated value', async () => {
    const onSubmit = jest.fn();
    const { getByTestId, getByText } = await render(<ScaleInput onSubmit={onSubmit} />);
    const slider = getByTestId('pain-slider');
    await fireEvent(slider, 'valueChange', 3);
    await fireEvent.press(getByText('Submit — 3/10'));
    expect(onSubmit).toHaveBeenCalledWith('3 out of 10');
  });
});
