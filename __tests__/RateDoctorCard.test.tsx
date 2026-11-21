import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import RateDoctorCard from '../components/RateDoctorCard';

jest.mock('@/utils/storage', () => ({ getAuthToken: jest.fn().mockResolvedValue('tok') }));
jest.mock('@/constants/api', () => ({ API_URL: 'http://api' }));

const okJson = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

beforeEach(() => {
  (global as any).fetch = jest.fn();
});

describe('RateDoctorCard', () => {
  test('no review yet → shows the rating form', async () => {
    (fetch as jest.Mock).mockReturnValueOnce(okJson({ patient_review: null, doctor_review: null }));
    const { findByText, getByText } = await render(<RateDoctorCard appointmentId="a1" doctorName="Sara" />);
    expect(await findByText('Rate Dr. Sara')).toBeTruthy();
    expect(getByText('Submit review')).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith('http://api/api/appointments/a1/reviews', expect.anything());
  });

  test('submitting without stars shows an error and does not call the API', async () => {
    (fetch as jest.Mock).mockReturnValueOnce(okJson({ patient_review: null }));
    const { findByText, getByText } = await render(<RateDoctorCard appointmentId="a1" />);
    await fireEvent.press(await findByText('Submit review'));
    expect(getByText('Please tap a star to rate your doctor.')).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('pick stars + comment → POSTs the review and shows it', async () => {
    (fetch as jest.Mock)
      .mockReturnValueOnce(okJson({ patient_review: null }))
      .mockReturnValueOnce(okJson({ review: { rating: 4, comment: 'Kind and clear' } }));

    const { findByLabelText, getByPlaceholderText, getByText, findByText } =
      await render(<RateDoctorCard appointmentId="a1" />);

    await fireEvent.press(await findByLabelText('4 stars'));
    expect(getByText('Very good')).toBeTruthy();
    await fireEvent.changeText(getByPlaceholderText(/Share a few words/), '  Kind and clear ');
    await fireEvent.press(getByText('Submit review'));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const [url, init] = (fetch as jest.Mock).mock.calls[1];
    expect(url).toBe('http://api/api/appointments/a1/review');
    expect(JSON.parse(init.body)).toEqual({ rating: 4, comment: 'Kind and clear' });
    expect(await findByText('“Kind and clear”')).toBeTruthy();
    expect(getByText('Edit review')).toBeTruthy();
  });

  test('existing review is shown and can be edited', async () => {
    (fetch as jest.Mock).mockReturnValueOnce(okJson({ patient_review: { rating: 5, comment: 'Great' } }));
    const { findByText, getByText } = await render(<RateDoctorCard appointmentId="a1" />);
    expect(await findByText('“Great”')).toBeTruthy();
    await fireEvent.press(getByText('Edit review'));
    expect(getByText('Update review')).toBeTruthy();
  });

  test('server error on submit is shown', async () => {
    (fetch as jest.Mock)
      .mockReturnValueOnce(okJson({ patient_review: null }))
      .mockReturnValueOnce(Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'You can only leave a review after the case is completed' }) }));
    const { findByLabelText, getByText, findByText } = await render(<RateDoctorCard appointmentId="a1" />);
    await fireEvent.press(await findByLabelText('2 stars'));
    await fireEvent.press(getByText('Submit review'));
    expect(await findByText('You can only leave a review after the case is completed')).toBeTruthy();
  });
});
