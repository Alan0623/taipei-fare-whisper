import { createBrowserRouter, Navigate, type RouteObject } from "react-router";

import { RequireAuth } from "@/components/require-auth";
import AppPage from "@/pages/app";
import Home from "@/pages/home";
import { ErrorComponent, NotFoundComponent, RootComponent } from "@/pages/root";
import SignIn from "@/pages/signin";
import SignUp from "@/pages/signup";

export const routes: RouteObject[] = [
  {
    element: <RootComponent />,
    errorElement: <ErrorComponent />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/signin", element: <SignIn /> },
      { path: "/signup", element: <SignUp /> },
      { path: "/sign-in", element: <Navigate to="/signin" replace /> },
      { path: "/sign-up", element: <Navigate to="/signup" replace /> },
      {
        element: <RequireAuth />,
        children: [{ path: "/app", element: <AppPage /> }],
      },
      { path: "*", element: <NotFoundComponent /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
