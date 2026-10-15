import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

import { Provider } from "react-redux";

import { store } from "./app/store";

import { RouterProvider } from "react-router-dom";
import router from "./routes/AppRouter";
import { Toaster } from "react-hot-toast";
import { onIdTokenChanged } from "firebase/auth";
import { firebaseAuth } from "./config/firebase";
import { setUnauthorizedHandler } from "./utils/api";
import { signOutOfPortal } from "./utils/auth";
import { logout, tokenRefreshed } from "./features/auth/authSlice";

onIdTokenChanged(firebaseAuth, async (fbUser) => {
    if (fbUser) store.dispatch(tokenRefreshed(await fbUser.getIdToken()));
});

setUnauthorizedHandler(() => {
    void signOutOfPortal();
    store.dispatch(logout());
});

createRoot(document.getElementById("root")).render(

    <StrictMode>

        <Provider store={store}>

            <RouterProvider router={router} />
            <Toaster
            position="top-right"
            reverseOrder={false}
        />

        </Provider>

    </StrictMode>

);
