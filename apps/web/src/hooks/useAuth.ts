import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

interface LoginData { email: string; password: string }
interface RegisterData { name: string; email: string; password: string }

export function useLogin() {
  const { login } = useAuthStore();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (data: LoginData) => {
      const res = await api.post('/auth/login', data);
      return res.data.data as { accessToken: string; user: { id: string; email: string; name: string; role: string } };
    },
    onSuccess: (data) => {
      login(data.user, data.accessToken);
      navigate('/dashboard');
    },
  });
}

export function useRegister() {
  const { login } = useAuthStore();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (data: RegisterData) => {
      const res = await api.post('/auth/register', data);
      return res.data.data as { accessToken: string; user: { id: string; email: string; name: string; role: string } };
    },
    onSuccess: (data) => {
      login(data.user, data.accessToken);
      navigate('/dashboard');
    },
  });
}

export function useLogout() {
  const { logout } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSettled: () => {
      logout();
      queryClient.clear();
      navigate('/login');
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) => api.post('/auth/forgot-password', { email }),
  });
}

export function useResetPassword() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (data: { token: string; password: string }) => api.post('/auth/reset-password', data),
    onSuccess: () => navigate('/login'),
  });
}
