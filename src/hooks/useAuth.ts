import { useSelector, useDispatch } from 'react-redux';
import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { RootState, AppDispatch } from '@/store';
import { login, logout, fetchMe } from '@/store/slices/authSlice';
import { Role } from '@/types';

const ROLE_HIERARCHY: Record<Role, number> = {
  SUPER_ADMIN: 5,
  ADMIN: 4,
  HR: 3,
  MANAGER: 2,
  EMPLOYEE: 1,
  STUDENT: 0,
};

export const useAuth = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { user, token, loading, error } = useSelector((s: RootState) => s.auth);
  const navigate = useNavigate();

  useEffect(() => {
    if (token && !user) {
      dispatch(fetchMe());
    }
  }, [token, user, dispatch]);

  const signIn = async (email: string, password: string) => {
    const result = await dispatch(login({ email, password }));
    if (login.fulfilled.match(result)) {
      navigate('/dashboard');
    }
  };

  const signOut = async () => {
    await dispatch(logout());
    navigate('/login');
  };

  return { user, token, loading, error, signIn, signOut };
};

export const useRole = () => {
  const user = useSelector((s: RootState) => s.auth.user);
  const role = user?.role;

  const can = useCallback(
    (minRole: Role) =>
      (ROLE_HIERARCHY[role as Role] || 0) >= (ROLE_HIERARCHY[minRole] || 0),
    [role]
  );

  return {
    role,
    can,
    isAdmin: can('ADMIN'),
    isSuperAdmin: role === 'SUPER_ADMIN',
    isHR: can('HR'),
    isManager: can('MANAGER'),
    isEmployee: role === 'EMPLOYEE',
  };
};
