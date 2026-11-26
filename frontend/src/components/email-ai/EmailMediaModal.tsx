'use client';

import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import {
  X,
  Upload,
  Image as ImageIcon,
  Video,
  Play,
  Film,
  Trash2,
  ExternalLink,
  Check,
  Loader2,
  FolderOpen,
  Link as LinkIcon,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/src/lib/utils';

interface MediaItem {
  id: string;
  filename: string;
  original_name: string;
  media_type: 'image' | 'video';
  mime_type: string;
  size_bytes: number;
  url: string;
  created_at: string;
}

interface EmailMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertHtml: (html: string) => void;
}

export default function EmailMediaModal({
  isOpen,
  onClose,
  onInsertHtml
}: EmailMediaModalProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'image' | 'video' | 'library'>('image');

  // --- Image Tab State ---
  const [imageUrl, setImageUrl] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [imageLink, setImageLink] = useState('');
  const [imageWidth, setImageWidth] = useState<'100%' | '480px' | '240px'>('100%');
  const [imageAlign, setImageAlign] = useState<'center' | 'left' | 'right'>('center');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // --- Video Tab State ---
  const [videoUrl, setVideoUrl] = useState('');
  const [videoTitle, setVideoTitle] = useState('Watch Video Presentation');
  const [videoDesc, setVideoDesc] = useState('Click to play video in your browser');
  const [videoTheme, setVideoTheme] = useState<'dark' | 'blue' | 'purple'>('dark');
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Fetch Media Library
  const { data: mediaLibrary = [], isLoading: isLoadingLibrary, refetch: refetchLibrary } = useQuery<MediaItem[]>({
    queryKey: ['email-media-library'],
    queryFn: async () => {
      const res = await api.get('/media');
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: isOpen,
    staleTime: 10000,
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/media/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-media-library'] });
      toast.success('Media file deleted');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to delete media');
    }
  });

  if (!isOpen) return null;

  // Handle Image File Upload
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      toast.error('Image exceeds maximum allowed size of 15MB');
      return;
    }

    setIsUploadingImage(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post('/media/upload', formData);
      const data: MediaItem = res.data;
      setImageUrl(data.url);
      if (!imageAlt) setImageAlt(file.name.replace(/\.[^/.]+$/, ''));
      queryClient.invalidateQueries({ queryKey: ['email-media-library'] });
      toast.success('Image uploaded successfully!');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to upload image');
    } finally {
      setIsUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  // Handle Video File Upload
  const handleVideoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 60 * 1024 * 1024) {
      toast.error('Video exceeds maximum allowed size of 60MB');
      return;
    }

    setIsUploadingVideo(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post('/media/upload', formData);
      const data: MediaItem = res.data;
      setVideoUrl(data.url);
      if (!videoTitle || videoTitle === 'Watch Video Presentation') {
        setVideoTitle(file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '));
      }
      queryClient.invalidateQueries({ queryKey: ['email-media-library'] });
      toast.success('Video uploaded successfully!');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to upload video');
    } finally {
      setIsUploadingVideo(false);
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
  };

  // Generate Image HTML
  const handleInsertImage = () => {
    if (!imageUrl.trim()) {
      toast.error('Please upload an image or provide an Image URL');
      return;
    }

    const cleanUrl = imageUrl.trim();
    const altText = imageAlt.trim() || 'Email Image';
    const linkTarget = imageLink.trim();

    let imgTag = `<img src="${cleanUrl}" alt="${altText}" style="max-width: 100%; width: ${imageWidth}; height: auto; border-radius: 8px; display: inline-block; border: 0; outline: none;" />`;

    if (linkTarget) {
      imgTag = `<a href="${linkTarget}" target="_blank" style="display: inline-block; text-decoration: none;">${imgTag}</a>`;
    }

    const containerHtml = `<div style="text-align: ${imageAlign}; margin: 18px 0;">\n  ${imgTag}\n</div>\n`;

    onInsertHtml(containerHtml);
    toast.success('Image inserted into template!');
    onClose();
  };

  // Generate Video Card HTML (Email-safe standard across Gmail, Outlook, Apple Mail)
  const handleInsertVideo = () => {
    if (!videoUrl.trim()) {
      toast.error('Please upload a video or enter a Video Link (YouTube, Vimeo, MP4, Loom)');
      return;
    }

    const cleanVideoUrl = videoUrl.trim();
    const title = videoTitle.trim() || 'Watch Video';
    const desc = videoDesc.trim() || 'Click to watch in browser';

    let bgGradient = 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)';
    let borderColor = '#334155';
    let playBtnColor = '#2563eb';
    let playGlow = 'rgba(37,99,235,0.35)';

    if (videoTheme === 'blue') {
      bgGradient = 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)';
      borderColor = '#3b82f6';
      playBtnColor = '#ffffff';
      playGlow = 'rgba(255,255,255,0.3)';
    } else if (videoTheme === 'purple') {
      bgGradient = 'linear-gradient(135deg, #3b0764 0%, #581c87 100%)';
      borderColor = '#9333ea';
      playBtnColor = '#a855f7';
      playGlow = 'rgba(168,85,247,0.35)';
    }

    const videoCardHtml = `
<div style="text-align: center; margin: 24px 0;">
  <a href="${cleanVideoUrl}" target="_blank" style="display: inline-block; text-decoration: none; max-width: 520px; width: 100%; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <div style="background: ${bgGradient}; border-radius: 14px; padding: 30px 20px; text-align: center; border: 1px solid ${borderColor}; box-shadow: 0 4px 16px rgba(0,0,0,0.22);">
      <div style="width: 58px; height: 58px; line-height: 58px; border-radius: 50%; background: ${playBtnColor}; color: #ffffff; font-size: 24px; margin: 0 auto 12px auto; box-shadow: 0 0 0 6px ${playGlow}; text-align: center;">&#9658;</div>
      <div style="font-weight: 700; font-size: 16px; color: #ffffff; margin-bottom: 5px; line-height: 1.3;">${title}</div>
      <div style="font-size: 13px; color: #cbd5e1; line-height: 1.4;">${desc}</div>
      <div style="display: inline-block; margin-top: 14px; padding: 6px 14px; background: rgba(255,255,255,0.15); border-radius: 6px; font-size: 11px; font-weight: 600; color: #ffffff; letter-spacing: 0.5px;">&#9654; Click to Watch Video</div>
    </div>
  </a>
</div>
`;

    onInsertHtml(videoCardHtml);
    toast.success('Video card inserted into template!');
    onClose();
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" /> Insert Media (Images & Videos)
            </h3>
            <p className="text-xs text-slate-500">
              Upload files or embed links. Formatted cleanly for Gmail, Outlook, and mobile mail clients.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-white px-6">
          <button
            onClick={() => setActiveTab('image')}
            className={cn(
              "flex items-center gap-2 py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer",
              activeTab === 'image'
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            <ImageIcon className="w-4 h-4" /> Upload Image
          </button>
          <button
            onClick={() => setActiveTab('video')}
            className={cn(
              "flex items-center gap-2 py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer",
              activeTab === 'video'
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            <Video className="w-4 h-4" /> Upload / Embed Video
          </button>
          <button
            onClick={() => setActiveTab('library')}
            className={cn(
              "flex items-center gap-2 py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer",
              activeTab === 'library'
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            <FolderOpen className="w-4 h-4" /> Media Library ({mediaLibrary.length})
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          
          {/* TAB 1: IMAGE */}
          {activeTab === 'image' && (
            <div className="space-y-4">
              {/* Upload Drop Zone */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  1. Upload from Computer (PNG, JPG, GIF, WebP up to 15MB)
                </label>
                <div
                  onClick={() => imageInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 hover:border-blue-400 bg-slate-50 hover:bg-blue-50/40 rounded-xl p-5 text-center cursor-pointer transition-all group"
                >
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileChange}
                    className="hidden"
                  />
                  {isUploadingImage ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-2">
                      <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                      <span className="text-xs font-semibold text-blue-600">Uploading image to server...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <div className="p-2.5 rounded-full bg-blue-100/60 text-blue-600 group-hover:scale-105 transition-transform">
                        <Upload className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-bold text-slate-800">
                        Click to select image or drag & drop here
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Max 15MB · Auto-optimized for email rendering
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Or Paste Direct Image URL */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Or Paste External Image URL
                </label>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://example.com/images/banner.png"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {/* Alt Text & Click-Through Link */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Alt Text (Description)
                  </label>
                  <input
                    type="text"
                    value={imageAlt}
                    onChange={(e) => setImageAlt(e.target.value)}
                    placeholder="e.g. Special Offer Banner"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Click Link (Optional URL)
                  </label>
                  <input
                    type="url"
                    value={imageLink}
                    onChange={(e) => setImageLink(e.target.value)}
                    placeholder="https://yourwebsite.com/promo"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              {/* Layout: Width Preset & Alignment */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Display Width</label>
                  <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl">
                    {(['100%', '480px', '240px'] as const).map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setImageWidth(w)}
                        className={cn(
                          "py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer",
                          imageWidth === w ? "bg-white text-slate-900 shadow-2xs font-bold" : "text-slate-600 hover:text-slate-900"
                        )}
                      >
                        {w === '100%' ? 'Full Width' : w === '480px' ? 'Medium' : 'Logo/Icon'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Alignment</label>
                  <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl">
                    {(['left', 'center', 'right'] as const).map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => setImageAlign(a)}
                        className={cn(
                          "py-1.5 text-xs font-semibold rounded-lg capitalize transition-all cursor-pointer",
                          imageAlign === a ? "bg-white text-slate-900 shadow-2xs font-bold" : "text-slate-600 hover:text-slate-900"
                        )}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Live Image Preview */}
              {imageUrl && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Preview:</span>
                  <div style={{ textAlign: imageAlign }}>
                    <img
                      src={imageUrl}
                      alt={imageAlt || 'Preview'}
                      style={{ maxWidth: '100%', width: imageWidth, borderRadius: 8 }}
                      className="inline-block border border-slate-200 shadow-2xs"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: VIDEO */}
          {activeTab === 'video' && (
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-blue-800">
                <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Email-Safe Video Playback:</strong> Major email clients (Gmail & Outlook) block inline video players for security. We automatically generate a clickable <strong>Video Player Card</strong> with a play button that opens the video in the recipient's browser.
                </span>
              </div>

              {/* Upload Video File */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  1. Upload Video File (MP4, WebM, MOV up to 60MB)
                </label>
                <div
                  onClick={() => videoInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 hover:border-purple-400 bg-slate-50 hover:bg-purple-50/40 rounded-xl p-5 text-center cursor-pointer transition-all group"
                >
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    onChange={handleVideoFileChange}
                    className="hidden"
                  />
                  {isUploadingVideo ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-2">
                      <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                      <span className="text-xs font-semibold text-purple-600">Uploading video to server...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <div className="p-2.5 rounded-full bg-purple-100/60 text-purple-600 group-hover:scale-105 transition-transform">
                        <Film className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-bold text-slate-800">
                        Click to select video or drag & drop here
                      </span>
                      <span className="text-[11px] text-slate-400">
                        MP4, WebM, or MOV · Max 60MB
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Or Paste Video URL */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Or Paste Video Link (YouTube, Vimeo, Loom, or MP4)
                </label>
                <input
                  type="url"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=... or https://loom.com/share/..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {/* Title & Description */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Video Headline</label>
                  <input
                    type="text"
                    value={videoTitle}
                    onChange={(e) => setVideoTitle(e.target.value)}
                    placeholder="e.g. 2-Minute Product Overview"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Subtitle / Call-to-Action</label>
                  <input
                    type="text"
                    value={videoDesc}
                    onChange={(e) => setVideoDesc(e.target.value)}
                    placeholder="e.g. Click to watch how it works"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              {/* Theme Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Card Theme</label>
                <div className="flex items-center gap-2">
                  {[
                    { key: 'dark', label: 'Dark Slate', cls: 'bg-slate-900 text-white' },
                    { key: 'blue', label: 'Navy Blue', cls: 'bg-blue-900 text-white' },
                    { key: 'purple', label: 'Royal Purple', cls: 'bg-purple-900 text-white' },
                  ].map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setVideoTheme(t.key as any)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                        t.cls,
                        videoTheme === t.key ? "ring-2 ring-offset-2 ring-blue-500 scale-102" : "opacity-80 hover:opacity-100"
                      )}
                    >
                      <Play className="w-3 h-3 fill-current" /> {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Video Card Live Preview */}
              {videoUrl && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Card Preview:</span>
                  <div className="p-4 bg-slate-100 rounded-xl flex justify-center">
                    <div
                      className={cn(
                        "w-full max-w-md rounded-xl p-6 text-center shadow-md",
                        videoTheme === 'dark' ? "bg-slate-900 text-white border border-slate-800" :
                        videoTheme === 'blue' ? "bg-blue-900 text-white border border-blue-800" :
                        "bg-purple-950 text-white border border-purple-800"
                      )}
                    >
                      <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center mx-auto mb-2.5 shadow-lg">
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      </div>
                      <div className="font-bold text-sm text-white mb-1">{videoTitle || 'Watch Video'}</div>
                      <div className="text-xs text-slate-300">{videoDesc || 'Click to play in browser'}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: MEDIA LIBRARY */}
          {activeTab === 'library' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Previously uploaded files available on your server. Click "Insert" to add directly to your template.
                </span>
                <button
                  type="button"
                  onClick={() => refetchLibrary()}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                >
                  Refresh
                </button>
              </div>

              {isLoadingLibrary ? (
                <div className="py-12 flex justify-center text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              ) : mediaLibrary.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  No uploaded media files found yet. Upload an image or video to see it stored here.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
                  {mediaLibrary.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-start justify-between gap-3 hover:border-slate-300 transition-all"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {item.media_type === 'image' ? (
                          <img
                            src={item.url}
                            alt={item.original_name}
                            className="w-12 h-12 object-cover rounded-lg border border-slate-200 shrink-0 bg-white"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                            <Video className="w-6 h-6" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate" title={item.original_name}>
                            {item.original_name}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {item.media_type.toUpperCase()} · {formatFileSize(item.size_bytes)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (item.media_type === 'image') {
                              setImageUrl(item.url);
                              setImageAlt(item.original_name);
                              setActiveTab('image');
                            } else {
                              setVideoUrl(item.url);
                              setVideoTitle(item.original_name.replace(/\.[^/.]+$/, ''));
                              setActiveTab('video');
                            }
                          }}
                          className="px-2 py-1 bg-white hover:bg-blue-50 text-blue-700 text-[11px] font-bold rounded-lg border border-slate-200 shadow-2xs transition-colors cursor-pointer"
                        >
                          Select
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteMutation.mutate(item.id)}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-white transition-colors cursor-pointer"
                          title="Delete from server"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/70">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          {activeTab === 'image' && (
            <button
              type="button"
              onClick={handleInsertImage}
              disabled={!imageUrl || isUploadingImage}
              className={cn(
                "px-5 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-md flex items-center gap-1.5 cursor-pointer",
                imageUrl && !isUploadingImage
                  ? "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"
                  : "bg-slate-300 cursor-not-allowed shadow-none"
              )}
            >
              <Check className="w-4 h-4" /> Insert Image
            </button>
          )}

          {activeTab === 'video' && (
            <button
              type="button"
              onClick={handleInsertVideo}
              disabled={!videoUrl || isUploadingVideo}
              className={cn(
                "px-5 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-md flex items-center gap-1.5 cursor-pointer",
                videoUrl && !isUploadingVideo
                  ? "bg-purple-600 hover:bg-purple-700 shadow-purple-500/20"
                  : "bg-slate-300 cursor-not-allowed shadow-none"
              )}
            >
              <Check className="w-4 h-4" /> Insert Video Card
            </button>
          )}

          {activeTab === 'library' && (
            <button
              type="button"
              onClick={() => setActiveTab('image')}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              Upload New Media
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
