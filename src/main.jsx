import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

import { Provider } from "react-redux";

import { store } from "./app/store";

import { RouterProvider } from "react-router-dom";
import router from "./routes/AppRouter";
import { Toaster } from "react-hot-toast";

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
