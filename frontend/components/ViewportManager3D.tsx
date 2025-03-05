"use client";

import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { DicomViewer3D } from './DicomViewer3D';
import { Toggle, type ToggleProps } from '@/components/ui/Toggle';
import { Layers, Maximize, Minimize, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { UiToolType, canLoadAsVolume } from '@/lib/utils/cornerstone3DInit';
import { ImageToolController } from './ImageToolController';
import { cornerstoneService } from '@/lib/services/cornerstoneService';
import { RenderingEngine, Enums } from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';

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

const RENDERING_ENGINE_ID = 'main-engine';

// Helper function to map UI tools to Cornerstone3D tools
function mapUiToolToCornerstone3D(tool: UiToolType): string {
  const toolMap: Record<string, string> = {
    pan: 'Pan',
    zoom: 'Zoom',
    windowLevel: 'WindowLevel',
    distance: 'Length',
    area: 'RectangleROI',
    profile: 'Probe',
    diagnose: 'RectangleROI',
    statistics: 'RectangleROI',
    segment: 'SphereBrush',
    compare: 'Crosshairs'
  };
  return toolMap[tool] || 'Pan';
}

// Helper function to create a tool group
async function createToolGroup(groupId: string, viewportId: string, renderingEngineId: string) {
  const toolGroup = cornerstoneTools.ToolGroupManager.createToolGroup(groupId);
  
  if (!toolGroup) {
    throw new Error('Failed to create tool group');
  }
  
  // Add tools to group
  const tools = [
    'Pan',
    'Zoom',
    'WindowLevel',
    'Length',
    'RectangleROI',
    'Probe',
    'SphereBrush',
    'Crosshairs'
  ];
  
  tools.forEach(tool => {
    toolGroup.addTool(tool);
  });
  
  // Add viewport to tool group
  toolGroup.addViewport(viewportId, renderingEngineId);
  
  return toolGroup;
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

  // Add ref for rendering engine
  const renderingEngineRef = useRef<RenderingEngine | null>(null);

  // Effect to handle viewport setup
  useEffect(() => {
    if (!isInitialized || !allImageIds.length) return;

    let isCancelled = false;
    const setupId = Math.random().toString(36).substr(2, 9);

    const setupViewports = async () => {
      try {
        console.log(`ViewportManager3D: Starting viewport setup ${setupId}`);

        // Create or get rendering engine
        if (!renderingEngineRef.current) {
          renderingEngineRef.current = new RenderingEngine(RENDERING_ENGINE_ID);
          console.log('ViewportManager3D: Created new rendering engine');
        }

        // Check if setup was cancelled
        if (isCancelled) {
          console.log(`ViewportManager3D: Setup ${setupId} cancelled after engine creation`);
          return;
        }

        // Check if we have a single image or multiple images
        const isSingleImage = allImageIds.length === 1;
        console.log('ViewportManager3D: Image count:', allImageIds.length);

        if (isSingleImage) {
          console.log('ViewportManager3D: Single image detected, using 2D mode');
          try {
            // Load the image first to verify it can be loaded
            await cornerstoneService.validateImages(allImageIds);
            
            // Check if setup was cancelled
            if (isCancelled) {
              console.log(`ViewportManager3D: Setup ${setupId} cancelled after image validation`);
              return;
            }

            setIs2D(true);
            setUse3DViewer(false);
            
            if (onImageLoaded) {
              onImageLoaded(true, true);
            }
          } catch (error) {
            if (isCancelled) return;
            console.error('ViewportManager3D: Failed to validate single image:', error);
            setError('Failed to load image');
            setHasError(true);
            if (onImageLoaded) {
              onImageLoaded(false, true);
            }
          }
          return;
        }

        // For multiple images, check if we can load as volume
        try {
          const isVolumeLoadable = await canLoadAsVolume(allImageIds);
          
          // Check if setup was cancelled
          if (isCancelled) {
            console.log(`ViewportManager3D: Setup ${setupId} cancelled after volume check`);
            return;
          }

          console.log('ViewportManager3D: Volume loading check:', isVolumeLoadable);

          // Update state based on volume capability
          setIs2D(!isVolumeLoadable);
          setUse3DViewer(isVolumeLoadable);

          // Notify parent
          if (onImageLoaded) {
            onImageLoaded(true, !isVolumeLoadable);
          }
        } catch (error) {
          if (isCancelled) return;
          console.error('ViewportManager3D: Error checking volume capability:', error);
          // Default to 2D mode on error
          setIs2D(true);
          setUse3DViewer(false);
          setError('Failed to check volume capability');
          setHasError(true);
          
          if (onImageLoaded) {
            onImageLoaded(false, true);
          }
        }
      } catch (error) {
        if (isCancelled) return;
        console.error('ViewportManager3D: Setup error:', error);
        setError('Failed to set up viewer');
        setHasError(true);
      }
    };

    setupViewports().catch(error => {
      if (!isCancelled) {
        console.error('ViewportManager3D: Setup error:', error);
        setError('Failed to set up viewer');
        setHasError(true);
      }
    });

    // Cleanup function
    return () => {
      isCancelled = true;
      console.log(`ViewportManager3D: Cancelling setup ${setupId}`);
    };
  }, [isInitialized, allImageIds, onImageLoaded]);

  // Effect to handle Cornerstone initialization
  useEffect(() => {
    let isCancelled = false;
    const initId = Math.random().toString(36).substr(2, 9);

    const initializeViewer = async () => {
      try {
        // Skip initialization if no images
        if (!allImageIds.length) {
          setIsInitialized(true);
          return;
        }

        console.log(`ViewportManager3D: Starting initialization ${initId}`);
        await cornerstoneService.initialize();
        
        if (isCancelled) {
          console.log(`ViewportManager3D: Initialization ${initId} cancelled`);
          return;
        }

        setIsInitialized(true);
        console.log('ViewportManager3D: Cornerstone3D initialized');
      } catch (error) {
        if (isCancelled) return;
        console.error('ViewportManager3D: Failed to initialize Cornerstone3D', error);
        setError('Failed to initialize viewer');
        setHasError(true);
        
        if (onImageLoaded) {
          onImageLoaded(false, true);
        }
      }
    };

    if (!isInitialized) {
      initializeViewer().catch(error => {
        if (!isCancelled) {
          console.error('ViewportManager3D: Initialization error:', error);
          setError('Failed to initialize viewer');
          setHasError(true);
        }
      });
    }

    return () => {
      isCancelled = true;
      console.log(`ViewportManager3D: Cancelling initialization ${initId}`);
    };
  }, [isInitialized, allImageIds.length, onImageLoaded]);

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
      setHasError(false);
      setIs2D(is2DImage);
      
      if (onImageLoaded) {
        onImageLoaded(true, is2DImage);
      }
      return;
    }

    // For single images, always treat as 2D regardless of success
    if (allImageIds.length === 1) {
      setHasError(false);
      setIs2D(true);
      setUse3DViewer(false);
      
      if (onImageLoaded) {
        onImageLoaded(true, true);
      }
      return;
    }
    
    // For multiple images, handle based on success and is2DImage flag
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

  // Cleanup effect - moved up with other effects
  useEffect(() => {
    return () => {
      // Cleanup rendering engine
      if (renderingEngineRef.current) {
        try {
          console.log('ViewportManager3D: Destroying rendering engine');
          renderingEngineRef.current.destroy();
          renderingEngineRef.current = null;
        } catch (error) {
          console.error('ViewportManager3D: Error destroying rendering engine:', error);
        }
      }

      // Reset state
      setIsInitialized(false);
      setIs2D(false);
      setUse3DViewer(false);
      setHasError(false);
      setError(null);

      console.log('ViewportManager3D: Cleanup complete');
    };
  }, []); // Empty dependency array since this is cleanup

  // Update the tool effect dependency array
  useEffect(() => {
    const updateTool = async () => {
      if (!isDisabled || !renderingEngineRef.current) return;

      try {
        console.log(`DicomViewer3D: Tool change requested from ${currentTool} to ${activeTool}`);
        
        // Get the tool group
        let toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId);
        
        // If no tool group exists, create one
        if (!toolGroup) {
          console.log(`DicomViewer3D: Creating new tool group ${toolGroupId}`);
          toolGroup = await createToolGroup(
            toolGroupId,
            activeViewport,
            RENDERING_ENGINE_ID
          );
        }

        // Map the UI tool to Cornerstone3D tool name
        const cornerstoneToolName = mapUiToolToCornerstone3D(activeTool);
        console.log(`DicomViewer3D: Mapped UI tool ${activeTool} to Cornerstone3D tool ${cornerstoneToolName}`);

        // Deactivate current tool if it exists
        if (currentTool) {
          const currentCornerstoneToolName = mapUiToolToCornerstone3D(currentTool);
          toolGroup.setToolPassive(currentCornerstoneToolName);
        }

        // Activate new tool using the correct enum
        toolGroup.setToolActive(cornerstoneToolName, {
          bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Primary }]
        });

        setCurrentTool(activeTool);
      } catch (error) {
        console.error('Error updating tool:', error);
      }
    };

    updateTool();
  }, [activeTool, isDisabled]); // Remove renderingEngineRef.current from dependency array

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