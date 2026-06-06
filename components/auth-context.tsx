"use client";

import { createContext, useContext } from "react";
import type { User } from "firebase/auth";
import type { UserProfile } from "@/lib/admin-profile";

export interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isGlobalAdmin: boolean;
  isOfflineSession: boolean;
  signIn: () => Promise<void>;
  signInOffline: () => Promise<void>;
  logOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isGlobalAdmin: false,
  isOfflineSession: false,
  signIn: async () => {},
  signInOffline: async () => {},
  logOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);
