import { useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '@/store';
import { fetchMyAccess } from '@/store/slices/accessSlice';
import { ModuleName, AccessLevel } from '@/types';

const LEVEL_RANK: Record<AccessLevel, number> = { NONE: 0, VIEW: 1, EDIT: 2, ADMIN: 3 };

/**
 * Drives module-gated UI (sidebar nav, route guards) from the current user's
 * effective access map — department defaults overridden by per-user grants,
 * as computed server-side by GET /api/access/me.
 */
export const useModuleAccess = () => {
  const dispatch = useDispatch<AppDispatch>();
  const token = useSelector((s: RootState) => s.auth.token);
  const { modules, canManageAccess, loaded, loading } = useSelector((s: RootState) => s.access);

  useEffect(() => {
    if (token && !loaded && !loading) {
      dispatch(fetchMyAccess());
    }
  }, [token, loaded, loading, dispatch]);

  const hasModule = useCallback(
    (module: ModuleName, minLevel: AccessLevel = 'VIEW') => {
      const level = modules[module];
      if (!level) return false;
      return LEVEL_RANK[level] >= LEVEL_RANK[minLevel];
    },
    [modules]
  );

  return { modules, canManageAccess, loaded, loading, hasModule };
};
