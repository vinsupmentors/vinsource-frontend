import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '@/lib/api';
import { EffectiveAccessMap } from '@/types';
import { logout } from './authSlice';

interface AccessState {
  modules: EffectiveAccessMap;
  canManageAccess: boolean;
  loaded: boolean;
  loading: boolean;
  error: string | null;
}

const initialState: AccessState = {
  modules: {},
  canManageAccess: false,
  loaded: false,
  loading: false,
  error: null,
};

export const fetchMyAccess = createAsyncThunk('access/fetchMine', async (_, { rejectWithValue }) => {
  try {
    const { data } = await api.get('/api/access/me');
    return data.data as { modules: EffectiveAccessMap; canManageAccess: boolean };
  } catch (err: unknown) {
    const e = err as { response?: { data?: { message?: string } } };
    return rejectWithValue(e.response?.data?.message || 'Failed to load module access');
  }
});

const accessSlice = createSlice({
  name: 'access',
  initialState,
  reducers: {
    resetAccess(state) {
      state.modules = {};
      state.canManageAccess = false;
      state.loaded = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMyAccess.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMyAccess.fulfilled, (state, action) => {
        state.loading = false;
        state.loaded = true;
        state.modules = action.payload.modules;
        state.canManageAccess = action.payload.canManageAccess;
      })
      .addCase(fetchMyAccess.rejected, (state, action) => {
        state.loading = false;
        state.loaded = true;
        state.error = action.payload as string;
      })
      .addCase(logout.fulfilled, (state) => {
        state.modules = {};
        state.canManageAccess = false;
        state.loaded = false;
      });
  },
});

export const { resetAccess } = accessSlice.actions;
export default accessSlice.reducer;
