// =============================================================================
// web/src/features/auth/authSlice.js
// Stores authenticated user info + JWT token.
// Token is also persisted in localStorage so it survives page refresh.
// =============================================================================
import { createSlice } from "@reduxjs/toolkit";

const TOKEN_KEY = "cs_token";
const USER_KEY  = "cs_user";

function loadFromStorage() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const user  = JSON.parse(localStorage.getItem(USER_KEY) || "null");
    return { token, user };
  } catch {
    return { token: null, user: null };
  }
}

const { token: savedToken, user: savedUser } = loadFromStorage();

const initialState = {
  token:   savedToken || null,
  user:    savedUser  || null,
  loading: false,
  error:   null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    loginStart: (state) => {
      state.loading = true;
      state.error   = null;
    },
    loginSuccess: (state, action) => {
      state.loading = false;
      state.token   = action.payload.token;
      state.user    = action.payload.user;
      try {
        localStorage.setItem(TOKEN_KEY, action.payload.token);
        localStorage.setItem(USER_KEY, JSON.stringify(action.payload.user));
      } catch {}
    },
    loginFailure: (state, action) => {
      state.loading = false;
      state.error   = action.payload;
    },
    logout: (state) => {
      state.token = null;
      state.user  = null;
      try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      } catch {}
    },
    clearError: (state) => {
      state.error = null;
    },
  },
});

export const { loginStart, loginSuccess, loginFailure, logout, clearError } = authSlice.actions;

// Selectors
export const selectToken    = (state) => state.auth.token;
export const selectUser     = (state) => state.auth.user;
export const selectAuthLoading = (state) => state.auth.loading;
export const selectAuthError   = (state) => state.auth.error;

export default authSlice.reducer;
