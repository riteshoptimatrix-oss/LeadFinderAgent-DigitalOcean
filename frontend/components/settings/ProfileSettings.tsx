'use client';

import React, { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { Loader2, Camera, Upload, Building2, Phone, Mail, User as UserIcon, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/src/features/auth/store';

const profileSchema = z.object({
  full_name: z.string().min(2, 'Full name must be at least 2 characters').optional().or(z.literal('')),
  company_name: z.string().optional().or(z.literal('')),
  mobile_number: z.string().optional().or(z.literal('')),
  country: z.string().optional().or(z.literal('')),
  state: z.string().optional().or(z.literal('')),
  role: z.string().optional(),
  avatar: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function ProfileSettings({ setHasUnsavedChanges }: { setHasUnsavedChanges: (val: boolean) => void }) {
  const queryClient = useQueryClient();
  const authUser = useAuthStore((state) => state.user);

  const { data: user, isLoading } = useQuery({
    queryKey: ['userProfile'],
    queryFn: async () => {
      const res = await api.get('/users/me');
      return res.data;
    }
  });

  const userRole = (user?.role || authUser?.role || '')?.toLowerCase();
  const isAdmin = userRole === 'admin' || user?.is_superuser === true;

  const { register, handleSubmit, setValue, watch, formState: { errors, isDirty } } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    values: {
      full_name: user?.full_name || '',
      company_name: user?.company_name || '',
      mobile_number: user?.mobile_number || '',
      country: user?.country || '',
      state: user?.state || '',
      role: user?.role || 'USER', 
      avatar: user?.avatar || '',
    }
  });

  const avatar = watch('avatar');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setValue('avatar', reader.result as string, { shouldDirty: true });
      };
      reader.readAsDataURL(file);
    }
  };

  const removeAvatar = () => {
    setValue('avatar', '', { shouldDirty: true });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  React.useEffect(() => {
    setHasUnsavedChanges(isDirty);
  }, [isDirty, setHasUnsavedChanges]);

  const mutation = useMutation({
    mutationFn: async (data: ProfileFormValues) => {
      const res = await api.put('/users/me', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
      toast.success('Profile updated successfully.');
      setHasUnsavedChanges(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to update profile.');
    }
  });

  const onSubmit = (data: ProfileFormValues) => {
    const payload = { ...data };
    if (!isAdmin) {
      delete payload.role;
    }
    mutation.mutate(payload);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Profile Settings</h2>
        <p className="text-sm text-gray-500 mt-1">Manage your public profile and personal details.</p>
      </div>

      <form id="profile-form" onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        
        {/* Personal Details */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-6 py-5 bg-gray-50/50">
            <h3 className="text-sm font-bold text-gray-900">Personal Information</h3>
          </div>
          <div className="p-6 sm:p-8 space-y-6">
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    {...register('full_name')}
                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition-all focus:border-gray-300 focus:ring-4 focus:ring-gray-100"
                    placeholder="Rajesh Kumar"
                  />
                </div>
                {errors.full_name && <p className="mt-1.5 text-xs text-red-500">{errors.full_name.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="email"
                    disabled
                    value={user?.email || ''}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm text-gray-500 cursor-not-allowed outline-none"
                  />
                </div>
                <p className="mt-1.5 text-xs text-gray-400">Email address cannot be changed.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Company Name</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    {...register('company_name')}
                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition-all focus:border-gray-300 focus:ring-4 focus:ring-gray-100"
                    placeholder="TCS Limited"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="tel"
                    {...register('mobile_number')}
                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition-all focus:border-gray-300 focus:ring-4 focus:ring-gray-100"
                    placeholder="+91 98765 43210"
                  />
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Country</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    {...register('country')}
                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition-all focus:border-gray-300 focus:ring-4 focus:ring-gray-100"
                    placeholder="India"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">State/Province</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    {...register('state')}
                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition-all focus:border-gray-300 focus:ring-4 focus:ring-gray-100"
                    placeholder="Maharashtra"
                  />
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Account Role</label>
                <div className="relative">
                  <ShieldAlert className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  {isAdmin ? (
                    <select
                      {...register('role')}
                      className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition-all focus:border-gray-300 focus:ring-4 focus:ring-gray-100 appearance-none"
                    >
                      <option value="ADMIN">Administrator</option>
                      <option value="MANAGER">Manager</option>
                      <option value="VIEWER">Viewer</option>
                      <option value="USER">User</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      disabled
                      value={
                        user?.role
                          ? user.role.charAt(0).toUpperCase() + user.role.slice(1).toLowerCase()
                          : 'User'
                      }
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm text-gray-500 cursor-not-allowed outline-none font-medium"
                    />
                  )}
                </div>
                <p className="mt-1.5 text-xs text-gray-400">
                  {isAdmin
                    ? 'Determines your access level and permissions within the workspace.'
                    : 'Account role is managed by administrators and cannot be changed.'}
                </p>
              </div>
            </div>

          </div>
          
          <div className="border-t border-gray-100 bg-gray-50/50 px-6 py-4 flex justify-end">
            <button
              type="submit"
              disabled={!isDirty || mutation.isPending}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-blue-700 disabled:opacity-50 shadow-sm active:scale-95"
            >
              {mutation.isPending ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}
