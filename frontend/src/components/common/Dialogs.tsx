import { AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { cn } from './StatusBadge';

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
}

export function ConfirmationDialog({
  isOpen, onClose, onConfirm, title, message, confirmText = "Confirm", cancelText = "Cancel", isLoading
}: DialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white border border-[#E7E5E4] rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 mb-4 text-blue-400">
          <Info className="w-6 h-6" />
          <h3 className="text-lg font-bold text-[#111827]">{title}</h3>
        </div>
        <p className="text-[#111827] text-sm mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} disabled={isLoading} className="px-4 py-2 text-sm font-medium text-[#111827] hover:text-[#111827] transition-colors">
            {cancelText}
          </button>
          <button onClick={onConfirm} disabled={isLoading} className="px-4 py-2 text-sm font-medium text-[#111827] bg-blue-600 hover:bg-blue-500 rounded-lg transition-all focus:ring-2 focus:ring-blue-500 flex items-center gap-2">
            {isLoading && <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DeleteDialog({
  isOpen, onClose, onConfirm, title = "Delete Item", message = "Are you sure you want to delete this? This action cannot be undone.", isLoading
}: Omit<DialogProps, 'title' | 'message'> & { title?: string, message?: string }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white border border-[#E7E5E4] rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 mb-4 text-red-500">
          <AlertTriangle className="w-6 h-6" />
          <h3 className="text-lg font-bold text-[#111827]">{title}</h3>
        </div>
        <p className="text-[#111827] text-sm mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} disabled={isLoading} className="px-4 py-2 text-sm font-medium text-[#111827] hover:text-[#111827] transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={isLoading} className="px-4 py-2 text-sm font-medium text-[#111827] bg-red-600 hover:bg-red-500 rounded-lg transition-all focus:ring-2 focus:ring-red-500 flex items-center gap-2">
            {isLoading && <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
