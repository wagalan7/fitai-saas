'use client';

import { useEffect, useState } from 'react';
import * as Toast from '@radix-ui/react-toast';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { toast as toastBus, type ToastItem } from '@/lib/toast';

const ICONS = {
  success: <CheckCircle size={18} className="text-green-500 flex-shrink-0" />,
  error: <AlertCircle size={18} className="text-red-500 flex-shrink-0" />,
  info: <Info size={18} className="text-blue-500 flex-shrink-0" />,
};

const BG = {
  success: 'border-green-200 bg-green-50',
  error: 'border-red-200 bg-red-50',
  info: 'border-blue-200 bg-blue-50',
};

const TEXT = {
  success: 'text-green-800',
  error: 'text-red-800',
  info: 'text-blue-800',
};

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const unsub = toastBus.subscribe(setItems);
    return () => { unsub(); };
  }, []);

  return (
    <Toast.Provider swipeDirection="right" duration={Infinity}>
      {items.map((item) => (
        <Toast.Root
          key={item.id}
          open
          className={`
            flex items-start gap-3 w-[360px] max-w-[calc(100vw-32px)]
            border rounded-xl px-4 py-3 shadow-lg
            data-[state=open]:animate-slideIn
            data-[state=closed]:animate-slideOut
            ${BG[item.type]}
          `}
        >
          {ICONS[item.type]}
          <Toast.Description className={`flex-1 text-sm font-medium leading-snug ${TEXT[item.type]}`}>
            {item.message}
          </Toast.Description>
          <Toast.Close className="text-gray-400 hover:text-gray-600 -mt-0.5">
            <X size={15} />
          </Toast.Close>
        </Toast.Root>
      ))}

      <Toast.Viewport className="fixed bottom-20 lg:bottom-6 right-4 flex flex-col gap-2 z-[9999] outline-none" />
    </Toast.Provider>
  );
}
