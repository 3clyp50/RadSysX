"use client";

import React, { useState, useEffect } from 'react';
import { CustomToolButton, CustomToolGroup } from './CustomToolButton';
import {
  Ruler,
  Square,
  CircleDot,
  Circle,
  Compass,
  MousePointer,
  Hand,
  ZoomIn,
  Eye,
  Crosshair,
  RotateCcw,
  ListIcon,
  Trash
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  setToolActive,
  UiToolType,
  mapUiToolToCornerstone3D
} from '@/lib/utils/cornerstone3DInit';
import { Button } from '@/components/ui/button';
import { annotationManagerService } from '@/lib/services/cornerstone/annotationManager';

interface AnnotationToolbarProps {
  toolGroupId: string;
  className?: string;
  onToolChange?: (tool: UiToolType) => void;
  studyId?: string;
  userId?: string;
  onShowAnnotationManager?: () => void;
}

export function AnnotationToolbar({
  toolGroupId,
  className,
  onToolChange,
  studyId,
  userId,
  onShowAnnotationManager
}: AnnotationToolbarProps) {
  const [activeTool, setActiveTool] = useState<UiToolType>('pan');
  const [annotationCount, setAnnotationCount] = useState<number>(0);
  
  // Initialize annotationManager and monitor annotations
  useEffect(() => {
    if (toolGroupId) {
      // Initialize annotation manager service
      annotationManagerService.initialize(toolGroupId);
      
      // Set up interval to refresh annotation count
      const intervalId = setInterval(() => {
        const annotations = annotationManagerService.getAnnotations(toolGroupId);
        setAnnotationCount(annotations.length);
      }, 2000);
      
      return () => {
        clearInterval(intervalId);
      };
    }
  }, [toolGroupId]);
  
  // Load annotations when studyId changes
  useEffect(() => {
    if (toolGroupId && studyId) {
      const loadAnnotations = async () => {
        await annotationManagerService.loadAnnotations(toolGroupId, studyId);
        const annotations = annotationManagerService.getAnnotations(toolGroupId);
        setAnnotationCount(annotations.length);
      };
      
      loadAnnotations();
    }
  }, [toolGroupId, studyId]);
  
  const handleToolChange = (tool: UiToolType) => {
    setActiveTool(tool);
    
    // If the tool is a valid tool, set it active in Cornerstone
    if (tool) {
      const toolName = mapUiToolToCornerstone3D(tool);
      setToolActive(toolGroupId, toolName, { mouseButton: 1 });
    }
    
    // Call the onToolChange callback if provided
    if (onToolChange) {
      onToolChange(tool);
    }
  };
  
  const handleSaveAnnotations = async () => {
    if (toolGroupId && studyId && userId) {
      try {
        await annotationManagerService.saveAnnotations(toolGroupId, studyId, userId);
        console.log('Annotations saved successfully');
      } catch (error) {
        console.error('Failed to save annotations:', error);
      }
    } else {
      console.warn('Cannot save annotations: Missing toolGroupId, studyId, or userId');
    }
  };
  
  const handleClearAnnotations = async () => {
    if (toolGroupId) {
      try {
        const annotations = annotationManagerService.getAnnotations(toolGroupId);
        
        // Delete each annotation
        for (const annotation of annotations) {
          annotationManagerService.deleteAnnotation(toolGroupId, annotation.annotationUID);
        }
        
        setAnnotationCount(0);
        console.log('Annotations cleared');
      } catch (error) {
        console.error('Failed to clear annotations:', error);
      }
    }
  };
  
  return (
    <div className={cn('annotation-toolbar p-4 bg-card border rounded-md', className)}>
      <div className="flex justify-between items-center mb-3">
        <div className="text-sm font-medium">Annotation Tools</div>
        
        <div className="flex gap-2">
          {annotationCount > 0 && (
            <Button 
              variant="outline" 
              size="sm" 
              title="Clear all annotations"
              className="flex items-center"
              onClick={handleClearAnnotations}
            >
              <Trash size={14} />
            </Button>
          )}
          
          {studyId && userId && annotationCount > 0 && (
            <Button 
              variant="outline" 
              size="sm" 
              title="Save annotations"
              className="flex items-center"
              onClick={handleSaveAnnotations}
            >
              Save
            </Button>
          )}
          
          {onShowAnnotationManager && (
            <Button 
              variant="outline" 
              size="sm" 
              className="flex items-center gap-1"
              onClick={onShowAnnotationManager}
            >
              <ListIcon size={14} />
              <span>Manage</span>
            </Button>
          )}
        </div>
      </div>
      
      <CustomToolGroup title="Annotation Tools">
        <CustomToolButton 
          icon={Ruler} 
          label="Distance Measurement" 
          active={activeTool === 'distance'} 
          onClick={() => handleToolChange('distance')}
        />
        <CustomToolButton 
          icon={Square} 
          label="Rectangle ROI" 
          active={activeTool === 'rectangleRoi'} 
          onClick={() => handleToolChange('rectangleRoi')}
        />
        <CustomToolButton 
          icon={CircleDot} 
          label="Elliptical ROI" 
          active={activeTool === 'ellipticalRoi'} 
          onClick={() => handleToolChange('ellipticalRoi')}
        />
        <CustomToolButton 
          icon={Circle} 
          label="Circle ROI" 
          active={activeTool === 'circleRoi'} 
          onClick={() => handleToolChange('circleRoi')}
        />
        <CustomToolButton 
          icon={Compass} 
          label="Angle Measurement" 
          active={activeTool === 'angle'} 
          onClick={() => handleToolChange('angle')}
        />
        <CustomToolButton 
          icon={MousePointer} 
          label="Probe Tool" 
          active={activeTool === 'profile'} 
          onClick={() => handleToolChange('profile')}
        />
        <CustomToolButton 
          icon={Crosshair} 
          label="Crosshairs" 
          active={activeTool === 'crosshairs'} 
          onClick={() => handleToolChange('crosshairs')}
        />
      </CustomToolGroup>
      
      <CustomToolGroup title="Navigation Tools">
        <CustomToolButton 
          icon={Hand} 
          label="Pan" 
          active={activeTool === 'pan'} 
          onClick={() => handleToolChange('pan')}
        />
        <CustomToolButton 
          icon={ZoomIn} 
          label="Zoom" 
          active={activeTool === 'zoom'} 
          onClick={() => handleToolChange('zoom')}
        />
        <CustomToolButton 
          icon={Eye} 
          label="Adjust Window/Level" 
          active={activeTool === 'window'} 
          onClick={() => handleToolChange('window')}
        />
        <CustomToolButton 
          icon={RotateCcw} 
          label="Volume Rotate" 
          active={activeTool === 'volumeRotate'} 
          onClick={() => handleToolChange('volumeRotate')}
        />
      </CustomToolGroup>
      
      <div className="mt-4 text-xs flex justify-between items-center">
        <span className="text-muted-foreground">
          Selected: {activeTool ? activeTool.charAt(0).toUpperCase() + activeTool.slice(1) : 'None'}
        </span>
        
        {annotationCount > 0 && (
          <span className="text-muted-foreground">
            {annotationCount} annotation{annotationCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  );
} 