// Shared render helper: wraps UI in the real Redux store + MemoryRouter.
// Pass initialState to seed specific slices; pass route/routerState for
// components that read useLocation or navigate.
import { render } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import authReducer         from "./features/auth/authSlice";
import patientReducer      from "./features/patients/patientSlice";
import doctorReducer       from "./features/doctor/doctorSlice";
import notificationReducer from "./features/notifications/notificationSlice";
import adminReducer        from "./features/admin/AdminSlice";

export function renderWithProviders(
  ui,
  { initialState = {}, route = "/", routerState = {} } = {}
) {
  const store = configureStore({
    reducer: {
      auth:          authReducer,
      patients:      patientReducer,
      doctor:        doctorReducer,
      notifications: notificationReducer,
      admin:         adminReducer,
    },
    preloadedState: initialState,
  });

  return {
    store,
    ...render(
      <Provider store={store}>
        <MemoryRouter initialEntries={[{ pathname: route, state: routerState }]}>
          {ui}
        </MemoryRouter>
      </Provider>
    ),
  };
}
