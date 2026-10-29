import { CheckCircle } from 'lucide-react';

interface SuccessDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
}

export function SuccessDialog({ isOpen, onClose, title, message }: SuccessDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white border border-[#E7E5E4] rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 mb-4 text-emerald-500">
          <CheckCircle className="w-6 h-6" />
          <h3 className="text-lg font-bold text-[#111827]">{title}</h3>
        </div>
        <p className="text-[#111827] text-sm mb-6">{message}</p>
        <div className="flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-[#111827] bg-blue-600 hover:bg-blue-500 rounded-lg transition-all focus:ring-2 focus:ring-blue-500">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
