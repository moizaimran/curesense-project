import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { logout } from "./authSlice";
import { signOutOfPortal } from "../../utils/auth";

// Ends the Firebase session, clears the stored token/user and returns to the given login page.
export function useSignOut(loginPath) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  return async () => {
    await signOutOfPortal();
    dispatch(logout());
    navigate(loginPath, { replace: true });
  };
}
