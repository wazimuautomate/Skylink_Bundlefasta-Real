import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface TooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
}

export function Tooltip({ children, content }: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div 
      className="relative flex items-center justify-center"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      {children}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-[calc(100%+8px)] z-50 w-64 p-3 rounded-xl bg-brand-text text-brand-bg shadow-xl pointer-events-none origin-bottom"
          >
            <div className="text-sm font-medium">{content}</div>
            
            {/* Arrow */}
            <div 
              className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-brand-text"
              style={{ transformOrigin: 'top center' }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
