"use client";

import * as React from 'react';
import { useState, useEffect } from 'react';
import { DicomViewer3D } from './DicomViewer3D';
import { Toggle, type ToggleProps } from '@/components/ui/Toggle';
import { Layers, Maximize, Minimize, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
// Import the UiToolType from the original source
import { UiToolType } from '@/lib/utils/cornerstone3DInit';
import { ImageToolController } from './ImageToolController';
import { cornerstoneService } from '@/lib/services/cornerstoneService';

// Component to show when viewer has error
function ViewerFallback() {
  return (
    <div className="flex items-center justify-center h-full w-full bg-black/10 text-white p-4">
      <div className="flex flex-col items-center text-center max-w-md">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <div className="text-xl font-semibold mb-2">Viewport Error</div>
        <p>There was a problem displaying this image. It may not be compatible with 3D viewing.</p>
      </div>
    </div>
  );
}

// Message when showing 2D image in non-axial view
function TwoDimensionalImageMessage() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white p-4 z-10">
      <div className="bg-gray-800 p-4 rounded-lg max-w-md text-center">
        <div className="font-medium mb-2">2D Image Notice</div>
        <p className="text-sm">This is a 2D image which can only be viewed in axial plane.</p>
      </div>
    </div>
  );
}

// Changed from the imported UiToolType to our local one
type Tool = UiToolType;

interface ViewportManager3DProps {
  imageId?: string;
  imageIds?: string[];
  viewportType: 'AXIAL' | 'SAGITTAL' | 'CORONAL' | '3D' | 'SERIES';
  className?: string;
  activeTool?: UiToolType;
  showTools?: boolean;
  onToolChange?: (tool: UiToolType) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onImageLoaded?: (success: boolean, is2D?: boolean) => void;
}

