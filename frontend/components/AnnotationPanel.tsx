"use client";

import React, { useState } from 'react';
import { AnnotationToolbar } from './AnnotationToolbar';
import { UiToolType } from '@/lib/utils/cornerstone3DInit';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

// Note: We're not directly importing AnnotationManager since it has linter errors
// that need to be fixed. In a real implementation, you would import it:
// import { AnnotationManager } from './AnnotationManager';

interface AnnotationPanelProps {
  toolGroupId: string;
  studyId?: string;
  userId?: string;
  className?: string;
  onToolChange?: (tool: UiToolType) => void;
}

/**
 * AnnotationPanel - Combines annotation toolbar and management capabilities
 * 
 * This component serves as an example of how to integrate the AnnotationToolbar
 * with the AnnotationManager in a dialog-based UI pattern.
 */
export function AnnotationPanel({
  toolGroupId,
  studyId = '',
  userId = '',
  className,
  onToolChange
}: AnnotationPanelProps) {
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<UiToolType>('pan');
  
  const handleToolChange = (tool: UiToolType) => {
    setActiveTool(tool);
    if (onToolChange) {
      onToolChange(tool);
    }
  };
  
  const toggleManager = () => {
    setIsManagerOpen(!isManagerOpen);
  };
  
  return (
    <div className={cn('annotation-panel', className)}>
      <AnnotationToolbar
        toolGroupId={toolGroupId}
        studyId={studyId}
        userId={userId}
        onToolChange={handleToolChange}
        onShowAnnotationManager={toggleManager}
      />
      
      {/* Annotation Manager Dialog */}
      <Dialog open={isManagerOpen} onOpenChange={setIsManagerOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Manage Annotations</DialogTitle>
          </DialogHeader>
          
          <div className="py-4">
            {/* When the AnnotationManager component is ready, uncomment this: */}
            {/* 
            <AnnotationManager
              toolGroupId={toolGroupId}
              studyId={studyId}
              userId={userId}
            />
            */}
            
            {/* Placeholder message */}
            <div className="text-center p-8 text-muted-foreground">
              Annotation Manager component will appear here.
              <br />
              Fix linter errors in AnnotationManager.tsx before using it.
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
} 