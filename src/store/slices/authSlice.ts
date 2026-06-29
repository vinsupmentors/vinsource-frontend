import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '@/lib/api';
import { User } from '@/types';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
}

const savedToken = localStorage.getItem('hrms_token');

const initialState: AuthState = {
  user: null,
  token: savedToken,
  loading: false,
  error: null,
};

export const login = createAsyncThunk(
  'auth/login',
  async (creds: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const { data } = await api.post('/api/auth/login', creds);
      localStorage.setItem('hrms_token', data.data.token);
      localStorage.setItem('hrms_refresh_token', data.data.refreshToken);
      return data.data;
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      return rejectWithValue(e.response?.data?.message || 'Login failed');
    }
  }
);

export const fetchMe = createAsyncThunk('auth/fetchMe', async (_, { rejectWithValue }) => {
  try {
    const { data } = await api.get('/api/auth/me');
    // Response: { success: true, data: { id, email, role, employee: {...} } }
    return (data.data ?? data) as User;
  } catch {
    return rejectWithValue('Session expired');
  }
});

export const logout = createAsyncThunk('auth/logout', async () => {
  await api.post('/api/auth/logout').catch(() => {});
  localStorage.removeItem('hrms_token');
  localStorage.removeItem('hrms_refresh_token');
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // login
      .addCase(login.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false;
        state.token = action.payload.token;
        // Intentionally do NOT set state.user from the login response — it's a
        // minimal subset (no isTrainer, department, designation, etc.). Leaving
        // user null here lets useAuth's effect immediately call fetchMe(), which
        // hits /api/auth/me and returns the full profile (isTrainer included).
        // Setting it here was the cause of "My Training" needing a hard refresh
        // to appear: user became truthy right after login, so fetchMe never ran
        // until the next full page load reset Redux state.
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // fetchMe
      .addCase(fetchMe.fulfilled, (state, action) => {
        state.user = action.payload;
      })
      .addCase(fetchMe.rejected, (state) => {
        state.token = null;
        state.user = null;
      })
      // logout
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.token = null;
      });
  },
});

export const { clearError } = authSlice.actions;
export default authSlice.reducer;