export function ViewportManager3D({
  imageId,
  imageIds = [],
  viewportType = 'AXIAL',
  className,
  activeTool = 'pan',
  showTools = true,
  onToolChange,
  isExpanded = false,
  onToggleExpand,
  onImageLoaded
}: ViewportManager3DProps) {
  // State for viewport configuration
  const [activeViewport, setActiveViewport] = useState<'AXIAL' | 'SAGITTAL' | 'CORONAL' | '3D'>(
    viewportType === 'SERIES' ? 'AXIAL' : viewportType as 'AXIAL' | 'SAGITTAL' | 'CORONAL' | '3D'
  );
  const [expandedViewport, setExpandedViewport] = useState<'AXIAL' | 'SAGITTAL' | 'CORONAL' | '3D' | null>(null);
  const [hasError, setHasError] = useState(false);
  const [is2D, setIs2D] = useState(false);
  const [use3DViewer, setUse3DViewer] = useState(true);
  const [toolGroupId] = useState<string>(`toolGroup-${Math.random().toString(36).substring(2, 11)}`);
  const [currentTool, setCurrentTool] = useState<UiToolType>(activeTool);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Determine which image IDs to use
  const allImageIds = imageIds.length > 0 ? imageIds : imageId ? [imageId] : [];
  
  // Check if the viewport should be disabled
  const isDisabled = allImageIds.length === 0;

  // Effect to handle initial viewport type and image loading
  useEffect(() => {
    if (allImageIds.length > 0 && !isInitialized) {
      // Initialize cornerstone service once when we first get images
      const initializeViewer = async () => {
        try {
          await cornerstoneService.initialize();
          setIsInitialized(true);
          console.log('ViewportManager3D: Initializing with images:', allImageIds);
        } catch (error) {
          console.error('ViewportManager3D: Failed to initialize Cornerstone3D', error);
          setError('Failed to initialize viewer');
        }
      };
      
      initializeViewer();
    }
  }, [allImageIds, isInitialized]);

  // Effect to update viewport type
  useEffect(() => {
    if (viewportType === 'SERIES') {
      setActiveViewport('AXIAL');
    } else if (viewportType !== activeViewport) {
      setActiveViewport(viewportType);
    }
  }, [viewportType]);
  
  // Handle image load completion
  const handleImageLoaded = (success: boolean, is2DImage: boolean = false) => {
    console.log('ViewportManager3D: Image load result:', { success, is2DImage, imageIdsCount: allImageIds.length });
    
    // Don't show errors if there are no images or during initial load
    if (allImageIds.length === 0) {
      // Don't report an error if no images are loaded yet
      setHasError(false);
      setIs2D(is2DImage);
      
      if (onImageLoaded) {
        onImageLoaded(true, is2DImage);
      }
      return;
    }
    
    setHasError(!success);
    setIs2D(is2DImage);
    
    // If this is a 2D image and we're not in AXIAL view, switch to AXIAL
    if (is2DImage && activeViewport !== 'AXIAL') {
      setActiveViewport('AXIAL');
    }
    
    if (onImageLoaded) {
      onImageLoaded(success, is2DImage);
    }
  };

  // Effect to handle single-slice images appropriately
  useEffect(() => {
    if (is2D) {
      // For 2D images (single slice), only show in AXIAL view
      setActiveViewport('AXIAL');
      
      // Also restrict expandedViewport to AXIAL only
      if (expandedViewport && expandedViewport !== 'AXIAL') {
        setExpandedViewport('AXIAL');
      }
    }
  }, [is2D, expandedViewport]);

  // Toggle 3D viewer
  const toggle3DViewer = () => {
    setUse3DViewer(!use3DViewer);
  };
  
  // Handle viewport activation
  const handleViewportActivate = (viewport: 'AXIAL' | 'SAGITTAL' | 'CORONAL' | '3D') => {
    if (is2D && viewport !== 'AXIAL') {
      return; // Don't allow activation of non-axial viewports for 2D images
    }
    setActiveViewport(viewport);
  };
  
  // Handle viewport expansion
  const handleToggleExpand = (viewport: 'AXIAL' | 'SAGITTAL' | 'CORONAL' | '3D') => {
    if (onToggleExpand) {
      onToggleExpand();
      return;
    }
    
    if (expandedViewport === viewport) {
      setExpandedViewport(null);
    } else {
      setExpandedViewport(viewport);
    }
  };

  // Determine viewport size classes
  const getViewportClasses = (viewport: 'AXIAL' | 'SAGITTAL' | 'CORONAL' | '3D'): string => {
    if (expandedViewport) {
      return expandedViewport === viewport ? 'w-full h-full' : 'hidden';
    }
    if (!showTools) {
      return 'w-full h-full';
    }
    return 'col-span-1 row-span-1';
  };
  
  // Handle tool change internally then call external handler if provided
  const handleToolChangeInternal = (tool: UiToolType) => {
    setCurrentTool(tool);
    
    if (onToolChange) {
      onToolChange(tool);
    }
  };
  
  // Show loading state if not initialized
  if (!isInitialized && allImageIds.length > 0) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-[#4cedff]" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Initializing viewer...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("viewport-manager grid grid-cols-1 md:grid-cols-3 gap-2", className)}>
      {/* Main Content - Viewports */}
      <div className={cn(
        "md:col-span-2 relative", 
        expandedViewport ? "h-full w-full" : 
        !showTools ? "col-span-full md:col-span-full grid grid-cols-2 grid-rows-2 gap-0.5" : // Take full grid when tools are hidden
        (use3DViewer && !is2D) ? "grid grid-cols-2 grid-rows-2 gap-0.5" : "grid grid-cols-1 grid-rows-1"
      )} style={{ position: 'relative' }}>
        {/* Regular grid layout when no viewport is expanded */}
        {!expandedViewport && (
          <>
            {/* AXIAL Viewport */}
            <div className={cn(
              getViewportClasses('AXIAL'),
              !showTools && "col-span-2 row-span-2" // Full grid when tools are hidden
            )} onClick={() => handleViewportActivate('AXIAL')}>
              <div className="relative w-full h-full">
                <DicomViewer3D
                  imageId={imageId}
                  imageIds={allImageIds}
                  viewportType="AXIAL"
                  isActive={activeViewport === 'AXIAL'}
                  isExpanded={expandedViewport === 'AXIAL'}
                  onActivate={() => handleViewportActivate('AXIAL')}
                  onToggleExpand={() => handleToggleExpand('AXIAL')}
                  onImageLoaded={(success, is2d) => handleImageLoaded(success, is2d)}
                  activeTool={currentTool}
                  suppressErrors={is2D}
                  hideExpandButton={false}
                />
              </div>
            </div>
            
            {/* Only show additional viewports if tools are visible and 3D viewer is enabled */}
            {showTools && use3DViewer && !is2D && (
              <>
                {/* Sagittal Viewport */}
                <div className={getViewportClasses('SAGITTAL')} onClick={() => handleViewportActivate('SAGITTAL')}>
                  <div className="relative w-full h-full">
                    <DicomViewer3D
                      imageId={imageId}
                      imageIds={allImageIds}
                      viewportType="SAGITTAL"
                      isActive={activeViewport === 'SAGITTAL'}
                      isExpanded={expandedViewport === 'SAGITTAL'}
                      onActivate={() => handleViewportActivate('SAGITTAL')}
                      onToggleExpand={() => handleToggleExpand('SAGITTAL')}
                      onImageLoaded={(success) => handleImageLoaded(success, false)}
                      activeTool={currentTool}
                      suppressErrors={is2D}
                      hideExpandButton={false}
                    />
                    {is2D && <TwoDimensionalImageMessage />}
                  </div>
                </div>
                
                {/* Coronal Viewport */}
                <div className={getViewportClasses('CORONAL')} onClick={() => handleViewportActivate('CORONAL')}>
                  <div className="relative w-full h-full">
                    <DicomViewer3D
                      imageId={imageId}
                      imageIds={allImageIds}
                      viewportType="CORONAL"
                      isActive={activeViewport === 'CORONAL'}
                      isExpanded={expandedViewport === 'CORONAL'}
                      onActivate={() => handleViewportActivate('CORONAL')}
                      onToggleExpand={() => handleToggleExpand('CORONAL')}
                      onImageLoaded={(success) => handleImageLoaded(success, false)}
                      activeTool={currentTool}
                      suppressErrors={is2D}
                      hideExpandButton={false}
                    />
                    {is2D && <TwoDimensionalImageMessage />}
                  </div>
                </div>
                
                {/* 3D Viewport */}
                <div className={getViewportClasses('3D')} onClick={() => handleViewportActivate('3D')}>
                  <div className="relative w-full h-full">
                    <DicomViewer3D
                      imageId={imageId}
                      imageIds={allImageIds}
                      viewportType="3D"
                      isActive={activeViewport === '3D'}
                      isExpanded={expandedViewport === '3D'}
                      onActivate={() => handleViewportActivate('3D')}
                      onToggleExpand={() => handleToggleExpand('3D')}
                      onImageLoaded={(success) => handleImageLoaded(success, false)}
                      activeTool={currentTool}
                      suppressErrors={is2D}
                      hideExpandButton={false}
                    />
                    {is2D && <TwoDimensionalImageMessage />}
                  </div>
                </div>
              </>
            )}
          </>
        )}
        
        {/* Expanded viewport */}
        {expandedViewport && (
          <div className="absolute inset-0 w-full h-full bg-black z-50">
            <div className="viewport-panel expanded">
              <div className="relative w-full h-full">
                <DicomViewer3D 
                  imageId={imageId}
                  imageIds={allImageIds}
                  viewportType={expandedViewport}
                  isActive={true}
                  isExpanded={true}
                  onActivate={() => {}}
                  onToggleExpand={() => handleToggleExpand(expandedViewport)}
                  onImageLoaded={(success, is2d) => handleImageLoaded(success, is2d)}
                  activeTool={currentTool}
                  suppressErrors={is2D}
                  hideExpandButton={false}
                />
                <div className="viewport-label z-[200] absolute top-2 left-2 px-2 py-1 text-xs font-medium rounded 
                  bg-[#f0f2f5] dark:bg-[#2a3349] text-[#334155] dark:text-[#e2e8f0] 
                  backdrop-blur-sm border border-[#e4e7ec] dark:border-[#4a5583] shadow-sm">
                  {expandedViewport}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Sidebar - Tools */}
      {showTools && (
        <div className="tool-sidebar flex flex-col gap-4">
          <div className="viewport-controls bg-card border rounded-md p-4">
            <div className="text-sm font-semibold mb-4">Viewport Controls</div>
            <button 
              className={cn(
                "px-4 py-2 rounded-md mb-2 w-full text-sm font-medium flex items-center justify-start",
                "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
                use3DViewer && !is2D ? "bg-primary/20" : ""
              )}
              onClick={toggle3DViewer}
              disabled={is2D}
            >
              <Layers className="mr-2 h-4 w-4" />
              3D Multi-planar Reconstruction
            </button>
          </div>
          
          {/* New Tool Controller */}
          <ImageToolController 
            toolGroupId={toolGroupId}
            onToolChange={handleToolChangeInternal}
          />
        </div>
      )}
      
      {/* Error State */}
      {hasError && (
        <div className="col-span-3 bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 mr-2" />
            <p>There was an error loading the image(s).</p>
          </div>
        </div>
      )}
    </div>
  );
} 