import { createContext, useContext, useEffect, useState } from 'react';
    import { User } from '@supabase/supabase-js';
    import { supabase } from './supabase';

    interface UserContextType {
      user: User | null;
      isAdmin: boolean; // Added isAdmin state
      loading: boolean;
    }

    const UserContext = createContext<UserContextType>({ user: null, isAdmin: false, loading: true });

    export function UserProvider({ children }: { children: React.ReactNode }) {
      const [user, setUser] = useState<User | null>(null);
      const [isAdmin, setIsAdmin] = useState<boolean>(false); // State for admin status
      const [loading, setLoading] = useState(true);

      useEffect(() => {
        let isMounted = true; // Prevent state updates on unmounted component

        const fetchUserAndAdminStatus = async (currentUser: User | null) => {
          if (!isMounted) return;

          setUser(currentUser);
          if (currentUser) {
            try {
              // Call the is_admin function via RPC
              const { data, error } = await supabase.rpc('is_admin');
              if (error) {
                console.error('Error fetching admin status:', error);
                if (isMounted) setIsAdmin(false);
              } else {
                if (isMounted) setIsAdmin(data === true); // Ensure it's explicitly true
              }
            } catch (rpcError) {
              console.error('RPC call failed:', rpcError);
              if (isMounted) setIsAdmin(false);
            } finally {
               if (isMounted) setLoading(false);
            }
          } else {
            // No user, not admin, loading finished
            if (isMounted) {
              setIsAdmin(false);
              setLoading(false);
            }
          }
        };

        // Get initial session and check admin status
        supabase.auth.getSession().then(({ data: { session } }) => {
          fetchUserAndAdminStatus(session?.user ?? null);
        });

        // Listen for auth changes and re-check admin status
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
          // Reset loading state when auth changes
          if (isMounted) setLoading(true);
          fetchUserAndAdminStatus(session?.user ?? null);
        });

        // Cleanup function
        return () => {
          isMounted = false;
          subscription.unsubscribe();
        };
      }, []); // Run only once on mount

      return (
        <UserContext.Provider value={{ user, isAdmin, loading }}>
          {children}
        </UserContext.Provider>
      );
    }

    export function useUser() {
      return useContext(UserContext);
    }
