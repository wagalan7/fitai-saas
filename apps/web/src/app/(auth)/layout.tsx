import { Dumbbell } from 'lucide-react';
import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 bg-primary-500 rounded-xl flex items-center justify-center">
              <Dumbbell size={22} className="text-white" />
            </div>
            <span className="text-white font-bold text-2xl">FitAI</span>
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
